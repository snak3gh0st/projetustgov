// ============================================================================
// tgov-only-sync.ts — TGov-only sync for non-CRM CNPJs
// ============================================================================
//
// PURPOSE
// -------
// Mantém as tabelas TGov-only `tgov_projetos_execucao` e `tgov_propostas`
// sincronizadas com siconv_proposta.csv.zip e siconv_convenio.csv.zip para
// CNPJs/propostas que pertencem APENAS ao escopo TGov:
//
//   - tgov_whitelist (cnpj ou nr_proposta) adicionados via modal "Buscar SICONV"
//   - EXECUCAO_NR_PROPOSTAS / APROVACAO_NR_PROPOSTAS (web/src/lib/tgov.ts)
//
// CNPJs que JÁ estão no CRM (existing_clients ∪ vendedor_projetos) são
// EXCLUÍDOS daqui — eles continuam sendo tratados pelo execucao-sync.ts e
// propostas-sync.ts (que escrevem nas tabelas compartilhadas projetos_execucao
// e propostas).
//
// ISOLATION GUARANTEE
// -------------------
// Este sync NUNCA escreve em projetos_execucao ou propostas. Não dispara
// distribute-execucao. Não enriquece lead_contacts. Não toca em
// vendedor_projetos. As tabelas tgov_only são lidas exclusivamente pelas
// rotas /api/tgov/* (via UNION com as tabelas compartilhadas).
//
// CRONS
// -----
// Chamado por /api/cron/sync-tgov-only (vercel.json — 13:30 UTC, depois do
// sync-execucao). Pode ser disparado manualmente como gestor.
// ============================================================================

import { getPool, query } from '@/lib/db'
import { sendSituacaoChangeNotification, sendCommercialSituacaoChangeNotification } from './email-service'
import { cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV } from '@/lib/repo-sync'
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov'
import { ensureTgovTables } from '@/lib/tgov-tables'

const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const PROPOSTA_URL = `${REPO_BASE}/siconv_proposta.csv.zip`
const CONVENIO_URL = `${REPO_BASE}/siconv_convenio.csv.zip`

export interface TgovOnlySyncStats {
  proposta_rows_scanned: number
  proposta_rows_kept: number
  convenio_rows_scanned: number
  convenio_rows_kept: number
  propostas_inserted: number
  propostas_updated: number
  execucao_inserted: number
  execucao_updated: number
  propostas_purged: number
  execucao_purged: number
  errors: number
  duration_ms: number
}

interface PropostaInfo {
  cnpj: string
  nome_proponente: string | null
  objeto: string | null
  uf: string | null
  municipio: string | null
  nr_proposta: string | null
}

/**
 * Returns true when a situacao transition crosses a major phase boundary:
 *   - aprovacao-phase keywords → execucao-phase keywords
 *   - execucao-phase keywords  → prestacao_contas-phase keywords
 *
 * Used to decide whether tgov_comments should be cleared for a proposal.
 */
function isMajorPhaseTransition(oldSituacao: string, newSituacao: string): boolean {
  const old = oldSituacao.toLowerCase()
  const next = newSituacao.toLowerCase()

  const isAprovacaoPhase = (s: string) =>
    s.includes('aprovado') || s.includes('aguardando análise') || s.includes('aguardando analise') ||
    s.includes('em análise') || s.includes('em analise') || s.includes('aguardando envio') ||
    s.includes('reprovado') || s.includes('complementação') || s.includes('complementacao')

  const isExecucaoPhase = (s: string) =>
    s.includes('em execução') || s.includes('em execucao')

  const isPrestacaoPhase = (s: string) =>
    s.includes('prestação de contas') || s.includes('prestacao de contas') ||
    s.includes('aguardando prestação') || s.includes('aguardando prestacao')

  return (isAprovacaoPhase(old) && isExecucaoPhase(next)) ||
         (isExecucaoPhase(old) && isPrestacaoPhase(next))
}

function parseBRDate(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null
  const trimmed = val.trim()
  const parts = trimmed.split('/')
  if (parts.length === 3 && parts[0].length <= 2) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return trimmed
}

function buildDate(d: string | undefined, m: string | undefined, y: string | undefined): string | null {
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export async function syncTgovOnly(): Promise<TgovOnlySyncStats> {
  const startTime = Date.now()
  const syncStartTimestamp = new Date().toISOString()

  const stats: TgovOnlySyncStats = {
    proposta_rows_scanned: 0,
    proposta_rows_kept: 0,
    convenio_rows_scanned: 0,
    convenio_rows_kept: 0,
    propostas_inserted: 0,
    propostas_updated: 0,
    execucao_inserted: 0,
    execucao_updated: 0,
    propostas_purged: 0,
    execucao_purged: 0,
    errors: 0,
    duration_ms: 0,
  }

  const pool = getPool()

  // Garante existência das tabelas TGov-only antes de qualquer query
  await ensureTgovTables()

  // -------------------------------------------------------------------------
  // STEP A: Build scope sets
  //
  // crmCnpjSet — CNPJs do CRM (existing_clients ∪ vendedor_projetos).
  //              EXCLUÍDOS daqui — já são tratados pelas syncs CRM.
  //
  // tgovCnpjSet — tgov_whitelist.cnpj (rows que NÃO estão no CRM).
  // tgovNrSet   — tgov_whitelist.nr_proposta + EXECUCAO/APROVACAO hardcoded.
  // -------------------------------------------------------------------------
  const crmCnpjResult = await pool.query<{ cnpj: string }>(`
    SELECT DISTINCT cnpj FROM (
      SELECT cnpj FROM existing_clients
      UNION
      SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj FROM vendedor_projetos
    ) all_cnpjs
    WHERE cnpj IS NOT NULL AND cnpj != ''
  `)
  const crmCnpjSet = new Set(crmCnpjResult.rows.map(r => r.cnpj))

  const tgovCnpjResult = await pool.query<{ cnpj: string }>(
    `SELECT cnpj FROM tgov_whitelist WHERE cnpj IS NOT NULL`
  )
  const tgovCnpjSet = new Set<string>()
  for (const r of tgovCnpjResult.rows) {
    if (!crmCnpjSet.has(r.cnpj)) tgovCnpjSet.add(r.cnpj)
  }

  const tgovNrResult = await pool.query<{ nr_proposta: string }>(
    `SELECT nr_proposta FROM tgov_whitelist WHERE nr_proposta IS NOT NULL`
  )
  const tgovNrSet = new Set<string>(tgovNrResult.rows.map(r => r.nr_proposta.replace(/^0+/, '')))
  Array.from(EXECUCAO_NR_PROPOSTAS).forEach(nr => tgovNrSet.add(nr.replace(/^0+/, '')))
  Array.from(APROVACAO_NR_PROPOSTAS).forEach(nr => tgovNrSet.add(nr.replace(/^0+/, '')))

  console.log(`[tgov-only-sync] STEP A: crm_cnpjs=${crmCnpjSet.size}, tgov_only_cnpjs=${tgovCnpjSet.size}, tgov_only_nrs=${tgovNrSet.size}`)

  if (tgovCnpjSet.size === 0 && tgovNrSet.size === 0) {
    console.log('[tgov-only-sync] No TGov-only scope to sync, exiting early')
    stats.duration_ms = Date.now() - startTime
    return stats
  }

  // -------------------------------------------------------------------------
  // STEP B: Stream siconv_proposta.csv.zip — match TGov-only scope
  //         Filter: cnpj NOT in CRM AND (cnpj in tgovCnpjSet OR nr_proposta in tgovNrSet)
  //         Build propostaMap for STEP C convenio join AND collect propostaRows
  //         for tgov_propostas upsert.
  // -------------------------------------------------------------------------
  const propostaMap = new Map<string, PropostaInfo>()
  const propostaRows: Array<{
    transfer_gov_id: string
    nr_proposta: string | null
    titulo: string | null
    valor_global: number
    valor_repasse: number
    valor_contrapartida: number
    data_publicacao: string | null
    situacao: string | null
    estado: string | null
    municipio: string | null
    proponente: string | null
    proponente_cnpj: string
    modalidade: string | null
    orgao_superior: string | null
    orgao_vinculado: string | null
  }> = []

  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    stats.proposta_rows_scanned++
    const rawCnpj = row['IDENTIF_PROPONENTE'] || row['CNPJ_PROPONENTE'] || null
    const cnpj = cleanCNPJ(rawCnpj)
    if (!cnpj) return
    if (crmCnpjSet.has(cnpj)) return  // CRM scope — skip (handled by execucao-sync)

    const nrPropostaRaw = (row['NR_PROPOSTA'] || '').replace(/^0+/, '') || null
    const cnpjMatch = tgovCnpjSet.has(cnpj)
    const nrMatch = nrPropostaRaw != null && tgovNrSet.has(nrPropostaRaw)
    if (!cnpjMatch && !nrMatch) return

    stats.proposta_rows_kept++

    propostaMap.set(row['ID_PROPOSTA'], {
      cnpj,
      nome_proponente: fixText(row['NM_PROPONENTE'] || row['NOME_PROPONENTE'] || null) || null,
      objeto: fixText(row['OBJETO_PROPOSTA'] || row['DESC_OBJETO'] || null) || null,
      uf: row['UF_PROPONENTE'] || row['UF'] || null,
      municipio: fixText(row['MUNICIPIO_PROPONENTE'] || row['MUNIC_PROPONENTE'] || null) || null,
      nr_proposta: row['NR_PROPOSTA'] || null,
    })

    propostaRows.push({
      transfer_gov_id: row['ID_PROPOSTA'],
      nr_proposta: nrPropostaRaw,
      titulo: fixText(row['OBJETO_PROPOSTA'] || row['DESC_OBJETO'] || null) || null,
      valor_global: parseBRNumber(row['VL_GLOBAL_PROP']),
      valor_repasse: parseBRNumber(row['VL_REPASSE_PROP']),
      valor_contrapartida: parseBRNumber(row['VL_CONTRAPARTIDA_PROP']),
      data_publicacao: parseBRDate(row['DIA_PROPOSTA'] || null)
        || buildDate(row['DIA_PROP'], row['MES_PROP'], row['ANO_PROP']),
      situacao: row['SIT_PROPOSTA'] || null,
      estado: row['UF_PROPONENTE'] || null,
      municipio: fixText(row['MUNIC_PROPONENTE'] || row['MUNICIPIO_PROPONENTE'] || null) || null,
      proponente: fixText(row['NM_PROPONENTE'] || row['NOME_PROPONENTE'] || null) || null,
      proponente_cnpj: cnpj,
      modalidade: row['MODALIDADE'] || null,
      orgao_superior: fixText(row['DESC_ORGAO_SUP'] || null) || null,
      orgao_vinculado: fixText(row['DESC_ORGAO'] || null) || null,
    })
  })

  console.log(`[tgov-only-sync] STEP B: scanned=${stats.proposta_rows_scanned}, kept=${stats.proposta_rows_kept}`)

  // -------------------------------------------------------------------------
  // STEP C: Stream siconv_convenio.csv.zip — join via id_proposta
  // -------------------------------------------------------------------------
  const execucaoRows: Array<{
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
  }> = []

  await downloadAndStreamCSV(CONVENIO_URL, (row) => {
    stats.convenio_rows_scanned++
    const proposta = propostaMap.get(row['ID_PROPOSTA'])
    if (!proposta) return

    stats.convenio_rows_kept++

    const valor_global = parseBRNumber(row['VL_GLOBAL_CONV'] || row['VL_GLOBAL'] || null)
    const valor_repasse = parseBRNumber(row['VL_REPASSE_CONV'] || row['VL_REPASSE'] || null)
    const valor_desembolsado = parseBRNumber(row['VL_DESEMBOLSADO_CONV'] || row['VL_DESEMBOLSADO'] || null)
    const saldo_conta = parseFloat(row['VL_SALDO_CONTA'] || '0') || 0
    const valor_empenhado = parseBRNumber(row['VL_EMPENHADO_CONV'] || row['VL_EMPENHADO'] || null)
    const rendimento_aplicacao = parseBRNumber(row['VL_RENDIMENTO_APLICACAO'] || null)
    const ingresso_contrapartida = parseBRNumber(row['VL_INGRESSO_CONTRAPARTIDA'] || null)

    const data_assinatura = parseBRDate(row['DIA_ASSIN_CONV'] || row['DT_ASSINATURA_CONV'] || row['DT_ASSINATURA'] || null)
    const data_inicio_vigencia = parseBRDate(row['DIA_INIC_VIGENC_CONV'] || row['DT_INICIO_VIGENCIA'] || row['DT_INI_VIG'] || null)
    const data_fim_vigencia = parseBRDate(row['DIA_FIM_VIGENC_CONV'] || row['DT_FIM_VIGENCIA'] || row['DT_FIM_VIG'] || null)
    const dia_limite_prest_contas = parseBRDate(row['DIA_LIMITE_PREST_CONTAS'] || null)

    const dias_prest_contas = parseInt(row['DIAS_PREST_CONTAS'] || '0', 10) || 0
    const ano_raw = row['ANO']?.trim()
    const ano_referencia = ano_raw ? (parseInt(ano_raw, 10) || null) : null

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

    execucaoRows.push({
      nr_convenio: row['NR_CONVENIO'],
      id_proposta: row['ID_PROPOSTA'],
      nr_proposta: proposta.nr_proposta,
      situacao: fixText(row['SITUACAO_CONVENIO'] || row['SIT_CONVENIO'] || '') || null,
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

  console.log(`[tgov-only-sync] STEP C: scanned=${stats.convenio_rows_scanned}, kept=${stats.convenio_rows_kept}`)

  // -------------------------------------------------------------------------
  // STEP D: UPSERT into tgov_propostas
  // -------------------------------------------------------------------------
  const client = await pool.connect()
  try {
    const propBefore = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM tgov_propostas')
    const propBeforeN = parseInt(propBefore.rows[0].n, 10)

    // Capture existing situacoes to detect changes during the UPSERT run
    const transferGovIds = propostaRows.map(r => r.transfer_gov_id)
    const oldSituacaoMap = new Map<string, string | null>()
    if (transferGovIds.length > 0) {
      const existing = await client.query<{ transfer_gov_id: string; situacao: string | null }>(
        `SELECT transfer_gov_id, situacao FROM tgov_propostas WHERE transfer_gov_id = ANY($1::text[])`,
        [transferGovIds],
      )
      for (const row of existing.rows) {
        oldSituacaoMap.set(row.transfer_gov_id, row.situacao)
      }
    }

    const situacaoChanges: Array<{
      nrProposta: string
      titulo: string | null
      oldSituacao: string
      newSituacao: string
      cnpj: string | null
    }> = []

    const PROP_UPSERT_SQL = `
      INSERT INTO tgov_propostas (
        transfer_gov_id, nr_proposta, titulo,
        valor_global, valor_repasse, valor_contrapartida,
        data_publicacao, situacao, estado, municipio,
        proponente, proponente_cnpj,
        modalidade, orgao_superior, orgao_vinculado,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
      ON CONFLICT (transfer_gov_id) DO UPDATE SET
        nr_proposta         = EXCLUDED.nr_proposta,
        titulo              = EXCLUDED.titulo,
        valor_global        = EXCLUDED.valor_global,
        valor_repasse       = EXCLUDED.valor_repasse,
        valor_contrapartida = EXCLUDED.valor_contrapartida,
        data_publicacao     = EXCLUDED.data_publicacao,
        situacao            = EXCLUDED.situacao,
        situacao_changed_at = CASE
          WHEN tgov_propostas.situacao IS DISTINCT FROM EXCLUDED.situacao
          THEN NOW()
          ELSE tgov_propostas.situacao_changed_at
        END,
        estado              = EXCLUDED.estado,
        municipio           = EXCLUDED.municipio,
        proponente          = EXCLUDED.proponente,
        proponente_cnpj     = EXCLUDED.proponente_cnpj,
        modalidade          = EXCLUDED.modalidade,
        orgao_superior      = EXCLUDED.orgao_superior,
        orgao_vinculado     = EXCLUDED.orgao_vinculado,
        updated_at          = NOW()
    `

    for (const r of propostaRows) {
      try {
        await client.query(PROP_UPSERT_SQL, [
          r.transfer_gov_id,
          r.nr_proposta,
          r.titulo,
          r.valor_global,
          r.valor_repasse,
          r.valor_contrapartida,
          r.data_publicacao,
          r.situacao,
          r.estado,
          r.municipio,
          r.proponente,
          r.proponente_cnpj,
          r.modalidade,
          r.orgao_superior,
          r.orgao_vinculado,
        ])
        const oldSituacao = oldSituacaoMap.get(r.transfer_gov_id)
        if (oldSituacao !== undefined && oldSituacao !== r.situacao && r.nr_proposta) {
          situacaoChanges.push({
            nrProposta: r.nr_proposta,
            titulo: r.titulo,
            oldSituacao: oldSituacao ?? '—',
            newSituacao: r.situacao ?? '—',
            cnpj: r.proponente_cnpj ?? null,
          })
        }
      } catch (err) {
        stats.errors++
        console.error(`[tgov-only-sync] tgov_propostas UPSERT error for ${r.transfer_gov_id}:`, err)
      }
    }

    const propAfter = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM tgov_propostas')
    const propAfterN = parseInt(propAfter.rows[0].n, 10)
    stats.propostas_inserted = Math.max(0, propAfterN - propBeforeN)
    stats.propostas_updated = propostaRows.length - stats.propostas_inserted

    // Fire-and-forget situacao change notifications
    if (situacaoChanges.length > 0) {
      console.log(`[tgov-only-sync] ${situacaoChanges.length} situacao change(s) detected, dispatching notifications`)
      for (const change of situacaoChanges) {
        try {
          const participants = await query<{ user_id: string }>(
            `SELECT user_id FROM tgov_proposta_participants WHERE proposta_key = $1`,
            [change.nrProposta],
          )
          if (participants.length > 0) {
            sendSituacaoChangeNotification({
              recipientIds: participants.map(p => p.user_id),
              actorId: '00000000-0000-0000-0000-000000000000', // sync has no human actor; no recipient will match this
              propostaNr: change.nrProposta,
              propostaTitulo: change.titulo,
              oldStatus: change.oldSituacao,
              newStatus: change.newSituacao,
            }).catch(err => console.error('[tgov-only-sync] situacao notification failed', err))
          }

          // Commercial owners of the CNPJ — alert only; never overwrite CRM funnel
          const cnpjClean = String(change.cnpj ?? '').replace(/\D/g, '')
          if (cnpjClean) {
            const sellers = await query<{ vendedor_id: string }>(
              `SELECT DISTINCT vendedor_id
               FROM vendedor_projetos
               WHERE vendedor_id IS NOT NULL
                 AND REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = $1`,
              [cnpjClean],
            )
            if (sellers.length > 0) {
              sendCommercialSituacaoChangeNotification({
                recipientIds: sellers.map(s => s.vendedor_id),
                propostaNr: change.nrProposta,
                propostaTitulo: change.titulo,
                cnpj: cnpjClean,
                oldStatus: change.oldSituacao,
                newStatus: change.newSituacao,
              }).catch(err => console.error('[tgov-only-sync] commercial situacao notification failed', err))
            }
          }
        } catch (err) {
          console.error('[tgov-only-sync] situacao notification gather failed', err)
        }

        // Clear tgov_comments and tgov_interactions.obs for major phase transitions
        if (isMajorPhaseTransition(change.oldSituacao, change.newSituacao)) {
          try {
            await query(
              `DELETE FROM tgov_comments WHERE target_key = $1 AND target_type = 'proposta'`,
              [change.nrProposta],
            )
            await query(
              `UPDATE tgov_interactions SET obs = NULL WHERE item_key = $1`,
              [change.nrProposta],
            )
            console.log(`[tgov-only-sync] cleared comments for ${change.nrProposta} (${change.oldSituacao} -> ${change.newSituacao})`)
          } catch (err) {
            console.error('[tgov-only-sync] comment clear failed for', change.nrProposta, err)
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // STEP E: UPSERT into tgov_projetos_execucao
    // -----------------------------------------------------------------------
    const execBefore = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM tgov_projetos_execucao')
    const execBeforeN = parseInt(execBefore.rows[0].n, 10)

    const EXEC_UPSERT_SQL = `
      INSERT INTO tgov_projetos_execucao (
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
        pct_execucao            = EXCLUDED.pct_execucao,
        dias_em_execucao        = EXCLUDED.dias_em_execucao,
        dias_ate_vencimento     = EXCLUDED.dias_ate_vencimento,
        alerta_desembolso       = EXCLUDED.alerta_desembolso,
        verificar_saldo         = EXCLUDED.verificar_saldo,
        synced_at               = NOW()
    `

    for (const r of execucaoRows) {
      try {
        await client.query(EXEC_UPSERT_SQL, [
          r.nr_convenio,
          r.id_proposta,
          r.nr_proposta,
          r.situacao,
          r.modalidade,
          r.cnpj,
          r.nome_proponente,
          r.objeto,
          r.uf,
          r.municipio,
          r.valor_global,
          r.valor_repasse,
          r.valor_desembolsado,
          r.saldo_conta,
          r.valor_empenhado,
          r.rendimento_aplicacao,
          r.ingresso_contrapartida,
          r.data_assinatura,
          r.data_inicio_vigencia,
          r.data_fim_vigencia,
          r.dia_limite_prest_contas,
          r.dias_prest_contas,
          r.ano_referencia,
          r.pct_execucao,
          r.dias_em_execucao,
          r.dias_ate_vencimento,
          r.alerta_desembolso,
          r.verificar_saldo,
        ])
      } catch (err) {
        stats.errors++
        console.error(`[tgov-only-sync] tgov_projetos_execucao UPSERT error for ${r.nr_convenio}:`, err)
      }
    }

    const execAfter = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM tgov_projetos_execucao')
    const execAfterN = parseInt(execAfter.rows[0].n, 10)
    stats.execucao_inserted = Math.max(0, execAfterN - execBeforeN)
    stats.execucao_updated = execucaoRows.length - stats.execucao_inserted

    // -----------------------------------------------------------------------
    // STEP F: Purge stale rows (rows que não foram tocadas neste run).
    // Acontece se um nr_proposta saiu da hardcoded list ou da tgov_whitelist,
    // ou se um CNPJ migrou para o CRM (passou a ser tratado pelo execucao-sync).
    // -----------------------------------------------------------------------
    const propPurge = await client.query<{ n: string }>(
      `WITH deleted AS (
        DELETE FROM tgov_propostas WHERE updated_at < $1 RETURNING 1
      ) SELECT COUNT(*) AS n FROM deleted`,
      [syncStartTimestamp]
    )
    stats.propostas_purged = parseInt(propPurge.rows[0].n, 10)

    const execPurge = await client.query<{ n: string }>(
      `WITH deleted AS (
        DELETE FROM tgov_projetos_execucao WHERE synced_at < $1 RETURNING 1
      ) SELECT COUNT(*) AS n FROM deleted`,
      [syncStartTimestamp]
    )
    stats.execucao_purged = parseInt(execPurge.rows[0].n, 10)

    if (stats.propostas_purged > 0 || stats.execucao_purged > 0) {
      console.log(`[tgov-only-sync] STEP F: purged ${stats.propostas_purged} propostas + ${stats.execucao_purged} execucao stale rows`)
    }
  } finally {
    client.release()
  }

  stats.duration_ms = Date.now() - startTime
  console.log(`[tgov-only-sync] Done in ${stats.duration_ms}ms:`, JSON.stringify(stats))
  return stats
}
