// ============================================================================
// execucao-sync.ts — Streaming ETL for Projetos em Execucao
// ============================================================================
//
// Populates projetos_execucao from two government CSV ZIPs:
//   Source 1: siconv_proposta.csv.zip (187MB) — filtered to Projetus clients
//   Source 2: siconv_convenio.csv.zip (15MB)  — joined with matched propostas
//
// Algorithm: Two-step in-memory join
//   STEP A: Load existing_clients CNPJs from DB as Projetus client filter
//   STEP B: Stream proposta, filter by CNPJ match, build Map<id_proposta, info>
//   STEP C: Stream convenio, look up proposta Map, build records
//   STEP D: UPSERT ON CONFLICT (nr_convenio) DO UPDATE
//   STEP E: Log to cron_sync_log with join_miss_count
//
// UPSERT: ON CONFLICT (nr_convenio) — NEVER cnpj alone
// NEVER overwrite fields: (none currently — projetos_execucao has no CRM state)
// ALWAYS update: all data columns + synced_at
//
// Called by: /api/cron/sync-execucao (Phase 15 Plan 02)
// ============================================================================

import { getPool } from '@/lib/db'
import { buildStructuredLeadScopeSql } from '@/lib/crm-scope'
import { cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV, formatPhone } from '@/lib/repo-sync'

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const PROPOSTA_URL = `${REPO_BASE}/siconv_proposta.csv.zip`
const CONVENIO_URL = `${REPO_BASE}/siconv_convenio.csv.zip`

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ExecucaoSyncStats {
  proposta_rows_scanned: number
  osc_rows_kept: number
  convenio_rows_scanned: number
  em_execucao_rows: number
  joined_rows: number
  join_miss_count: number
  inserted: number
  updated: number
  errors: number
  enriched_contacts: number
  duration_ms: number
  memory_peak_mb: number
}

interface PropostaInfo {
  cnpj: string
  nome_proponente: string | null
  objeto: string | null
  uf: string | null
  municipio: string | null
  nr_proposta: string | null
}

interface ExecucaoRecord {
  nr_convenio: string
  id_proposta: string
  nr_proposta: string | null
  situacao: string | null
  modalidade: string | null
  cnpj: string
  nome_proponente: string | null
  objeto: string | null
  uf: string | null
  municipio: string | null
  valor_global: number
  valor_repasse: number
  valor_desembolsado: number
  saldo_conta: number
  valor_empenhado: number
  rendimento_aplicacao: number
  ingresso_contrapartida: number
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  dia_limite_prest_contas: string | null
  dias_prest_contas: number
  ano_referencia: number | null
  pct_execucao: number | null
  dias_em_execucao: number | null
  dias_ate_vencimento: number | null
  alerta_desembolso: boolean
  verificar_saldo: boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseBRDate(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null
  const trimmed = val.trim()
  const parts = trimmed.split('/')
  if (parts.length === 3 && parts[0].length <= 2) {
    // DD/MM/YYYY -> YYYY-MM-DD
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return trimmed  // assume already ISO if not DD/MM/YYYY
}

// ---------------------------------------------------------------------------
// Main ETL function
// ---------------------------------------------------------------------------

export async function syncProjetosExecucao(): Promise<ExecucaoSyncStats> {
  const startTime = Date.now()

  const stats: ExecucaoSyncStats = {
    proposta_rows_scanned: 0,
    osc_rows_kept: 0,
    convenio_rows_scanned: 0,
    em_execucao_rows: 0,
    joined_rows: 0,
    join_miss_count: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    enriched_contacts: 0,
    duration_ms: 0,
    memory_peak_mb: 0,
  }

  // -------------------------------------------------------------------------
  // STEP A: Load Projetus client CNPJs from existing_clients + vendedor_projetos
  // This replaces the hardcoded whitelist — uses the DB as source of truth
  // -------------------------------------------------------------------------
  const pool = getPool()
  const structuredLeadScopeSql = buildStructuredLeadScopeSql('vp')
  const clientCnpjResult = await pool.query<{ cnpj: string }>(`
    SELECT DISTINCT cnpj FROM (
      SELECT cnpj FROM existing_clients
      UNION
      SELECT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj
      FROM vendedor_projetos vp
      WHERE ${structuredLeadScopeSql}
      UNION
      SELECT cnpj FROM tgov_whitelist WHERE cnpj IS NOT NULL
    ) all_cnpjs
    WHERE cnpj IS NOT NULL AND cnpj != ''
  `)
  const projetusCnpjSet = new Set(clientCnpjResult.rows.map(r => r.cnpj))

  // Also accept propostas added directly to TGov whitelist by nr_proposta
  // (covers cases where the user added a CNPJ via the TGov search modal but
  // that CNPJ isn't in existing_clients/vendedor_projetos).
  const whitelistNrResult = await pool.query<{ nr_proposta: string }>(
    `SELECT nr_proposta FROM tgov_whitelist WHERE nr_proposta IS NOT NULL`
  )
  const whitelistNrSet = new Set(whitelistNrResult.rows.map(r => r.nr_proposta.replace(/^0+/, '')))
  console.log(`[execucao-sync] STEP A: ${projetusCnpjSet.size} CNPJs in scope, ${whitelistNrSet.size} nr_propostas in TGov whitelist`)

  // -------------------------------------------------------------------------
  // STEP B: Stream siconv_proposta.csv.zip — build propostaMap filtered
  //         by Projetus client CNPJs (from existing_clients + vendedor_projetos)
  // -------------------------------------------------------------------------
  const propostaMap = new Map<string, PropostaInfo>()
  let propostaHeadersLogged = false

  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    stats.proposta_rows_scanned++

    // Debug: log headers on first row so CSV column mapping can be verified
    if (stats.proposta_rows_scanned === 1) {
      console.log('[execucao-sync] Proposta CSV headers:', Object.keys(row))
      propostaHeadersLogged = true
    }

    // Extract CNPJ (try multiple column names)
    const rawCnpj = row['CNPJ_PROPONENTE'] || row['IDENTIF_PROPONENTE'] || null
    const cnpj = cleanCNPJ(rawCnpj)
    if (!cnpj) return

    // Keep proposta if CNPJ is a Projetus client OR if its nr_proposta is in the
    // TGov whitelist (added manually via the SICONV search modal).
    const nrProposta = (row['NR_PROPOSTA'] || '').replace(/^0+/, '') || null
    const cnpjMatch = projetusCnpjSet.has(cnpj)
    const nrMatch = nrProposta && whitelistNrSet.has(nrProposta)
    if (!cnpjMatch && !nrMatch) return

    stats.osc_rows_kept++
    propostaMap.set(row['ID_PROPOSTA'], {
      cnpj,
      nome_proponente: fixText(row['NM_PROPONENTE'] || row['NOME_PROPONENTE'] || null) || null,
      objeto: fixText(row['OBJETO_PROPOSTA'] || row['DESC_OBJETO'] || null) || null,
      uf: row['UF_PROPONENTE'] || row['UF'] || null,
      municipio: fixText(row['MUNICIPIO_PROPONENTE'] || row['MUNIC_PROPONENTE'] || null) || null,
      nr_proposta: row['NR_PROPOSTA'] || null,
    })
  })

  console.log(`[execucao-sync] STEP B complete: propostaMap.size=${propostaMap.size}, cnpj_matched=${stats.osc_rows_kept}`)

  // Memory guard after STEP B
  const memAfterB = process.memoryUsage().heapUsed / 1024 / 1024
  stats.memory_peak_mb = Math.round(memAfterB)
  console.log(`[execucao-sync] Memory after STEP B: ${memAfterB.toFixed(1)}MB`)

  // If propostaMap is empty and headers were logged, log a warning
  if (propostaMap.size === 0 && propostaHeadersLogged) {
    console.warn('[execucao-sync] WARNING: propostaMap is empty — no siconv proposals matched Projetus client CNPJs.')
  }

  // -------------------------------------------------------------------------
  // STEP C: Stream siconv_convenio.csv.zip — join with matched propostas
  //         (no status filter — we want ALL statuses for Projetus clients)
  // -------------------------------------------------------------------------
  const records: ExecucaoRecord[] = []

  await downloadAndStreamCSV(CONVENIO_URL, (row) => {
    stats.convenio_rows_scanned++

    // Debug: log headers on first row
    if (stats.convenio_rows_scanned === 1) {
      console.log('[execucao-sync] Convenio CSV headers:', Object.keys(row))
    }

    // Join with propostaMap (CNPJ-filtered — only Projetus clients)
    const proposta = propostaMap.get(row['ID_PROPOSTA'])
    if (!proposta) {
      if (row['ID_PROPOSTA']) stats.join_miss_count++
      return
    }

    const situacaoRaw = row['SITUACAO_CONVENIO'] || row['SIT_CONVENIO'] || ''
    stats.em_execucao_rows++

    // Parse financial values
    const valor_global = parseBRNumber(row['VL_GLOBAL_CONV'] || row['VL_GLOBAL'] || null)
    const valor_repasse = parseBRNumber(row['VL_REPASSE_CONV'] || row['VL_REPASSE'] || null)
    const valor_desembolsado = parseBRNumber(row['VL_DESEMBOLSADO_CONV'] || row['VL_DESEMBOLSADO'] || null)
    // VL_SALDO_CONTA uses dot as decimal (US format) in 99.99% of rows; 3 rows use comma.
    // parseBRNumber strips dots (treats as thousand sep) which inflates values 100x.
    // Use parseFloat for the dominant format; comma-format rows lose only centavos.
    const saldo_conta = parseFloat(row['VL_SALDO_CONTA'] || '0') || 0
    const valor_empenhado = parseBRNumber(row['VL_EMPENHADO_CONV'] || row['VL_EMPENHADO'] || null)
    const rendimento_aplicacao = parseBRNumber(row['VL_RENDIMENTO_APLICACAO'] || null)
    const ingresso_contrapartida = parseBRNumber(row['VL_INGRESSO_CONTRAPARTIDA'] || null)

    // Parse date values
    const data_assinatura = parseBRDate(row['DIA_ASSIN_CONV'] || row['DT_ASSINATURA_CONV'] || row['DT_ASSINATURA'] || null)
    const data_inicio_vigencia = parseBRDate(row['DIA_INIC_VIGENC_CONV'] || row['DT_INICIO_VIGENCIA'] || row['DT_INI_VIG'] || null)
    const data_fim_vigencia = parseBRDate(row['DIA_FIM_VIGENC_CONV'] || row['DT_FIM_VIGENCIA'] || row['DT_FIM_VIG'] || null)
    const dia_limite_prest_contas = parseBRDate(row['DIA_LIMITE_PREST_CONTAS'] || null)

    // New columns from CSV
    const dias_prest_contas = parseInt(row['DIAS_PREST_CONTAS'] || '0', 10) || 0
    const ano_raw = row['ANO']?.trim()
    const ano_referencia = ano_raw ? (parseInt(ano_raw, 10) || null) : null

    // Computed fields
    const total_entradas = valor_desembolsado + ingresso_contrapartida + rendimento_aplicacao
    const gasto_efetivo = Math.max(0, total_entradas - saldo_conta)
    const pct_execucao = total_entradas > 0 && valor_global > 0
      ? Math.round((gasto_efetivo / valor_global) * 10000) / 100
      : null

    const dias_em_execucao = data_inicio_vigencia
      ? Math.floor((Date.now() - new Date(data_inicio_vigencia).getTime()) / 86_400_000)
      : null

    const dias_ate_vencimento = data_fim_vigencia
      ? Math.floor((new Date(data_fim_vigencia).getTime() - Date.now()) / 86_400_000)
      : null

    const alerta_desembolso = valor_desembolsado < 0
    const verificar_saldo = valor_desembolsado > 0 && saldo_conta <= 0

    records.push({
      nr_convenio: row['NR_CONVENIO'],
      id_proposta: row['ID_PROPOSTA'],
      nr_proposta: proposta.nr_proposta,
      situacao: fixText(situacaoRaw) || null,
      modalidade: fixText(row['MODALIDADE'] || row['MOD_CONV'] || null) || null,
      cnpj: proposta.cnpj,
      nome_proponente: proposta.nome_proponente,
      objeto: proposta.objeto,
      uf: proposta.uf,
      municipio: proposta.municipio,
      valor_global,
      valor_repasse,
      valor_desembolsado,
      saldo_conta,
      valor_empenhado,
      rendimento_aplicacao,
      ingresso_contrapartida,
      data_assinatura,
      data_inicio_vigencia,
      data_fim_vigencia,
      dia_limite_prest_contas,
      dias_prest_contas,
      ano_referencia,
      pct_execucao,
      dias_em_execucao,
      dias_ate_vencimento,
      alerta_desembolso,
      verificar_saldo,
    })
  })

  stats.joined_rows = records.length
  console.log(`[execucao-sync] STEP C complete: convenio_rows_scanned=${stats.convenio_rows_scanned}, matched_rows=${stats.em_execucao_rows}, joined_rows=${stats.joined_rows}, join_miss_count=${stats.join_miss_count}`)

  // -------------------------------------------------------------------------
  // STEP D: Bulk UPSERT into projetos_execucao
  // -------------------------------------------------------------------------
  const client = await pool.connect()
  try {
    // Count rows before UPSERT to determine inserted vs updated
    const beforeResult = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM projetos_execucao')
    const rowsBefore = parseInt(beforeResult.rows[0].n, 10)

    // Debug: log first 3 records so CSV column mapping can be verified
    const debugRecords = records.slice(0, 3)
    if (debugRecords.length > 0) {
      console.log('[execucao-sync] First 3 records for column verification:')
      for (const rec of debugRecords) {
        console.log(JSON.stringify(rec))
      }
    }

    const UPSERT_SQL = `
      INSERT INTO projetos_execucao (
        nr_convenio, id_proposta, nr_proposta, situacao, modalidade,
        cnpj, nome_proponente, objeto, uf, municipio,
        valor_global, valor_repasse, valor_desembolsado, saldo_conta, valor_empenhado,
        rendimento_aplicacao, ingresso_contrapartida,
        data_assinatura, data_inicio_vigencia, data_fim_vigencia,
        dia_limite_prest_contas, dias_prest_contas, ano_referencia,
        pct_execucao, dias_em_execucao, dias_ate_vencimento,
        alerta_desembolso, verificar_saldo,
        synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,NOW())
      ON CONFLICT (nr_convenio) DO UPDATE SET
        id_proposta            = EXCLUDED.id_proposta,
        nr_proposta            = EXCLUDED.nr_proposta,
        situacao               = EXCLUDED.situacao,
        modalidade             = EXCLUDED.modalidade,
        cnpj                   = EXCLUDED.cnpj,
        nome_proponente        = EXCLUDED.nome_proponente,
        objeto                 = EXCLUDED.objeto,
        uf                     = EXCLUDED.uf,
        municipio              = EXCLUDED.municipio,
        valor_global           = EXCLUDED.valor_global,
        valor_repasse          = EXCLUDED.valor_repasse,
        valor_desembolsado     = EXCLUDED.valor_desembolsado,
        saldo_conta            = EXCLUDED.saldo_conta,
        valor_empenhado        = EXCLUDED.valor_empenhado,
        rendimento_aplicacao   = EXCLUDED.rendimento_aplicacao,
        ingresso_contrapartida = EXCLUDED.ingresso_contrapartida,
        data_assinatura        = EXCLUDED.data_assinatura,
        data_inicio_vigencia   = EXCLUDED.data_inicio_vigencia,
        data_fim_vigencia      = EXCLUDED.data_fim_vigencia,
        dia_limite_prest_contas = EXCLUDED.dia_limite_prest_contas,
        dias_prest_contas       = EXCLUDED.dias_prest_contas,
        ano_referencia          = EXCLUDED.ano_referencia,
        pct_execucao           = EXCLUDED.pct_execucao,
        dias_em_execucao       = EXCLUDED.dias_em_execucao,
        dias_ate_vencimento    = EXCLUDED.dias_ate_vencimento,
        alerta_desembolso      = EXCLUDED.alerta_desembolso,
        verificar_saldo        = EXCLUDED.verificar_saldo,
        synced_at              = NOW()
    `

    for (const rec of records) {
      try {
        await client.query(UPSERT_SQL, [
          rec.nr_convenio,
          rec.id_proposta,
          rec.nr_proposta,
          rec.situacao,
          rec.modalidade,
          rec.cnpj,
          rec.nome_proponente,
          rec.objeto,
          rec.uf,
          rec.municipio,
          rec.valor_global,
          rec.valor_repasse,
          rec.valor_desembolsado,
          rec.saldo_conta,
          rec.valor_empenhado,
          rec.rendimento_aplicacao,
          rec.ingresso_contrapartida,
          rec.data_assinatura,
          rec.data_inicio_vigencia,
          rec.data_fim_vigencia,
          rec.dia_limite_prest_contas,
          rec.dias_prest_contas,
          rec.ano_referencia,
          rec.pct_execucao,
          rec.dias_em_execucao,
          rec.dias_ate_vencimento,
          rec.alerta_desembolso,
          rec.verificar_saldo,
        ])
      } catch (err) {
        stats.errors++
        console.error(`[execucao-sync] UPSERT error for nr_convenio=${rec.nr_convenio}:`, err)
      }
    }

    // Count rows after UPSERT to determine inserted vs updated
    const afterResult = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM projetos_execucao')
    const rowsAfter = parseInt(afterResult.rows[0].n, 10)
    stats.inserted = rowsAfter - rowsBefore
    stats.updated = records.length - stats.errors - stats.inserted

    console.log(`[execucao-sync] STEP D complete: inserted=${stats.inserted}, updated=${stats.updated}, errors=${stats.errors}`)

    // -------------------------------------------------------------------------
    // STEP D2: Purge stale rows — convenios no longer matching Projetus clients
    // -------------------------------------------------------------------------
    const syncStartTimestamp = new Date(startTime).toISOString()
    const purgeResult = await client.query<{ n: string }>(
      `WITH deleted AS (
        DELETE FROM projetos_execucao WHERE synced_at < $1 RETURNING 1
      ) SELECT COUNT(*) AS n FROM deleted`,
      [syncStartTimestamp]
    )
    const purged = parseInt(purgeResult.rows[0].n, 10)
    if (purged > 0) {
      console.log(`[execucao-sync] STEP D2: purged ${purged} stale rows`)
    }

    // -------------------------------------------------------------------------
    // STEP D3: BrasilAPI contact enrichment for projetos_execucao CNPJs
    // -------------------------------------------------------------------------
    const c3Res = await client.query<{ cnpj: string }>(`
      SELECT DISTINCT pe.cnpj FROM projetos_execucao pe
      LEFT JOIN lead_contacts lc ON pe.cnpj = lc.lead_cnpj
      WHERE lc.lead_cnpj IS NULL
      LIMIT 100
    `)
    console.log(`[execucao-sync] STEP D3: ${c3Res.rows.length} CNPJs in projetos_execucao need contacts`)

    if (Date.now() - startTime > 200000) {
      console.log('[execucao-sync] STEP D3: Skipped — elapsed time exceeds 200s, too close to Vercel timeout')
    } else {
      for (const { cnpj } of c3Res.rows) {
        if (Date.now() - startTime > 260000) {
          console.log('[execucao-sync] STEP D3: Approaching 260s timeout, stopping enrichment loop')
          break
        }

        try {
          const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
          })

          if (apiRes.status === 403 || apiRes.status === 429) {
            console.log(`[execucao-sync] STEP D3: Rate limited (HTTP ${apiRes.status}) for ${cnpj}, stopping loop`)
            break
          }

          if (!apiRes.ok) {
            console.log(`[execucao-sync] STEP D3: Non-ok response (HTTP ${apiRes.status}) for ${cnpj}, skipping`)
            await delay(300)
            continue
          }

          const data = await apiRes.json()
          const phone1 = formatPhone(data.ddd_telefone_1 || '')
          const phone2 = formatPhone(data.ddd_telefone_2 || '')
          const rawEmail = (data.email || '').trim().toLowerCase()
          const email = rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@') ? rawEmail : null

          if (phone1 || email) {
            await client.query(
              `INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
               VALUES ($1, $2, $3, true, 'desconhecido')`,
              [cnpj, phone1 || null, email || null]
            )
            stats.enriched_contacts++
          }

          if (phone2) {
            const phone1Digits = (phone1 || '').replace(/\D/g, '')
            const phone2Digits = phone2.replace(/\D/g, '')
            if (phone2Digits && phone2Digits !== phone1Digits) {
              await client.query(
                `INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
                 VALUES ($1, $2, NULL, false, 'desconhecido')`,
                [cnpj, phone2]
              )
              stats.enriched_contacts++
            }
          }
        } catch (err) {
          console.error(`[execucao-sync] STEP D3: Error for CNPJ ${cnpj}:`, err)
        }

        await delay(300)
      }
      console.log(`[execucao-sync] STEP D3 complete: enriched_contacts=${stats.enriched_contacts}`)
    }

    // -------------------------------------------------------------------------
    // STEP E: Log to cron_sync_log
    // -------------------------------------------------------------------------
    await client.query(
      `INSERT INTO cron_sync_log (inserted, updated, errors, duration_ms, join_miss_count, source)
       VALUES ($1, $2, $3, $4, $5, 'sync-execucao')`,
      [stats.inserted, stats.updated, stats.errors, Date.now() - startTime, stats.join_miss_count]
    )
    console.log('[execucao-sync] STEP E complete: logged to cron_sync_log')

  } finally {
    client.release()
  }

  // -------------------------------------------------------------------------
  // STEP F: Return stats
  // -------------------------------------------------------------------------
  stats.duration_ms = Date.now() - startTime
  stats.memory_peak_mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  console.log(`[execucao-sync] Complete in ${stats.duration_ms}ms, memory=${stats.memory_peak_mb}MB`)
  return stats
}
