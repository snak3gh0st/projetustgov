// ============================================================================
// repo-sync.ts — Daily lead sync from TransferenciaGov open data
// ============================================================================
//
// ENRICHMENT PIPELINE:
//
//   Source 1: siconv_proponentes (CSV from repositorio.dados.gov.br)
//   - Covers 64% of CNPJs (238/374)
//   - Provides: telefone, email, nome, UF, municipio
//   - Does NOT provide: endereco
//
//   Source 2: BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/)
//   - Covers the remaining 36% + fills gaps from Source 1
//   - Provides: telefone, email, endereco, nome, natureza_juridica, UF, municipio
//   - Only source of endereco data
//
//   COALESCE rule: proponentes fills first, BrasilAPI fills empty fields.
//   Manually-edited CRM data (by vendedores) is NEVER overwritten.
//
//   Current coverage: 97% telefone, 81% email, 100% endereco, 100% nome
//   9 leads have no contact (neither source had data)
//
// SYNC BEHAVIOR (UPSERT via ON CONFLICT cnpj+codigo_programa+nr_emenda, one row per emenda):
//   - ALWAYS updates: valor_emenda, nr_emenda, parlamentar, nome_programa,
//     orgao_concedente, link_externo, qualificacao (repo data)
//   - NEVER updates: vendedor_id, status_contato, valor_venda, comissao_*,
//     tipo_vendedor, observacoes, comissao_locked, comissao_bonus (CRM state)
//   - COALESCE updates: uf, municipio, telefone, email, nome (fill if empty)
//
// CRON: Vercel cron triggers /api/cron/sync-leads daily at 06:00 UTC (03:00 BRT)
// ============================================================================
//
// Used by /api/cron/sync-leads for daily automated sync
// Ported from scripts/import-repo-auto.mjs with UPSERT instead of TRUNCATE+INSERT

import { Readable } from 'stream'
import { createInflateRaw } from 'zlib'
import { createInterface } from 'readline'
import { getPool } from '@/lib/db'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const ZIP_FILES = {
  programa: `${REPO_BASE}/siconv_programa.csv.zip`,
  emenda: `${REPO_BASE}/siconv_emenda.csv.zip`,
  proponentes: `${REPO_BASE}/siconv_proponentes.csv.zip`,
}

// ---------------------------------------------------------------------------
// Helper functions (ported from import-repo-auto.mjs)
// ---------------------------------------------------------------------------

function cleanCNPJ(val: string | null | undefined): string | null {
  if (!val) return null
  const str = String(val).replace(/\D/g, '')
  if (str.length < 11) return null
  return str.padStart(14, '0')
}

function parseBRNumber(val: string | null | undefined): number {
  if (!val || String(val).trim() === '') return 0
  const str = String(val).trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  // Strip trunk prefix 0 (e.g., 09132264140 -> 9132264140)
  if (digits.length === 11 && digits.startsWith('0') && !digits.startsWith('0800')) {
    const ddd = digits.slice(1, 3)
    if (parseInt(ddd) >= 11) digits = digits.slice(1)
  }
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length >= 8) return raw
  return null
}

function fixText(text: string | null | undefined): string | null {
  if (!text) return null
  let s = String(text)

  // Fix known '?' replacements in program names
  const qReplacements: Record<string, string> = {
    'A??es': 'Acoes', 'A??O': 'ACAO', 'a??es': 'acoes', 'a??o': 'acao',
    'Excel?ncia': 'Excelencia', 'EXCEL?NCIA': 'EXCELENCIA',
    'Solid?ria': 'Solidaria', 'SOLID?RIA': 'SOLIDARIA',
    'Sustent?veis': 'Sustentaveis', 'SUSTENT?VEIS': 'SUSTENTAVEIS',
    'Sustent?vel': 'Sustentavel', 'SUSTENT?VEL': 'SUSTENTAVEL',
    'Agroind?stria': 'Agroindustria', 'AGROIND?STRIA': 'AGROINDUSTRIA',
    'Agropecu?rio': 'Agropecuario', 'AGROPECU?RIO': 'AGROPECUARIO',
    'Crian?a': 'Crianca', 'CRIAN?A': 'CRIANCA',
    'Sa?de': 'Saude', 'SA?DE': 'SAUDE',
    'Ci?ncia': 'Ciencia', 'CI?NCIA': 'CIENCIA',
    'Tecnol?gico': 'Tecnologico', 'TECNOL?GICO': 'TECNOLOGICO',
    'Tur?stico': 'Turistico', 'TUR?STICO': 'TURISTICO',
    'Econ?mico': 'Economico', 'ECON?MICO': 'ECONOMICO',
    'P?blico': 'Publico', 'P?BLICO': 'PUBLICO',
    'P?blica': 'Publica', 'P?BLICA': 'PUBLICA',
    'Educa??o': 'Educacao', 'EDUCA??O': 'EDUCACAO',
    'Habita??o': 'Habitacao', 'HABITA??O': 'HABITACAO',
    'Prote??o': 'Protecao', 'PROTE??O': 'PROTECAO',
    'Produ??o': 'Producao', 'PRODU??O': 'PRODUCAO',
    'Alimenta??o': 'Alimentacao', 'ALIMENTA??O': 'ALIMENTACAO',
    'Promo??o': 'Promocao', 'PROMO??O': 'PROMOCAO',
    'Inova??o': 'Inovacao', 'INOVA??O': 'INOVACAO',
    'Conserva??o': 'Conservacao', 'CONSERVA??O': 'CONSERVACAO',
    'Gest?o': 'Gestao', 'GEST?O': 'GESTAO',
    'Integra??o': 'Integracao', 'INTEGRA??O': 'INTEGRACAO',
    'Inclus?o': 'Inclusao', 'INCLUS?O': 'INCLUSAO',
    'Previd?ncia': 'Previdencia', 'PREVID?NCIA': 'PREVIDENCIA',
    'Ind?gena': 'Indigena', 'IND?GENA': 'INDIGENA',
    'Assist?ncia': 'Assistencia', 'ASSIST?NCIA': 'ASSISTENCIA',
    'Seguran?a': 'Seguranca', 'SEGURAN?A': 'SEGURANCA',
    'Cidad?o': 'Cidadao', 'CIDAD?O': 'CIDADAO',
    'Econ?mica': 'Economica', 'ECON?MICA': 'ECONOMICA',
  }
  for (const [wrong, right] of Object.entries(qReplacements)) {
    if (s.includes(wrong)) s = s.replaceAll(wrong, right)
  }

  // Now apply proper accent fixes to the cleaned-up text
  const accentFixes: Record<string, string> = {
    'Acoes': 'Ações', 'ACAO': 'AÇÃO', 'acoes': 'ações', 'acao': 'ação',
    'Excelencia': 'Excelência', 'EXCELENCIA': 'EXCELÊNCIA',
    'Solidaria': 'Solidária', 'SOLIDARIA': 'SOLIDÁRIA',
    'Sustentaveis': 'Sustentáveis', 'SUSTENTAVEIS': 'SUSTENTÁVEIS',
    'Sustentavel': 'Sustentável', 'SUSTENTAVEL': 'SUSTENTÁVEL',
    'Agroindustria': 'Agroindústria', 'AGROINDUSTRIA': 'AGROINDÚSTRIA',
    'Agropecuario': 'Agropecuário', 'AGROPECUARIO': 'AGROPECUÁRIO',
    'Crianca': 'Criança', 'CRIANCA': 'CRIANÇA',
    'Saude': 'Saúde', 'SAUDE': 'SAÚDE',
    'Ciencia': 'Ciência', 'CIENCIA': 'CIÊNCIA',
    'Tecnologico': 'Tecnológico', 'TECNOLOGICO': 'TECNOLÓGICO',
    'Turistico': 'Turístico', 'TURISTICO': 'TURÍSTICO',
    'Economico': 'Econômico', 'ECONOMICO': 'ECONÔMICO',
    'Publico': 'Público', 'PUBLICO': 'PÚBLICO',
    'Publica': 'Pública', 'PUBLICA': 'PÚBLICA',
    'Educacao': 'Educação', 'EDUCACAO': 'EDUCAÇÃO',
    'Habitacao': 'Habitação', 'HABITACAO': 'HABITAÇÃO',
    'Protecao': 'Proteção', 'PROTECAO': 'PROTEÇÃO',
    'Producao': 'Produção', 'PRODUCAO': 'PRODUÇÃO',
    'Alimentacao': 'Alimentação', 'ALIMENTACAO': 'ALIMENTAÇÃO',
    'Promocao': 'Promoção', 'PROMOCAO': 'PROMOÇÃO',
    'Inovacao': 'Inovação', 'INOVACAO': 'INOVAÇÃO',
    'Conservacao': 'Conservação', 'CONSERVACAO': 'CONSERVAÇÃO',
    'Gestao': 'Gestão', 'GESTAO': 'GESTÃO',
    'Integracao': 'Integração', 'INTEGRACAO': 'INTEGRAÇÃO',
    'Inclusao': 'Inclusão', 'INCLUSAO': 'INCLUSÃO',
    'Previdencia': 'Previdência', 'PREVIDENCIA': 'PREVIDÊNCIA',
    'Indigena': 'Indígena', 'INDIGENA': 'INDÍGENA',
    'Assistencia': 'Assistência', 'ASSISTENCIA': 'ASSISTÊNCIA',
    'Seguranca': 'Segurança', 'SEGURANCA': 'SEGURANÇA',
    'Cidadao': 'Cidadão', 'CIDADAO': 'CIDADÃO',
    'Economica': 'Econômica', 'ECONOMICA': 'ECONÔMICA',
    'MINISTERIO': 'MINISTÉRIO',
    'PECUARIA': 'PECUÁRIA',
    'JUSTICA': 'JUSTIÇA',
    'COMUNICACOES': 'COMUNICAÇÕES',
    'COMUNICACAO': 'COMUNICAÇÃO',
    'ORCAMENTO': 'ORÇAMENTO',
  }
  for (const [wrong, right] of Object.entries(accentFixes)) {
    if (s.includes(wrong)) s = s.replaceAll(wrong, right)
  }

  return s
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// ZIP download + stream CSV parsing (no external dependencies)
// ---------------------------------------------------------------------------

async function downloadAndStreamCSV(
  url: string,
  onRow: (row: Record<string, string>) => void
): Promise<number> {
  console.log(`[repo-sync] Downloading ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const zipBuffer = Buffer.from(await res.arrayBuffer())
  console.log(`[repo-sync] Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB`)

  // Parse ZIP local file header to find compressed data
  const sig = zipBuffer.readUInt32LE(0)
  if (sig !== 0x04034b50) throw new Error('Not a valid ZIP file')
  const compressionMethod = zipBuffer.readUInt16LE(8)
  const filenameLen = zipBuffer.readUInt16LE(26)
  const extraLen = zipBuffer.readUInt16LE(28)
  const dataOffset = 30 + filenameLen + extraLen
  const compressedSize = zipBuffer.readUInt32LE(18)

  // Extract compressed payload
  const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize)

  let csvStream: NodeJS.ReadableStream

  if (compressionMethod === 0) {
    // Stored (no compression)
    csvStream = Readable.from(compressedData)
  } else {
    // Deflate compressed -- stream through inflateRaw into readline
    const inflateStream = createInflateRaw()
    const readable = Readable.from(compressedData)
    csvStream = readable.pipe(inflateStream)
  }

  let headers: string[] | null = null
  let rowCount = 0
  const rl = createInterface({ input: csvStream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split(';')
    if (!headers) {
      headers = cols.map((h: string) => h.replace(/^\ufeff/, '').trim())
      continue
    }
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cols[i] || '').trim()
    }
    onRow(row)
    rowCount++
  }

  console.log(`[repo-sync] Parsed ${rowCount} rows from ${url.split('/').pop()}`)
  return rowCount
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncStats {
  downloaded: number
  programas_filtered: number
  emendas_matched: number
  leads_total: number
  inserted: number
  updated: number
  enriched_api: number
  contacts_created: number
  errors: number
  duration_ms: number
  programs_scanned: number
  programs_dropped_nat_jur: number
}

interface ProgramaInfo {
  cod: string
  nome: string
  orgao: string
  modalidade: string
}

interface EmendaRecord {
  valor: number
  nr_emenda: string
  parlamentar: string
  tipo: string
  qualificacao: string
}

interface ProponenteInfo {
  nome: string
  uf: string
  municipio: string
  endereco: string
  email: string
  telefone: string
}

interface LeadData {
  cnpj: string
  nome: string | null
  uf: string | null
  municipio: string | null
  email: string | null
  telefone: string | null
  codigo_programa: string
  nome_programa: string | null
  orgao_concedente: string | null
  link_externo: string
  valor_emenda: number | null
  nr_emenda: string | null
  parlamentar: string | null
  qualificacao: string | null
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncLeadsFromRepo(): Promise<SyncStats> {
  const startTime = Date.now()
  const pool = getPool()

  const stats: SyncStats = {
    downloaded: 0,
    programas_filtered: 0,
    emendas_matched: 0,
    leads_total: 0,
    inserted: 0,
    updated: 0,
    enriched_api: 0,
    contacts_created: 0,
    errors: 0,
    duration_ms: 0,
    programs_scanned: 0,
    programs_dropped_nat_jur: 0,
  }

  // ========================================================================
  // STEP 1: Load siconv_programa (2026 + OSC)
  // ========================================================================
  console.log('[repo-sync] STEP 1: Loading siconv_programa (2026 + OSC)...')
  const programas = new Map<string, ProgramaInfo>() // id_programa -> info
  let totalProgramsScanned = 0
  let programsDroppedNatJur = 0
  const droppedNatJurSamples: string[] = []

  await downloadAndStreamCSV(ZIP_FILES.programa, (row) => {
    const ano = row.ANO_DISPONIBILIZACAO || ''
    const cod = row.COD_PROGRAMA || ''
    const natJur = row.NATUREZA_JURIDICA_PROGRAMA || ''
    const codeYear = cod.length >= 9 ? cod.substring(5, 9) : ''
    const is2026 = ano === '2026' || codeYear === '2026'
    totalProgramsScanned++
    if (!is2026) return
    // natJur filter removed — was too restrictive, blocked Ministério do Esporte and other valid programs
    // Log for observability only
    if (natJur) {
      programsDroppedNatJur++ // repurposed: counts programs WITH a natJur value (for logging)
      if (droppedNatJurSamples.length < 5) droppedNatJurSamples.push(natJur)
    }

    const idProg = row.ID_PROGRAMA || ''
    if (!idProg || programas.has(idProg)) return
    programas.set(idProg, {
      cod: row.COD_PROGRAMA || '',
      nome: row.NOME_PROGRAMA || '',
      orgao: row.DESC_ORGAO_SUP_PROGRAMA || '',
      modalidade: row.MODALIDADE_PROGRAMA || '',
    })
  })
  stats.downloaded++
  stats.programs_scanned = totalProgramsScanned
  stats.programs_dropped_nat_jur = 0 // no longer filtering by natJur
  console.log(`[repo-sync] Programs scanned (2026): ${totalProgramsScanned}, loaded: ${programas.size}`)
  console.log('[repo-sync] natJur samples seen:', droppedNatJurSamples)

  const validCods = new Set<string>()
  const codToId = new Map<string, string>()
  programas.forEach((info, id) => {
    validCods.add(info.cod)
    codToId.set(info.cod, id)
  })
  stats.programas_filtered = programas.size
  console.log(`[repo-sync] Programs loaded: ${programas.size} (2026 + OSC)`)

  // ========================================================================
  // STEP 2: Load siconv_emenda (filtered by our programs)
  // ========================================================================
  console.log('[repo-sync] STEP 2: Loading siconv_emenda...')
  const emendasMap = new Map<string, EmendaRecord[]>() // "cod|cnpj" -> emendas

  await downloadAndStreamCSV(ZIP_FILES.emenda, (row) => {
    const cod = row.COD_PROGRAMA_EMENDA || ''
    if (!validCods.has(cod)) return

    let cnpj = (row.BENEFICIARIO_EMENDA || '').replace(/\D/g, '')
    if (!cnpj) return
    cnpj = cnpj.padStart(14, '0')

    const key = `${cod}|${cnpj}`
    if (!emendasMap.has(key)) emendasMap.set(key, [])
    emendasMap.get(key)!.push({
      valor: parseBRNumber(row.VALOR_REPASSE_PROPOSTA_EMENDA),
      nr_emenda: row.NR_EMENDA || '',
      parlamentar: row.NOME_PARLAMENTAR || '',
      tipo: row.TIPO_PARLAMENTAR || '',
      qualificacao: row.QUALIF_PROPONENTE || '',
    })
  })
  stats.downloaded++
  stats.emendas_matched = emendasMap.size
  console.log(`[repo-sync] Emenda combos loaded: ${emendasMap.size}`)

  // ========================================================================
  // STEP 3: Load siconv_proponentes (contacts)
  // ========================================================================
  console.log('[repo-sync] STEP 3: Loading siconv_proponentes...')
  const proponentes = new Map<string, ProponenteInfo>()

  const neededCnpjs = new Set<string>()
  Array.from(emendasMap.keys()).forEach(key => {
    neededCnpjs.add(key.split('|')[1])
  })

  await downloadAndStreamCSV(ZIP_FILES.proponentes, (row) => {
    let cnpj = (row.IDENTIF_PROPONENTE || '').replace(/\D/g, '')
    if (!cnpj) return
    cnpj = cnpj.padStart(14, '0')
    if (!neededCnpjs.has(cnpj)) return
    if (proponentes.has(cnpj)) return

    proponentes.set(cnpj, {
      nome: row.NM_PROPONENTE || '',
      municipio: row.MUNICIPIO_PROPONENTE || '',
      uf: row.UF_PROPONENTE || '',
      endereco: row.ENDERECO_PROPONENTE || '',
      email: row.EMAIL_PROPONENTE || '',
      telefone: row.TELEFONE_PROPONENTE || '',
    })
  })
  stats.downloaded++
  console.log(`[repo-sync] Proponentes loaded: ${proponentes.size} (of ${neededCnpjs.size} needed)`)

  // ========================================================================
  // STEP 4: Build leads array
  // ========================================================================
  console.log('[repo-sync] STEP 4: Building leads...')
  const leads: LeadData[] = []

  Array.from(emendasMap.entries()).forEach(([key, emendas]) => {
    const [codProg, cnpj] = key.split('|')
    const idProg = codToId.get(codProg) || ''
    const prog = programas.get(idProg)
    const prop = proponentes.get(cnpj)

    const link = idProg
      ? `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarPrograma/ResultadoDaConsultaDeProgramaDeConvenioDetalhar.do?id=${idProg}&Usr=guest&Pwd=guest`
      : ''

    // Create one lead row per emenda so each parlamentar gets its own cascade row
    emendas.forEach((emenda: EmendaRecord) => {
      leads.push({
        cnpj,
        nome: prop?.nome || null,
        uf: prop?.uf || null,
        municipio: prop?.municipio || null,
        email: prop?.email || null,
        telefone: formatPhone(prop?.telefone) || null,
        codigo_programa: codProg,
        nome_programa: fixText(prog?.nome) || null,
        orgao_concedente: fixText(prog?.orgao) || null,
        link_externo: link,
        valor_emenda: emenda.valor > 0 ? emenda.valor : null,
        nr_emenda: emenda.nr_emenda || null,
        parlamentar: fixText(emenda.parlamentar) || null,
        qualificacao: emenda.qualificacao || null,
      })
    })
  })
  stats.leads_total = leads.length
  console.log(`[repo-sync] Leads built: ${leads.length}`)

  // ========================================================================
  // STEP 5: Load vendedor state from DB for round-robin assignment
  // ========================================================================
  console.log('[repo-sync] STEP 5: Loading vendedor state...')
  const client = await pool.connect()

  try {
    // Ensure cron_sync_log table exists (runs on every call, no-op after first)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cron_sync_log (
        id SERIAL PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        inserted INT NOT NULL DEFAULT 0,
        updated INT NOT NULL DEFAULT 0,
        errors INT NOT NULL DEFAULT 0,
        duration_ms INT NOT NULL DEFAULT 0
      )
    `)
    // Get active vendedores
    const vendedoresRes = await client.query(
      "SELECT id, email FROM users WHERE role IN ('vendedor', 'gestor_vendedor') AND active = true ORDER BY nome"
    )
    const vendedorIds: string[] = vendedoresRes.rows.map((u: { id: string }) => u.id)

    // Get existing lead assignments (to preserve vendedor_id on updates)
    // Also build a CNPJ-level map so if all emenda rows for a CNPJ were deleted during migration,
    // we can still restore the vendedor assignment to the newly-split emenda rows.
    const assignmentsRes = await client.query(
      "SELECT cnpj, codigo_programa, COALESCE(nr_emenda, '') as nr_emenda, vendedor_id FROM vendedor_projetos WHERE vendedor_id IS NOT NULL"
    )
    const existingAssignments = new Map<string, string>() // cnpj|nr_emenda -> vendedor_id
    const cnpjAssignments = new Map<string, string>()    // cnpj -> vendedor_id (fallback)
    for (const r of assignmentsRes.rows) {
      const key = r.nr_emenda
        ? `${r.cnpj}|${r.nr_emenda}`
        : `${r.cnpj}|${r.codigo_programa}`
      existingAssignments.set(key, r.vendedor_id)
      // CNPJ-level fallback: first vendedor found for a CNPJ (all emendas share same vendedor)
      if (!cnpjAssignments.has(r.cnpj)) {
        cnpjAssignments.set(r.cnpj, r.vendedor_id)
      }
    }

    // Get vendedor lead counts for round-robin
    const countsRes = await client.query(
      'SELECT vendedor_id, COUNT(*)::int as cnt FROM vendedor_projetos WHERE vendedor_id IS NOT NULL GROUP BY vendedor_id'
    )
    const vendedorCounts = new Map<string, number>()
    for (const vid of vendedorIds) vendedorCounts.set(vid, 0)
    for (const r of countsRes.rows) {
      if (vendedorCounts.has(r.vendedor_id)) vendedorCounts.set(r.vendedor_id, r.cnt)
    }

    // Pick the vendedor with fewest leads (least-loaded)
    const pickNextVendedor = (): string | null => {
      if (vendedorIds.length === 0) return null
      let minId = vendedorIds[0]
      let minCount = vendedorCounts.get(minId) ?? 0
      for (const vid of vendedorIds) {
        const c = vendedorCounts.get(vid) ?? 0
        if (c < minCount) { minCount = c; minId = vid }
      }
      return minId
    }

    // ========================================================================
    // STEP 5b: Clean up old concatenated emenda rows (migration from pre-emenda scheme)
    // Old sync stored multiple emendas per (cnpj, codigo_programa) as one row with pipe-separated
    // nr_emenda/parlamentar. Now that we read assignments above, we can safely delete these rows.
    // The next upsert will re-insert them as separate per-emenda rows with assignments preserved.
    // ========================================================================
    await client.query(`
      DELETE FROM vendedor_projetos
      WHERE importado_de = 'auto-repo-sync'
        AND (nr_emenda LIKE '%|%' OR parlamentar LIKE '%|%')
    `).catch(() => {})

    // ========================================================================
    // STEP 6: Load existing clients for flagging
    // ========================================================================
    const clientsRes = await client.query('SELECT cnpj FROM existing_clients').catch(() => ({ rows: [] as { cnpj: string }[] }))
    const existingClients = new Set<string>()
    for (const c of clientsRes.rows) {
      const cc = cleanCNPJ(c.cnpj)
      if (cc) existingClients.add(cc)
    }

    // Look up Paulo Gabriel for existing client routing
    const pauloRes = await client.query(
      "SELECT id FROM users WHERE email = 'paulo@projetus.org' AND active = true LIMIT 1"
    )
    const pauloId: string | null = pauloRes.rows[0]?.id ?? null
    if (!pauloId) {
      console.warn('[repo-sync] WARNING: Paulo Gabriel (paulo@projetus.org) not found or inactive, existing clients will use normal round-robin')
    }
    console.log(`[repo-sync] Existing client routing: Paulo ID=${pauloId}, existing client CNPJs=${existingClients.size}`)

    // ========================================================================
    // STEP 7: UPSERT leads in batches
    // ========================================================================
    console.log('[repo-sync] STEP 7: Upserting leads...')

    const UPSERT_SQL = `
      INSERT INTO vendedor_projetos (
        cnpj, codigo_programa, nome_programa, link_externo, orgao_concedente,
        uf, municipio, qualificacao, nr_emenda, parlamentar,
        nome, valor_emenda, vendedor_id, observacoes, importado_de, tipo_vendedor
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'auto-repo-sync',$15)
      ON CONFLICT (cnpj, codigo_programa, COALESCE(nr_emenda, '')) DO UPDATE SET
        nome_programa = EXCLUDED.nome_programa,
        link_externo = EXCLUDED.link_externo,
        orgao_concedente = EXCLUDED.orgao_concedente,
        uf = COALESCE(NULLIF(vendedor_projetos.uf, ''), EXCLUDED.uf),
        municipio = COALESCE(NULLIF(vendedor_projetos.municipio, ''), EXCLUDED.municipio),
        qualificacao = EXCLUDED.qualificacao,
        nr_emenda = EXCLUDED.nr_emenda,
        parlamentar = EXCLUDED.parlamentar,
        nome = CASE WHEN vendedor_projetos.nome = 'Sem nome' OR vendedor_projetos.nome IS NULL
                     THEN EXCLUDED.nome ELSE vendedor_projetos.nome END,
        valor_emenda = EXCLUDED.valor_emenda,
        telefone = COALESCE(NULLIF(vendedor_projetos.telefone, ''), EXCLUDED.telefone),
        email = COALESCE(NULLIF(vendedor_projetos.email, ''), EXCLUDED.email),
        updated_at = NOW()
      RETURNING (xmax = 0) AS was_inserted
    `
    // Note: vendedor_id, status_contato, valor_venda, comissao_*, tipo_vendedor,
    //       observacoes, comissao_locked, comissao_bonus, closer_id are NEVER touched by the UPDATE clause.

    const newCnpjsNeedingContacts = new Set<string>()

    for (const lead of leads) {
      // Use nr_emenda-based key if available, otherwise fall back to codigo_programa
      const assignmentKey = lead.nr_emenda
        ? `${lead.cnpj}|${lead.nr_emenda}`
        : `${lead.cnpj}|${lead.codigo_programa}`
      // Bug fix: use ONLY exact assignmentKey — cnpjAssignments.has(lead.cnpj) caused false positives
      // where a new emenda row for an existing CNPJ was incorrectly marked as isExisting=true.
      const isExisting = existingAssignments.has(assignmentKey)
      const isExistingClient = existingClients.has(lead.cnpj)

      // For new leads, assign vendedor via round-robin
      let vendedorId: string | null = null
      if (isExisting) {
        // Existing lead: keep current vendedor assignment.
        // Prefer exact emenda key match; fall back to CNPJ-level assignment (migration case).
        vendedorId = existingAssignments.get(assignmentKey) ?? cnpjAssignments.get(lead.cnpj) ?? null
      } else if (isExistingClient && pauloId) {
        // New lead from existing paying client: route directly to Paulo Gabriel
        vendedorId = pauloId
        vendedorCounts.set(pauloId, (vendedorCounts.get(pauloId) ?? 0) + 1)
      } else {
        // New lead: normal round-robin
        vendedorId = pickNextVendedor()
        if (vendedorId) {
          vendedorCounts.set(vendedorId, (vendedorCounts.get(vendedorId) ?? 0) + 1)
        }
      }

      const obs = isExistingClient ? 'JA E CLIENTE PROJETUS' : null
      // Existing clients routed to Paulo get tipo_vendedor = 'Exclusivo'
      const tipoVendedor = (isExistingClient && pauloId && vendedorId === pauloId) ? 'Exclusivo' : 'SDR'

      const values = [
        lead.cnpj,
        lead.codigo_programa,
        lead.nome_programa,
        lead.link_externo,
        lead.orgao_concedente,
        lead.uf ? lead.uf.toUpperCase() : null,
        lead.municipio,
        lead.qualificacao,
        lead.nr_emenda,
        lead.parlamentar,
        lead.nome || 'Sem nome',
        lead.valor_emenda,
        vendedorId,
        obs,
        tipoVendedor,
      ]

      try {
        const result = await client.query(UPSERT_SQL, values)
        // xmax = 0 means INSERT (new row), xmax != 0 means UPDATE (existing row)
        // Use actual DB result to track insert vs update — more reliable than isExisting proxy
        const wasInserted = result.rows[0]?.was_inserted === true
        if (wasInserted) {
          stats.inserted++
          if (!lead.telefone && !lead.email) {
            newCnpjsNeedingContacts.add(lead.cnpj)
          }
        } else {
          stats.updated++
        }
      } catch (err) {
        console.error(`[repo-sync] Upsert error CNPJ ${lead.cnpj}: ${err}`)
        stats.errors++
      }
    }

    console.log(`[repo-sync] Upserted: ${stats.inserted} new, ${stats.updated} updated, ${stats.errors} errors`)

    // ========================================================================
    // STEP 8: BrasilAPI enrichment for new leads missing contact data
    // ========================================================================
    const elapsed = Date.now() - startTime
    const cnpjsToEnrich = Array.from(newCnpjsNeedingContacts).slice(0, 20)

    // Map to store BrasilAPI contact data per CNPJ for use in STEP 9
    interface BrasilApiContactData {
      phone1: string | null
      phone2: string | null
      email: string | null
    }
    const brasilApiContacts = new Map<string, BrasilApiContactData>()

    if (cnpjsToEnrich.length > 0 && elapsed < 200000) {
      console.log(`[repo-sync] STEP 8: BrasilAPI enrichment for ${cnpjsToEnrich.length} CNPJs...`)

      for (const cnpj of cnpjsToEnrich) {
        // Check timeout before each API call
        if (Date.now() - startTime > 250000) {
          console.log('[repo-sync] Approaching timeout, stopping enrichment')
          break
        }

        try {
          const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
          })
          if (!apiRes.ok) { await delay(300); continue }

          const data = await apiRes.json()
          const phoneRaw = data.ddd_telefone_1 || ''
          const phone = formatPhone(phoneRaw)
          const phone2Raw = data.ddd_telefone_2 || ''
          const phone2 = formatPhone(phone2Raw)
          const rawEmail = (data.email || '').trim().toLowerCase()
          const email = rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@') ? rawEmail : null
          const nome = data.razao_social || data.nome_fantasia || null
          const natJur = data.natureza_juridica ? String(data.natureza_juridica).replace(/^\d+\s*-\s*/, '') : null

          // Build address
          const addrParts = [
            data.logradouro,
            data.numero && data.numero !== 'S/N' ? data.numero : null,
            data.complemento,
            data.bairro,
          ].filter(Boolean)
          const cep = data.cep ? String(data.cep).replace(/\D/g, '') : null
          const endereco = addrParts.length > 0
            ? addrParts.join(', ') + (cep ? ` - CEP ${cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : '')
            : null
          const apiUf = data.uf || null
          const apiMunicipio = data.municipio || null

          // Store BrasilAPI contact data for STEP 9
          if (phone || phone2 || email) {
            brasilApiContacts.set(cnpj, { phone1: phone, phone2, email })
          }

          if (!phone && !email && !nome && !endereco) { await delay(300); continue }

          const updates: string[] = []
          const params: unknown[] = []
          let idx = 1
          if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx++})`); params.push(phone) }
          if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${idx++})`); params.push(email) }
          if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${idx++} ELSE nome END`); params.push(nome) }
          if (natJur) { updates.push(`natureza_juridica = COALESCE(natureza_juridica, $${idx++})`); params.push(natJur) }
          if (endereco) { updates.push(`endereco = COALESCE(NULLIF(endereco, ''), $${idx++})`); params.push(endereco) }
          if (apiUf) { updates.push(`uf = COALESCE(NULLIF(uf, ''), $${idx++})`); params.push(apiUf) }
          if (apiMunicipio) { updates.push(`municipio = COALESCE(NULLIF(municipio, ''), $${idx++})`); params.push(apiMunicipio) }
          updates.push('updated_at = NOW()')
          params.push(cnpj)

          await client.query(
            `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx}`,
            params
          )
          stats.enriched_api++
        } catch {
          // BrasilAPI timeout or error -- skip
        }
        await delay(300)
      }
      console.log(`[repo-sync] BrasilAPI enriched: ${stats.enriched_api}`)
    } else {
      console.log('[repo-sync] STEP 8: Skipped BrasilAPI enrichment (no new leads missing contacts or timeout approaching)')
    }

    // ========================================================================
    // STEP 9: Populate lead_contacts from enrichment data (ALL CNPJs in batch)
    // ========================================================================
    const elapsedBeforeStep9 = Date.now() - startTime
    if (elapsedBeforeStep9 < 200000) {
      console.log('[repo-sync] STEP 9: Populating lead_contacts from enrichment data...')

      // Get all unique CNPJs from the current sync batch
      const allSyncCnpjs = Array.from(new Set(leads.map(l => l.cnpj)))

      // Helper: normalize phone by stripping non-digits
      const normalizePhone = (phone: string | null | undefined): string =>
        phone ? String(phone).replace(/\D/g, '') : ''

      // Helper: normalize email by lowercasing and trimming
      const normalizeEmail = (email: string | null | undefined): string =>
        email ? String(email).trim().toLowerCase() : ''

      for (const cnpj of allSyncCnpjs) {
        // Check timeout
        if (Date.now() - startTime > 250000) {
          console.log('[repo-sync] STEP 9: Approaching timeout, stopping contact population')
          break
        }

        try {
          // Query existing contacts for this CNPJ
          const existingRes = await client.query(
            'SELECT telefone, email FROM lead_contacts WHERE lead_cnpj = $1',
            [cnpj]
          )
          const existingContacts: { telefone: string | null; email: string | null }[] = existingRes.rows
          const hasExistingContacts = existingContacts.length > 0

          // Build set of existing normalized phones and emails for duplicate detection
          const existingPhones = new Set<string>()
          const existingEmails = new Set<string>()
          for (const c of existingContacts) {
            const p = normalizePhone(c.telefone)
            const e = normalizeEmail(c.email)
            if (p) existingPhones.add(p)
            if (e) existingEmails.add(e)
          }

          // Helper: check if a contact would be a duplicate
          const isDuplicate = (telefone: string | null, email: string | null): boolean => {
            const p = normalizePhone(telefone)
            const e = normalizeEmail(email)
            if (p && existingPhones.has(p)) return true
            if (e && existingEmails.has(e)) return true
            return false
          }

          // Helper: insert a contact and track it
          let firstContactForCnpj = !hasExistingContacts
          const insertContact = async (telefone: string | null, email: string | null): Promise<boolean> => {
            if (!telefone && !email) return false
            if (isDuplicate(telefone, email)) return false

            const principal = firstContactForCnpj
            firstContactForCnpj = false

            await client.query(
              `INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
               VALUES ($1, $2, $3, $4, 'desconhecido')`,
              [cnpj, telefone || null, email || null, principal]
            )

            // Update tracking sets to avoid duplicates within the same CNPJ batch
            const p = normalizePhone(telefone)
            const e = normalizeEmail(email)
            if (p) existingPhones.add(p)
            if (e) existingEmails.add(e)
            stats.contacts_created++
            return true
          }

          // Source 1: siconv_proponentes data
          const prop = proponentes.get(cnpj)
          if (prop) {
            const propPhone = formatPhone(prop.telefone)
            const propEmail = prop.email && prop.email.includes('@') ? prop.email.trim().toLowerCase() : null
            if (propPhone || propEmail) {
              await insertContact(propPhone, propEmail)
            }
          }

          // Source 2: BrasilAPI data (phone1 + email)
          const apiData = brasilApiContacts.get(cnpj)
          if (apiData) {
            if (apiData.phone1 || apiData.email) {
              await insertContact(apiData.phone1, apiData.email)
            }
            // BrasilAPI phone2 as separate entry (no email, only if different from phone1)
            if (apiData.phone2) {
              const phone2Digits = normalizePhone(apiData.phone2)
              const phone1Digits = normalizePhone(apiData.phone1)
              if (phone2Digits && phone2Digits !== phone1Digits) {
                await insertContact(apiData.phone2, null)
              }
            }
          }
        } catch (err) {
          console.error(`[repo-sync] STEP 9: Error processing contacts for CNPJ ${cnpj}: ${err}`)
        }
      }

      console.log(`[repo-sync] STEP 9: Contacts created: ${stats.contacts_created}`)
    } else {
      console.log('[repo-sync] STEP 9: Skipped (timeout approaching)')
    }

  } finally {
    // Calculate duration before logging
    stats.duration_ms = Date.now() - startTime

    // Write sync log row — wrapped in try/catch so a logging failure never breaks the sync
    try {
      await client.query(
        `INSERT INTO cron_sync_log (ran_at, inserted, updated, errors, duration_ms)
         VALUES (NOW(), $1, $2, $3, $4)`,
        [stats.inserted, stats.updated, stats.errors, stats.duration_ms]
      )
    } catch (logErr) {
      console.warn('[repo-sync] Failed to write cron_sync_log row:', logErr)
    }

    client.release()
  }

  console.log(`[repo-sync] Complete in ${(stats.duration_ms / 1000).toFixed(1)}s | contacts_created: ${stats.contacts_created}`)
  return stats
}
