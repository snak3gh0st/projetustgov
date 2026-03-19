// ============================================================================
// execucao-sync.ts — Streaming ETL for Projetos em Execucao
// ============================================================================
//
// Populates projetos_execucao from two government CSV ZIPs:
//   Source 1: siconv_proposta.csv.zip (187MB) — filtered to OSC only
//   Source 2: siconv_convenio.csv.zip (15MB)  — filtered to "em execucao"
//
// Algorithm: Two-step in-memory join
//   STEP A: Stream proposta, build Map<id_proposta, {cnpj, nome, ...}>
//   STEP B: Stream convenio, look up proposta Map, build records
//   STEP C: UPSERT ON CONFLICT (nr_convenio) DO UPDATE
//   STEP D: Log to cron_sync_log with join_miss_count
//
// UPSERT: ON CONFLICT (nr_convenio) — NEVER cnpj alone
// NEVER overwrite fields: (none currently — projetos_execucao has no CRM state)
// ALWAYS update: all data columns + synced_at
//
// Called by: /api/cron/sync-execucao (Phase 15 Plan 02)
// Tested by: web/scripts/test-execucao-sync.mjs (Phase 15 Plan 02)
// ============================================================================

import { getPool } from '@/lib/db'
import { cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV } from '@/lib/repo-sync'

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
  duration_ms: number
  memory_peak_mb: number
}

interface PropostaInfo {
  cnpj: string
  nome_proponente: string | null
  objeto: string | null
  uf: string | null
  municipio: string | null
}

interface ExecucaoRecord {
  nr_convenio: string
  id_proposta: string
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
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
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
    duration_ms: 0,
    memory_peak_mb: 0,
  }

  // -------------------------------------------------------------------------
  // STEP A: Stream siconv_proposta.csv.zip — build OSC-only propostaMap
  // -------------------------------------------------------------------------
  const propostaMap = new Map<string, PropostaInfo>()
  let oscFilterColumn: string | null = null
  let oscFilterType: 'natureza' | 'tipo_instrumento' | 'fallback' | 'none' = 'none'
  let propostaHeadersLogged = false

  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    stats.proposta_rows_scanned++

    // Debug: log headers on first row so CSV column mapping can be verified
    if (stats.proposta_rows_scanned === 1) {
      console.log('[execucao-sync] Proposta CSV headers:', Object.keys(row))
    }

    // Determine OSC filter column on first row
    if (stats.proposta_rows_scanned === 1) {
      propostaHeadersLogged = true
      const keys = Object.keys(row)

      // Try columns that directly encode natureza juridica
      if (keys.includes('NATUREZA_JURIDICA')) {
        oscFilterColumn = 'NATUREZA_JURIDICA'
        oscFilterType = 'natureza'
      } else if (keys.includes('NATUREZA_JURIDICA_PROPONENTE')) {
        oscFilterColumn = 'NATUREZA_JURIDICA_PROPONENTE'
        oscFilterType = 'natureza'
      } else if (keys.includes('NAT_JUR')) {
        oscFilterColumn = 'NAT_JUR'
        oscFilterType = 'natureza'
      } else if (keys.includes('TIPO_INSTRUMENTO')) {
        oscFilterColumn = 'TIPO_INSTRUMENTO'
        oscFilterType = 'tipo_instrumento'
      } else {
        // Fallback: check TIPO_INSTRUMENTO
        if (keys.includes('TIPO_INSTRUMENTO')) {
          oscFilterColumn = 'TIPO_INSTRUMENTO'
          oscFilterType = 'fallback'
        } else {
          oscFilterType = 'none'
          console.error('[execucao-sync] ERROR: OSC filter column not found in proposta CSV. Available columns:', keys)
        }
      }

      console.log(`[execucao-sync] OSC filter strategy: column="${oscFilterColumn}", type="${oscFilterType}"`)
    }

    // If we could not determine a filter column, skip all rows (early return)
    if (oscFilterType === 'none') return

    // Apply OSC filter
    let isOsc = false
    if (oscFilterType === 'natureza' && oscFilterColumn) {
      const nat = (row[oscFilterColumn] || '').toLowerCase()
      isOsc = nat.includes('associa') ||
              nat.includes('fundacao') ||
              nat.includes('fundação') ||
              nat.includes('organiza') ||
              nat.includes('coopera') ||
              nat.includes('instituto')
    } else if ((oscFilterType === 'tipo_instrumento' || oscFilterType === 'fallback') && oscFilterColumn) {
      const tipo = (row[oscFilterColumn] || '').toLowerCase()
      isOsc = tipo.includes('osc')
    }

    if (!isOsc) return

    // Extract CNPJ (try multiple column names)
    const rawCnpj = row['CNPJ_PROPONENTE'] || row['IDENTIF_PROPONENTE'] || null
    const cnpj = cleanCNPJ(rawCnpj)
    if (!cnpj) return

    stats.osc_rows_kept++
    propostaMap.set(row['ID_PROPOSTA'], {
      cnpj,
      nome_proponente: fixText(row['NM_PROPONENTE'] || row['NOME_PROPONENTE'] || null) || null,
      objeto: fixText(row['OBJETO_PROPOSTA'] || row['DESC_OBJETO'] || null) || null,
      uf: row['UF_PROPONENTE'] || row['UF'] || null,
      municipio: fixText(row['MUNICIPIO_PROPONENTE'] || row['MUNIC_PROPONENTE'] || null) || null,
    })
  })

  console.log(`[execucao-sync] STEP A complete: propostaMap.size=${propostaMap.size}, osc_rows_kept=${stats.osc_rows_kept}`)

  // Memory guard after STEP A
  const memAfterA = process.memoryUsage().heapUsed / 1024 / 1024
  stats.memory_peak_mb = Math.round(memAfterA)
  console.log(`[execucao-sync] Memory after STEP A: ${memAfterA.toFixed(1)}MB`)
  if (process.memoryUsage().heapUsed > 900 * 1024 * 1024) {
    console.warn('[execucao-sync] CRITICAL: Heap usage exceeds 900MB after STEP A. Consider implementing two-pass approach.')
  }

  // If propostaMap is empty and headers were logged, log an error but continue
  if (propostaMap.size === 0 && propostaHeadersLogged) {
    console.warn('[execucao-sync] WARNING: propostaMap is empty after streaming proposta CSV. OSC filter may have wrong column name.')
  }

  // -------------------------------------------------------------------------
  // STEP B: Stream siconv_convenio.csv.zip — filter "em execucao", join, build records
  // -------------------------------------------------------------------------
  const records: ExecucaoRecord[] = []

  await downloadAndStreamCSV(CONVENIO_URL, (row) => {
    stats.convenio_rows_scanned++

    // Debug: log headers on first row
    if (stats.convenio_rows_scanned === 1) {
      console.log('[execucao-sync] Convenio CSV headers:', Object.keys(row))
    }

    // Filter: "em execucao"
    const situacaoRaw = row['SITUACAO_CONVENIO'] || row['SIT_CONVENIO'] || ''
    if (!situacaoRaw.toLowerCase().includes('execu')) return

    stats.em_execucao_rows++

    // Join with propostaMap
    const proposta = propostaMap.get(row['ID_PROPOSTA'])
    if (!proposta) {
      stats.join_miss_count++
      return
    }

    // Parse financial values
    const valor_global = parseBRNumber(row['VL_GLOBAL_CONV'] || row['VL_GLOBAL'] || null)
    const valor_repasse = parseBRNumber(row['VL_REPASSE_CONV'] || row['VL_REPASSE'] || null)
    const valor_desembolsado = parseBRNumber(row['VL_DESEMBOLSADO_CONV'] || row['VL_DESEMBOLSADO'] || null)
    // VL_SALDO_CONTA uses US decimal format (dot), other columns use BR format (comma).
    // Parse each with the correct parser and take the larger value.
    const saldoUS = parseFloat(row['VL_SALDO_CONTA'] || '0') || 0
    const saldoBR = parseBRNumber(row['VL_SALDO_REMAN_TESOURO'] || null)
    const saldo_conta = Math.max(saldoUS, saldoBR)
    const valor_empenhado = parseBRNumber(row['VL_EMPENHADO_CONV'] || row['VL_EMPENHADO'] || null)

    // Parse date values
    // Actual CSV column names (verified from siconv_convenio.csv.zip headers 2026-03-18):
    //   DIA_ASSIN_CONV, DIA_INIC_VIGENC_CONV, DIA_FIM_VIGENC_CONV
    // Fallback names kept for forward compatibility if CSV schema changes
    const data_assinatura = parseBRDate(row['DIA_ASSIN_CONV'] || row['DT_ASSINATURA_CONV'] || row['DT_ASSINATURA'] || null)
    const data_inicio_vigencia = parseBRDate(row['DIA_INIC_VIGENC_CONV'] || row['DT_INICIO_VIGENCIA'] || row['DT_INI_VIG'] || null)
    const data_fim_vigencia = parseBRDate(row['DIA_FIM_VIGENC_CONV'] || row['DT_FIM_VIGENCIA'] || row['DT_FIM_VIG'] || null)

    // Computed fields
    // % Execucao = (desembolsado - saldo_conta) / valor_global
    // Only meaningful when desembolso > 0 (desembolso = 0 is an alert case)
    const pct_execucao = valor_desembolsado > 0 && valor_global > 0
      ? Math.round(((valor_desembolsado - saldo_conta) / valor_global) * 10000) / 100
      : null

    const dias_em_execucao = data_inicio_vigencia
      ? Math.floor((Date.now() - new Date(data_inicio_vigencia).getTime()) / 86_400_000)
      : null

    const dias_ate_vencimento = data_fim_vigencia
      ? Math.floor((new Date(data_fim_vigencia).getTime() - Date.now()) / 86_400_000)
      : null

    // Alert flags (business rules — to be refined in Phase 16 after client confirmation)
    const alerta_desembolso = valor_desembolsado < 0  // Pitfall 7: may never be true; Phase 16 will refine
    const verificar_saldo = valor_desembolsado > 0 && saldo_conta <= 0

    records.push({
      nr_convenio: row['NR_CONVENIO'],
      id_proposta: row['ID_PROPOSTA'],
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
      data_assinatura,
      data_inicio_vigencia,
      data_fim_vigencia,
      pct_execucao,
      dias_em_execucao,
      dias_ate_vencimento,
      alerta_desembolso,
      verificar_saldo,
    })
  })

  stats.joined_rows = records.length
  console.log(`[execucao-sync] STEP B complete: convenio_rows_scanned=${stats.convenio_rows_scanned}, em_execucao_rows=${stats.em_execucao_rows}, joined_rows=${stats.joined_rows}, join_miss_count=${stats.join_miss_count}`)

  // -------------------------------------------------------------------------
  // STEP C: Bulk UPSERT into projetos_execucao
  // -------------------------------------------------------------------------
  const client = await getPool().connect()
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
        nr_convenio, id_proposta, situacao, modalidade,
        cnpj, nome_proponente, objeto, uf, municipio,
        valor_global, valor_repasse, valor_desembolsado, saldo_conta, valor_empenhado,
        data_assinatura, data_inicio_vigencia, data_fim_vigencia,
        pct_execucao, dias_em_execucao, dias_ate_vencimento,
        alerta_desembolso, verificar_saldo,
        synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
      ON CONFLICT (nr_convenio) DO UPDATE SET
        id_proposta          = EXCLUDED.id_proposta,
        situacao             = EXCLUDED.situacao,
        modalidade           = EXCLUDED.modalidade,
        cnpj                 = EXCLUDED.cnpj,
        nome_proponente      = EXCLUDED.nome_proponente,
        objeto               = EXCLUDED.objeto,
        uf                   = EXCLUDED.uf,
        municipio            = EXCLUDED.municipio,
        valor_global         = EXCLUDED.valor_global,
        valor_repasse        = EXCLUDED.valor_repasse,
        valor_desembolsado   = EXCLUDED.valor_desembolsado,
        saldo_conta          = EXCLUDED.saldo_conta,
        valor_empenhado      = EXCLUDED.valor_empenhado,
        data_assinatura      = EXCLUDED.data_assinatura,
        data_inicio_vigencia = EXCLUDED.data_inicio_vigencia,
        data_fim_vigencia    = EXCLUDED.data_fim_vigencia,
        pct_execucao         = EXCLUDED.pct_execucao,
        dias_em_execucao     = EXCLUDED.dias_em_execucao,
        dias_ate_vencimento  = EXCLUDED.dias_ate_vencimento,
        alerta_desembolso    = EXCLUDED.alerta_desembolso,
        verificar_saldo      = EXCLUDED.verificar_saldo,
        synced_at            = NOW()
    `

    for (const rec of records) {
      try {
        await client.query(UPSERT_SQL, [
          rec.nr_convenio,
          rec.id_proposta,
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
          rec.data_assinatura,
          rec.data_inicio_vigencia,
          rec.data_fim_vigencia,
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

    console.log(`[execucao-sync] STEP C complete: inserted=${stats.inserted}, updated=${stats.updated}, errors=${stats.errors}`)

    // -------------------------------------------------------------------------
    // STEP D: Log to cron_sync_log
    // -------------------------------------------------------------------------
    await client.query(
      `INSERT INTO cron_sync_log (inserted, updated, errors, duration_ms, join_miss_count, source)
       VALUES ($1, $2, $3, $4, $5, 'sync-execucao')`,
      [stats.inserted, stats.updated, stats.errors, Date.now() - startTime, stats.join_miss_count]
    )
    console.log('[execucao-sync] STEP D complete: logged to cron_sync_log')

  } finally {
    client.release()
  }

  // -------------------------------------------------------------------------
  // STEP E: Return stats
  // -------------------------------------------------------------------------
  stats.duration_ms = Date.now() - startTime
  stats.memory_peak_mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  console.log(`[execucao-sync] Complete in ${stats.duration_ms}ms, memory=${stats.memory_peak_mb}MB`)
  return stats
}
