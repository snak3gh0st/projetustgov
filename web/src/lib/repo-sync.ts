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
// CRON: Vercel cron triggers /api/cron/sync-leads daily at 12:30 UTC (09:30 BRT)
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

export function cleanCNPJ(val: string | null | undefined): string | null {
  if (!val) return null
  const str = String(val).replace(/\D/g, '')
  if (str.length < 11) return null
  return str.padStart(14, '0')
}

export function parseBRNumber(val: string | null | undefined): number {
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

export function fixText(text: string | null | undefined): string | null {
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

export async function downloadAndStreamCSV(
  url: string,
  onRow: (row: Record<string, string>) => void | boolean
): Promise<number> {
  console.log(`[repo-sync] Downloading ${url}...`)

  // Retry up to 2 times (3 total attempts) with a 3s delay between retries.
  // Each attempt has a 120s timeout — long enough for large government ZIPs but
  // short enough to fail fast if the server is truly down.
  const MAX_ATTEMPTS = 3
  const RETRY_DELAY_MS = 3000
  const DOWNLOAD_TIMEOUT_MS = 120_000

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
      const zipBuffer = Buffer.from(await res.arrayBuffer())

      // Successfully downloaded — break out of retry loop and continue processing
      console.log(`[repo-sync] Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB (attempt ${attempt})`)
      return await _parseZipBuffer(zipBuffer, url, onRow)
    } catch (err) {
      lastError = err
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[repo-sync] Download attempt ${attempt} failed for ${url}: ${err}. Retrying in ${RETRY_DELAY_MS / 1000}s...`)
        await delay(RETRY_DELAY_MS)
      }
    }
  }
  throw new Error(`Servidor do governo indisponível após ${MAX_ATTEMPTS} tentativas (${url}): ${lastError}`)
}

async function _parseZipBuffer(
  zipBuffer: Buffer,
  url: string,
  onRow: (row: Record<string, string>) => void | boolean
): Promise<number> {
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
    const shouldContinue = onRow(row)
    rowCount++
    if (shouldContinue === false) break
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
    // Only include OSC programs (Organização da Sociedade Civil)
    // Drops municipalities (Administração Pública Municipal) and other non-OSC types
    if (!natJur.toLowerCase().includes('civil') && !natJur.toLowerCase().includes('organiza')) {
      programsDroppedNatJur++
      if (droppedNatJurSamples.length < 5) droppedNatJurSamples.push(natJur)
      return
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
  stats.programs_dropped_nat_jur = programsDroppedNatJur
  console.log(`[repo-sync] Programs scanned (2026): ${totalProgramsScanned}, dropped (non-OSC): ${programsDroppedNatJur}, loaded: ${programas.size}`)
  console.log('[repo-sync] Non-OSC natJur samples:', droppedNatJurSamples)

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
  // Call getPool() here (not the reference captured at start) — avoids stale pool if
  // db.ts retry logic reset the singleton between STEP 1-4 and now.
  const client = await getPool().connect()

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

    // Ensure enrichment_queue table exists — tracks BrasilAPI enrichment per CNPJ
    // status: pending (needs enrichment), done (enriched), no_data (API has no contact),
    //         error (API failed, will retry), rate_limited (403, retry next sync)
    await client.query(`
      CREATE TABLE IF NOT EXISTS enrichment_queue (
        cnpj VARCHAR(20) PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        last_attempt TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // Get active vendedores
    const vendedoresRes = await client.query(
      "SELECT id, email FROM users WHERE role = 'vendedor' AND active = true ORDER BY nome"
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

    // Note: vendedor_id, status_contato, valor_venda, comissao_*, tipo_vendedor,
    //       observacoes, comissao_locked, comissao_bonus, closer_id are NEVER touched by the UPDATE clause.

    const newCnpjsNeedingContacts = new Set<string>()

    // Deduplicate leads by conflict key (cnpj + codigo_programa + nr_emenda) before batching.
    // PostgreSQL rejects ON CONFLICT DO UPDATE when the same row appears twice in one statement.
    // In row-by-row mode this was silently fine; in batch mode we must deduplicate first.
    // Strategy: use a Map keyed by conflict key — last occurrence wins (matches prior behavior).
    type LeadWithVendedor = {
      lead: typeof leads[0]
      vendedorId: string | null
      obs: string | null
      tipoVendedor: string
    }
    const dedupMap = new Map<string, LeadWithVendedor>()

    // Build typed arrays for batch unnest upsert (one entry per lead, matching column order)
    const bCnpj: (string | null)[] = []
    const bCodigoPrograma: (string | null)[] = []
    const bNomePrograma: (string | null)[] = []
    const bLinkExterno: (string | null)[] = []
    const bOrgaoConcedente: (string | null)[] = []
    const bUf: (string | null)[] = []
    const bMunicipio: (string | null)[] = []
    const bQualificacao: (string | null)[] = []
    const bNrEmenda: (string | null)[] = []
    const bParlamentar: (string | null)[] = []
    const bNome: (string | null)[] = []
    const bValorEmenda: (number | null)[] = []
    const bVendedorId: (string | null)[] = []
    const bObservacoes: (string | null)[] = []
    const bTipoVendedor: (string | null)[] = []
    const bTelefone: (string | null)[] = []
    const bEmail: (string | null)[] = []

    for (const lead of leads) {
      // Use nr_emenda-based key if available, otherwise fall back to codigo_programa
      const assignmentKey = lead.nr_emenda
        ? `${lead.cnpj}|${lead.nr_emenda}`
        : `${lead.cnpj}|${lead.codigo_programa}`
      // isExisting: this exact emenda row already exists in DB (preserve its vendedor assignment)
      const isExisting = existingAssignments.has(assignmentKey)
      const isExistingClient = existingClients.has(lead.cnpj)

      // For new leads, assign vendedor via round-robin — but keep all emendas of a CNPJ
      // under the same vendedor. If a CNPJ already has any assignment, inherit it.
      let vendedorId: string | null = null
      if (isExisting) {
        // Existing lead: keep current vendedor assignment.
        // Prefer exact emenda key match; fall back to CNPJ-level assignment (migration case).
        vendedorId = existingAssignments.get(assignmentKey) ?? cnpjAssignments.get(lead.cnpj) ?? null
      } else if (isExistingClient && pauloId) {
        // New lead from existing paying client: route directly to Paulo Gabriel
        vendedorId = pauloId
        vendedorCounts.set(pauloId, (vendedorCounts.get(pauloId) ?? 0) + 1)
      } else if (cnpjAssignments.has(lead.cnpj)) {
        // New emenda for a CNPJ that already has rows — inherit the existing vendedor.
        // This ensures all emendas of the same organization go to the same vendedor,
        // preventing split assignments where two vendedores unknowingly work the same org.
        vendedorId = cnpjAssignments.get(lead.cnpj)!
        // Do NOT increment vendedorCounts — this isn't a new allocation, it's inheritance.
      } else {
        // Truly new CNPJ: normal round-robin
        vendedorId = pickNextVendedor()
        if (vendedorId) {
          vendedorCounts.set(vendedorId, (vendedorCounts.get(vendedorId) ?? 0) + 1)
          // Track this assignment so subsequent emendas for the same CNPJ in this batch
          // also inherit this vendedor (handles multiple new emendas in same sync run).
          cnpjAssignments.set(lead.cnpj, vendedorId)
        }
      }

      const obs = isExistingClient ? 'JA E CLIENTE PROJETUS' : null
      // Existing clients routed to Paulo get tipo_vendedor = 'Exclusivo'
      const tipoVendedor = (isExistingClient && pauloId && vendedorId === pauloId) ? 'Exclusivo' : 'SDR'

      // Conflict key mirrors the DB constraint: (cnpj, codigo_programa, COALESCE(nr_emenda, ''))
      const conflictKey = `${lead.cnpj}|${lead.codigo_programa}|${lead.nr_emenda ?? ''}`
      dedupMap.set(conflictKey, { lead, vendedorId, obs, tipoVendedor })
    }

    // Build batch arrays from deduplicated map (last-write-wins per conflict key)
    for (const { lead, vendedorId, obs, tipoVendedor } of Array.from(dedupMap.values())) {
      bCnpj.push(lead.cnpj)
      bCodigoPrograma.push(lead.codigo_programa)
      bNomePrograma.push(lead.nome_programa)
      bLinkExterno.push(lead.link_externo)
      bOrgaoConcedente.push(lead.orgao_concedente)
      bUf.push(lead.uf ? lead.uf.toUpperCase() : null)
      bMunicipio.push(lead.municipio)
      bQualificacao.push(lead.qualificacao)
      bNrEmenda.push(lead.nr_emenda)
      bParlamentar.push(lead.parlamentar)
      bNome.push(lead.nome || 'Sem nome')
      bValorEmenda.push(lead.valor_emenda ?? null)
      bVendedorId.push(vendedorId)
      bObservacoes.push(obs)
      bTipoVendedor.push(tipoVendedor)
      bTelefone.push(lead.telefone || null)
      bEmail.push(lead.email || null)
    }
    if (dedupMap.size < leads.length) {
      console.log(`[repo-sync] STEP 7: Deduplicated ${leads.length - dedupMap.size} duplicate leads before batch upsert`)
    }

    // Single batch upsert via unnest — replaces N individual round-trips with 1 query
    try {
      const batchResult = await client.query<{ cnpj: string; was_inserted: boolean }>(`
        INSERT INTO vendedor_projetos (
          cnpj, codigo_programa, nome_programa, link_externo, orgao_concedente,
          uf, municipio, qualificacao, nr_emenda, parlamentar,
          nome, valor_emenda, vendedor_id, observacoes, importado_de, tipo_vendedor,
          telefone, email
        )
        SELECT
          t.cnpj, t.codigo_programa, t.nome_programa, t.link_externo, t.orgao_concedente,
          t.uf, t.municipio, t.qualificacao, t.nr_emenda, t.parlamentar,
          t.nome, t.valor_emenda, t.vendedor_id, t.observacoes, 'auto-repo-sync', t.tipo_vendedor,
          t.telefone, t.email
        FROM unnest(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
          $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
          $11::text[], $12::numeric[], $13::uuid[], $14::text[], $15::text[],
          $16::text[], $17::text[]
        ) AS t(cnpj, codigo_programa, nome_programa, link_externo, orgao_concedente,
               uf, municipio, qualificacao, nr_emenda, parlamentar,
               nome, valor_emenda, vendedor_id, observacoes, tipo_vendedor,
               telefone, email)
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
        RETURNING cnpj, (xmax = 0) AS was_inserted
      `, [
        bCnpj, bCodigoPrograma, bNomePrograma, bLinkExterno, bOrgaoConcedente,
        bUf, bMunicipio, bQualificacao, bNrEmenda, bParlamentar,
        bNome, bValorEmenda, bVendedorId, bObservacoes, bTipoVendedor,
        bTelefone, bEmail,
      ])

      for (const row of batchResult.rows) {
        // xmax = 0 means INSERT (new row), xmax != 0 means UPDATE (existing row)
        if (row.was_inserted) {
          stats.inserted++
          // Always enqueue new CNPJs for enrichment — even if proponentes had data,
          // BrasilAPI may provide additional phone2/endereco
          newCnpjsNeedingContacts.add(row.cnpj)
        } else {
          stats.updated++
        }
      }
    } catch (err) {
      console.error(`[repo-sync] Batch upsert error:`, err)
      stats.errors = leads.length
    }

    console.log(`[repo-sync] Upserted: ${stats.inserted} new, ${stats.updated} updated, ${stats.errors} errors`)

    // ========================================================================
    // STEP 7c: Inherit status_contato for new emendas of already-contacted CNPJs
    // ========================================================================
    // When a new emenda row is inserted for a CNPJ where the vendedor already
    // set a status_contato on another emenda, the new row gets NULL (Não Contatado).
    // This inflates the "não contactados" count and hurts the vendedor's metrics.
    // Fix: propagate the most-advanced status from sibling rows to any NULL rows.
    //
    // Status priority order (most advanced first):
    //   Fechado > Aguardando Closer > Proposta > Retorno > Ainda Não > (null/Não Contatado)
    //
    // Only propagates within the same vendedor assignment (same vendedor_id).
    // Also copies closer_id so the closer assignment is consistent across emendas.
    {
      const inheritResult = await client.query(`
        UPDATE vendedor_projetos AS target
        SET
          status_contato = source.status_contato,
          closer_id = source.closer_id
        FROM (
          SELECT DISTINCT ON (cnpj, vendedor_id)
            cnpj,
            vendedor_id,
            status_contato,
            closer_id
          FROM vendedor_projetos
          WHERE status_contato IS NOT NULL
            AND status_contato != 'Não Contatado'
          ORDER BY cnpj, vendedor_id,
            CASE status_contato
              WHEN 'Fechado'            THEN 1
              WHEN 'Aguardando Closer'  THEN 2
              WHEN 'Proposta'           THEN 3
              WHEN 'Retorno'            THEN 4
              WHEN 'Ainda Não'          THEN 5
              ELSE                           6
            END ASC
        ) AS source
        WHERE target.cnpj = source.cnpj
          AND target.vendedor_id = source.vendedor_id
          AND (target.status_contato IS NULL OR target.status_contato = 'Não Contatado')
      `)
      if (inheritResult.rowCount && inheritResult.rowCount > 0) {
        console.log(`[repo-sync] STEP 7c: Inherited status_contato for ${inheritResult.rowCount} new emenda rows`)
      }
    }

    // ========================================================================
    // STEP 7b: Push notifications for monitored CNPJs that were inserted/updated
    // ========================================================================
    // Collect all CNPJs that were touched in this sync run
    const touchedCnpjs = Array.from(new Set(leads.map(l => l.cnpj)))
    if (touchedCnpjs.length > 0) {
      try {
        // Defensive: ensure cnpj_monitorado exists. setup-crm normally creates it,
        // but in environments where setup-crm hasn't run (or failed silently) the
        // SELECT below would throw 42P01 and abort STEP 7b on every sync run.
        await client.query(`
          CREATE TABLE IF NOT EXISTS cnpj_monitorado (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            cnpj VARCHAR(14) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, cnpj)
          )
        `)
        // Check which touched CNPJs are in cnpj_monitorado
        const monitoredRes = await client.query<{ cnpj: string; nome: string | null }>(
          `SELECT DISTINCT cm.cnpj, vp.nome
           FROM cnpj_monitorado cm
           JOIN vendedor_projetos vp ON vp.cnpj = cm.cnpj
           WHERE cm.cnpj = ANY($1::text[])
           LIMIT 100`,
          [touchedCnpjs]
        )

        if (monitoredRes.rows.length > 0) {
          console.log(`[repo-sync] STEP 7b: ${monitoredRes.rows.length} monitored CNPJs detected — sending push notifications`)
          const nextauthUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
          const internalKey = process.env.INTERNAL_API_KEY || ''

          for (const row of monitoredRes.rows) {
            try {
              await fetch(`${nextauthUrl}/api/push-notify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-internal-key': internalKey,
                },
                body: JSON.stringify({
                  cnpj: row.cnpj,
                  title: 'Nova emenda detectada',
                  body: `${row.nome || row.cnpj} recebeu atualização de emenda no TransferênciaGov`,
                }),
              })
            } catch (pushErr) {
              console.warn(`[repo-sync] STEP 7b: push-notify failed for CNPJ ${row.cnpj}:`, pushErr)
            }
          }
        } else {
          console.log('[repo-sync] STEP 7b: No monitored CNPJs in this sync batch — skipping push notifications')
        }
      } catch (err) {
        console.warn('[repo-sync] STEP 7b: Error checking monitored CNPJs:', err)
      }
    }

    // ========================================================================
    // STEP 8: BrasilAPI enrichment via enrichment_queue (persistent, never drops CNPJs)
    // ========================================================================
    // Strategy:
    //   1. Enqueue ALL CNPJs missing data (new inserts + existing gaps) as 'pending'
    //   2. Process queue: 'pending' first, then 'rate_limited'/'error' (retry)
    //   3. Mark results: 'done', 'no_data' (API has nothing), 'rate_limited' (403), 'error'
    //   4. 'no_data' retries weekly (data may appear later in Receita Federal)
    //   5. Processes until timeout — remaining stay in queue for next sync
    // ========================================================================
    // Map to store BrasilAPI contact data per CNPJ for use in STEP 9
    interface BrasilApiContactData {
      phone1: string | null
      phone2: string | null
      email: string | null
    }
    const brasilApiContacts = new Map<string, BrasilApiContactData>()

    // 8a. Enqueue newly-inserted CNPJs
    const newCnpjArr = Array.from(newCnpjsNeedingContacts)
    for (const cnpj of newCnpjArr) {
      await client.query(
        `INSERT INTO enrichment_queue (cnpj, status) VALUES ($1, 'pending') ON CONFLICT (cnpj) DO NOTHING`,
        [cnpj]
      )
    }

    // 8b. Enqueue existing CNPJs still missing any contact data OR missing lead_contacts
    // (catches gaps from prior syncs where lead_contacts were never populated)
    await client.query(`
      INSERT INTO enrichment_queue (cnpj)
      SELECT DISTINCT cnpj FROM vendedor_projetos
      WHERE (
        nome IS NULL OR nome = '' OR nome = 'Sem nome'
        OR email IS NULL OR email = ''
        OR telefone IS NULL OR telefone = ''
        OR endereco IS NULL OR endereco = ''
      )
      ON CONFLICT (cnpj) DO NOTHING
    `)
    // 8b2. Also enqueue CNPJs that have no lead_contacts at all (safety net)
    await client.query(`
      INSERT INTO enrichment_queue (cnpj)
      SELECT DISTINCT vp.cnpj FROM vendedor_projetos vp
      LEFT JOIN lead_contacts lc ON vp.cnpj = lc.lead_cnpj
      WHERE lc.lead_cnpj IS NULL
      ON CONFLICT (cnpj) DO NOTHING
    `)

    // 8c. Reset 'no_data' entries older than 7 days (retry weekly — data may appear in Receita)
    await client.query(`
      UPDATE enrichment_queue SET status = 'pending', attempts = 0
      WHERE status = 'no_data' AND last_attempt < NOW() - INTERVAL '7 days'
    `)

    // 8d. Reset 'rate_limited' and 'error' entries (always retry next sync)
    await client.query(`
      UPDATE enrichment_queue SET status = 'pending'
      WHERE status IN ('rate_limited', 'error')
    `)

    // 8e. Fetch queue: pending first, ordered by fewest attempts
    const queueRes = await client.query<{ cnpj: string; attempts: number }>(`
      SELECT cnpj, attempts FROM enrichment_queue
      WHERE status = 'pending'
      ORDER BY attempts ASC, cnpj ASC
    `)
    const cnpjsToEnrich = queueRes.rows
    console.log(`[repo-sync] STEP 8: Enrichment queue has ${cnpjsToEnrich.length} pending CNPJs`)

    let rateLimitHits = 0
    const elapsedStep8 = Date.now() - startTime

    if (cnpjsToEnrich.length > 0 && elapsedStep8 < 200000) {
      console.log(`[repo-sync] STEP 8: BrasilAPI enrichment starting...`)

      for (const { cnpj } of cnpjsToEnrich) {
        // Check timeout before each API call
        if (Date.now() - startTime > 250000) {
          console.log(`[repo-sync] STEP 8: Timeout approaching, ${stats.enriched_api} enriched this run, rest stays in queue`)
          break
        }

        // If we got 3+ consecutive rate limits, stop and let next sync handle the rest
        if (rateLimitHits >= 3) {
          console.log(`[repo-sync] STEP 8: Rate limited ${rateLimitHits}x, stopping. Rest stays in queue for next sync.`)
          break
        }

        try {
          const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
          })

          if (apiRes.status === 403 || apiRes.status === 429) {
            // Rate limited — mark and count
            rateLimitHits++
            await client.query(
              `UPDATE enrichment_queue SET status = 'rate_limited', attempts = attempts + 1, last_attempt = NOW(), last_error = $2 WHERE cnpj = $1`,
              [cnpj, `HTTP ${apiRes.status}`]
            )
            await delay(2000) // back off on rate limit
            continue
          }

          // Reset consecutive rate limit counter on any non-rate-limit response
          rateLimitHits = 0

          if (!apiRes.ok) {
            await client.query(
              `UPDATE enrichment_queue SET status = 'error', attempts = attempts + 1, last_attempt = NOW(), last_error = $2 WHERE cnpj = $1`,
              [cnpj, `HTTP ${apiRes.status}`]
            )
            await delay(300)
            continue
          }

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

          // Check if API returned any useful contact data
          const hasContact = !!(phone || email)
          const hasAnyData = !!(phone || email || nome || endereco)

          if (!hasAnyData) {
            // API responded but has zero useful data
            await client.query(
              `UPDATE enrichment_queue SET status = 'no_data', attempts = attempts + 1, last_attempt = NOW() WHERE cnpj = $1`,
              [cnpj]
            )
            await delay(300)
            continue
          }

          // Update vendedor_projetos with enrichment data (COALESCE — only fill empty fields)
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

          // Mark as done (or no_data if API had address/name but no phone/email)
          await client.query(
            `UPDATE enrichment_queue SET status = $2, attempts = attempts + 1, last_attempt = NOW() WHERE cnpj = $1`,
            [cnpj, hasContact ? 'done' : 'no_data']
          )
          stats.enriched_api++
        } catch (err) {
          await client.query(
            `UPDATE enrichment_queue SET status = 'error', attempts = attempts + 1, last_attempt = NOW(), last_error = $2 WHERE cnpj = $1`,
            [cnpj, String(err)]
          ).catch(() => {})
        }
        await delay(300)
      }
      console.log(`[repo-sync] STEP 8: BrasilAPI enriched: ${stats.enriched_api} | rate_limited: ${rateLimitHits}`)
    } else {
      if (cnpjsToEnrich.length === 0) {
        console.log('[repo-sync] STEP 8: Skipped (enrichment_queue empty)')
      } else {
        console.log(`[repo-sync] STEP 8: Skipped (timeout: elapsed=${elapsedStep8}ms >= 200000ms, ${cnpjsToEnrich.length} CNPJs remain in queue for next sync)`)
      }
    }

    // ========================================================================
    // STEP 9: Populate lead_contacts from enrichment data (ALL CNPJs without contacts)
    // ========================================================================
    const elapsedBeforeStep9 = Date.now() - startTime
    if (elapsedBeforeStep9 < 200000) {
      console.log('[repo-sync] STEP 9: Populating lead_contacts from enrichment data...')

      // STEP 9a: Bulk SQL safety-net — insert lead_contacts directly from vendedor_projetos
      // for any CNPJ that has phone/email data there but no lead_contacts entry yet.
      // This is a pure-SQL approach that does NOT depend on in-memory maps (proponentes,
      // brasilApiContacts) and therefore catches CNPJs enriched in prior sync runs where
      // STEP 9 was skipped due to timeout. Runs fast (single INSERT...SELECT), no API calls.
      const bulkInsertRes = await client.query(`
        INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
        SELECT DISTINCT ON (cnpj)
          cnpj,
          NULLIF(telefone, ''),
          NULLIF(email, ''),
          true,
          'desconhecido'
        FROM vendedor_projetos
        WHERE (telefone IS NOT NULL AND telefone != '' OR email IS NOT NULL AND email != '')
          AND NOT EXISTS (SELECT 1 FROM lead_contacts WHERE lead_cnpj = vendedor_projetos.cnpj)
        ORDER BY cnpj, updated_at DESC
        RETURNING lead_cnpj
      `)
      if (bulkInsertRes.rows.length > 0) {
        console.log(`[repo-sync] STEP 9a: Bulk-inserted ${bulkInsertRes.rows.length} lead_contacts from vendedor_projetos`)
        stats.contacts_created += bulkInsertRes.rows.length
      }

      // Get ALL CNPJs still without lead_contacts (after bulk insert, typically only those with no VP data)
      const missingContactsRes = await client.query(`
        SELECT DISTINCT vp.cnpj FROM vendedor_projetos vp
        LEFT JOIN lead_contacts lc ON vp.cnpj = lc.lead_cnpj
        WHERE lc.lead_cnpj IS NULL
      `)
      const allSyncCnpjs = missingContactsRes.rows.map((r: { cnpj: string }) => r.cnpj)
      console.log(`[repo-sync] STEP 9: ${allSyncCnpjs.length} CNPJs still need lead_contacts (from in-memory maps)`)

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

          // Source 3: Fallback to vendedor_projetos.telefone/email
          // (covers cases where proponentes Map doesn't have CNPJ and BrasilAPI
          //  already enriched vp in a prior sync but lead_contacts was never created)
          if (existingPhones.size === 0 && existingEmails.size === 0) {
            const vpFallback = await client.query(
              `SELECT DISTINCT telefone, email FROM vendedor_projetos
               WHERE cnpj = $1 AND (telefone IS NOT NULL AND telefone != '' OR email IS NOT NULL AND email != '')
               LIMIT 1`,
              [cnpj]
            )
            if (vpFallback.rows.length > 0) {
              const vpPhone = formatPhone(vpFallback.rows[0].telefone)
              const vpEmail = vpFallback.rows[0].email && vpFallback.rows[0].email.includes('@')
                ? vpFallback.rows[0].email.trim().toLowerCase() : null
              await insertContact(vpPhone, vpEmail)
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
