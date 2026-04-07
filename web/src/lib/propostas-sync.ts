// ============================================================================
// propostas-sync.ts — Daily sync of propostas from TransferenciaGov open data
// ============================================================================
//
// Populates the `propostas` table from siconv_proposta.csv.zip
// Filters by whitelist scope: existing_clients + vendedor_projetos + tgov_whitelist
// Syncs ALL years for matching CNPJs/nr_propostas.
//
// Source: https://repositorio.dados.gov.br/seges/detru/siconv_proposta.csv.zip
//
// UPSERT: ON CONFLICT (transfer_gov_id) DO UPDATE
// Called by: /api/cron/sync-propostas
// ============================================================================

import { getPool } from '@/lib/db'
import { buildStructuredLeadScopeSql } from '@/lib/crm-scope'
import { cleanCNPJ, fixText, downloadAndStreamCSV } from '@/lib/repo-sync'
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov'

const PROPOSTA_URL = 'https://repositorio.dados.gov.br/seges/detru/siconv_proposta.csv.zip'

export interface PropostasSyncStats {
  rows_scanned: number
  rows_matched: number
  cnpjs_in_scope: number
  nr_propostas_in_whitelist: number
  inserted: number
  updated: number
  errors: number
  duration_ms: number
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

/** Build ISO date from separate day/month/year fields (DIA_PROP, MES_PROP, ANO_PROP) */
function buildDate(dia: string | undefined, mes: string | undefined, ano: string | undefined): string | null {
  const d = parseInt(dia || '', 10)
  const m = parseInt(mes || '', 10)
  const y = parseInt(ano || '', 10)
  if (!d || !m || !y || y < 1900) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseBRNumber(val: string | null | undefined): number | null {
  if (!val || !val.trim()) return null
  const cleaned = val.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

interface PropostaRow {
  transfer_gov_id: string
  nr_proposta: string | null
  titulo: string | null
  valor_global: number | null
  valor_repasse: number | null
  valor_contrapartida: number | null
  data_publicacao: string | null
  situacao: string | null
  estado: string | null
  municipio: string | null
  proponente: string | null
  proponente_cnpj: string | null
  modalidade: string | null
  orgao_superior: string | null
  orgao_vinculado: string | null
}

export async function syncPropostas(): Promise<PropostasSyncStats> {
  const startTime = Date.now()

  const stats: PropostasSyncStats = {
    rows_scanned: 0,
    rows_matched: 0,
    cnpjs_in_scope: 0,
    nr_propostas_in_whitelist: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    duration_ms: 0,
  }

  // -------------------------------------------------------------------------
  // STEP A: Load scope — CNPJs from clients + whitelist nr_propostas
  // -------------------------------------------------------------------------
  const pool = getPool()
  const structuredLeadScopeSql = buildStructuredLeadScopeSql('vp')

  const cnpjResult = await pool.query<{ cnpj: string }>(`
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
  const cnpjSet = new Set(cnpjResult.rows.map(r => r.cnpj))
  stats.cnpjs_in_scope = cnpjSet.size

  const whitelistNrResult = await pool.query<{ nr_proposta: string }>(
    `SELECT nr_proposta FROM tgov_whitelist WHERE nr_proposta IS NOT NULL`
  )
  const whitelistNrSet = new Set<string>(whitelistNrResult.rows.map(r => r.nr_proposta.replace(/^0+/, '')))

  // Include hardcoded scope sets used by the read APIs (/api/tgov/*). Without
  // these, propostas listed there but whose CNPJ isn't in CRM clients never
  // get refreshed by the daily sync.
  Array.from(APROVACAO_NR_PROPOSTAS).forEach(nr => whitelistNrSet.add(nr.replace(/^0+/, '')))
  Array.from(EXECUCAO_NR_PROPOSTAS).forEach(nr => whitelistNrSet.add(nr.replace(/^0+/, '')))

  stats.nr_propostas_in_whitelist = whitelistNrSet.size

  console.log(`[propostas-sync] STEP A: ${cnpjSet.size} CNPJs in scope, ${whitelistNrSet.size} nr_propostas in whitelist`)

  // -------------------------------------------------------------------------
  // STEP B: Stream siconv_proposta.csv.zip — filter by scope
  // -------------------------------------------------------------------------
  const rows: PropostaRow[] = []

  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    stats.rows_scanned++

    if (stats.rows_scanned === 1) {
      console.log('[propostas-sync] CSV headers:', Object.keys(row))
    }

    const rawCnpj = row['IDENTIF_PROPONENTE'] || row['CNPJ_PROPONENTE'] || null
    const cnpj = cleanCNPJ(rawCnpj)
    const nrProposta = (row['NR_PROPOSTA'] || '').replace(/^0+/, '') || null

    // Match by CNPJ or by whitelisted nr_proposta
    const cnpjMatch = cnpj && cnpjSet.has(cnpj)
    const nrMatch = nrProposta && whitelistNrSet.has(nrProposta)

    if (!cnpjMatch && !nrMatch) return

    stats.rows_matched++

    rows.push({
      transfer_gov_id: row['ID_PROPOSTA'],
      nr_proposta: nrProposta,
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

  console.log(`[propostas-sync] STEP B: scanned=${stats.rows_scanned}, matched=${stats.rows_matched}`)

  // -------------------------------------------------------------------------
  // STEP C: Batch UPSERT into propostas
  // -------------------------------------------------------------------------
  const client = await pool.connect()

  const UPSERT_SQL = `
    INSERT INTO propostas (
      transfer_gov_id, nr_proposta, titulo,
      valor_global, valor_repasse, valor_contrapartida,
      data_publicacao, situacao, estado, municipio,
      proponente, proponente_cnpj,
      modalidade, orgao_superior, orgao_vinculado,
      extraction_date, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, CURRENT_DATE, NOW())
    ON CONFLICT (transfer_gov_id) DO UPDATE SET
      nr_proposta         = EXCLUDED.nr_proposta,
      titulo              = EXCLUDED.titulo,
      valor_global        = EXCLUDED.valor_global,
      valor_repasse       = EXCLUDED.valor_repasse,
      valor_contrapartida = EXCLUDED.valor_contrapartida,
      data_publicacao     = EXCLUDED.data_publicacao,
      situacao            = EXCLUDED.situacao,
      estado              = EXCLUDED.estado,
      municipio           = EXCLUDED.municipio,
      proponente          = EXCLUDED.proponente,
      proponente_cnpj     = EXCLUDED.proponente_cnpj,
      modalidade          = EXCLUDED.modalidade,
      orgao_superior      = EXCLUDED.orgao_superior,
      orgao_vinculado     = EXCLUDED.orgao_vinculado,
      extraction_date     = CURRENT_DATE,
      updated_at          = NOW()
  `

  try {
    const beforeResult = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM propostas')
    const rowsBefore = parseInt(beforeResult.rows[0].n, 10)

    for (const row of rows) {
      try {
        await client.query(UPSERT_SQL, [
          row.transfer_gov_id,
          row.nr_proposta,
          row.titulo,
          row.valor_global,
          row.valor_repasse,
          row.valor_contrapartida,
          row.data_publicacao,
          row.situacao,
          row.estado,
          row.municipio,
          row.proponente,
          row.proponente_cnpj,
          row.modalidade,
          row.orgao_superior,
          row.orgao_vinculado,
        ])
      } catch (err) {
        stats.errors++
        if (stats.errors <= 5) {
          console.error(`[propostas-sync] UPSERT error for ${row.transfer_gov_id}:`, err)
        }
      }
    }

    const afterResult = await client.query<{ n: string }>('SELECT COUNT(*) AS n FROM propostas')
    const rowsAfter = parseInt(afterResult.rows[0].n, 10)
    stats.inserted = rowsAfter - rowsBefore
    stats.updated = rows.length - stats.errors - stats.inserted

    console.log(`[propostas-sync] STEP C: inserted=${stats.inserted}, updated=${stats.updated}, errors=${stats.errors}`)

    // Log to cron_sync_log
    await client.query(
      `INSERT INTO cron_sync_log (inserted, updated, errors, duration_ms, source)
       VALUES ($1, $2, $3, $4, 'sync-propostas')`,
      [stats.inserted, stats.updated, stats.errors, Date.now() - startTime]
    )
  } finally {
    client.release()
  }

  stats.duration_ms = Date.now() - startTime
  console.log(`[propostas-sync] Complete in ${stats.duration_ms}ms`)
  return stats
}
