import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getPool() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new Error('No DB URL configured')
  return new Pool({
    connectionString: url,
    max: 2,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
}

// Map sheet names to vendedor emails
const VENDEDOR_MAP: Record<string, string> = {
  'wellington': 'wellington@projetus.org',
  'elisson': 'elisson@projetus.org',
  'gabriel': 'gabriel@projetus.org',
  'vitoria': 'vitoria@projetus.org',
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s+/g, ' ')
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return raw
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanCNPJ(val: unknown): string | null {
  if (!val) return null
  const str = String(val).replace(/\D/g, '')
  if (str.length < 11) return null
  return str.padStart(14, '0')
}

function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return val
  const str = String(val)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')  // remove thousand separators
    .replace(',', '.')   // decimal comma to dot
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

type FormatType = 'siconv' | 'crm' | 'unknown'

function detectFormat(headers: string[]): FormatType {
  const normalized = headers.map(h => normalizeHeader(h))
  const siconvIndicators = ['n instrumento', 'nr instrumento', 'objeto', 'situacao', 'saldo em conta']
  const crmIndicators = ['codigo programa', 'nome programa', 'qualificacao', 'beneficiario']

  if (siconvIndicators.some(ind => normalized.some(h => h.includes(ind)))) return 'siconv'
  if (crmIndicators.some(ind => normalized.some(h => h.includes(ind)))) return 'crm'
  return 'unknown'
}

const SICONV_COLUMN_MAP: Record<string, string> = {
  'n instrumento': 'nr_convenio',
  'nr instrumento': 'nr_convenio',
  'no instrumento': 'nr_convenio',
  'link externo': 'link_externo',
  'uf': 'uf',
  'municipio': 'municipio',
  'cnpj': 'cnpj',
  'nome proponente': 'nome',
  'modalidade': 'modalidade',
  'emenda': 'nr_emenda',
  'objeto': 'objeto',
  'situacao': 'situacao',
  'orgao concedente': 'orgao_concedente',
  'natureza juridica': 'natureza_juridica',
  'valor global': 'valor_global',
  'valor emenda': 'valor_emenda',
  'valor empenhado': 'valor_empenhado',
  'valor liberado': 'valor_liberado',
  'saldo em conta': 'saldo_conta',
}

const CRM_COLUMN_MAP: Record<string, string> = {
  'codigo programa': 'codigo_programa',
  'nome programa': 'nome_programa',
  'link externo': 'link_externo',
  'orgao superior': 'orgao_concedente',
  'uf beneficiario': 'uf',
  'municipio beneficiario': 'municipio',
  'municipio': 'municipio',
  'qualificacao': 'qualificacao',
  'nr emenda beneficiario': 'nr_emenda',
  'n emenda beneficiario': 'nr_emenda',
  'parlamentar beneficiario': 'parlamentar',
  'cnpj beneficiario': 'cnpj',
  'nome beneficiario': 'nome',
  'nat jur beneficiario': 'natureza_juridica',
  'nat. jur. beneficiario': 'natureza_juridica',
  'contato': 'telefone',
  'email': 'email',
  'valor': 'valor_emenda',
}

function mapHeaders(sampleHeaders: string[], columnMap: Record<string, string>): Record<string, string> {
  const headerMap: Record<string, string> = {}
  for (const h of sampleHeaders) {
    const norm = normalizeHeader(h)
    // Try exact match first
    if (columnMap[norm]) {
      headerMap[h] = columnMap[norm]
      continue
    }
    // Try partial match
    for (const [key, val] of Object.entries(columnMap)) {
      if (norm.includes(key) || key.includes(norm)) {
        headerMap[h] = val
        break
      }
    }
  }
  return headerMap
}

function detectAndFixHeaderShift(
  headerMap: Record<string, string>,
  sampleRow: Record<string, unknown>
): Record<string, string> {
  const fixed = { ...headerMap }
  // Find the original header currently mapped to 'uf'
  const ufHeader = Object.entries(fixed).find(([_, v]) => v === 'uf')?.[0]
  if (!ufHeader) return fixed

  const sampleUfValue = String(sampleRow[ufHeader] || '').trim()
  // UF codes are 2 chars (e.g., "SP", "RJ"). If value >3 chars, it's actually orgao data
  if (sampleUfValue.length > 3) {
    // Find headers mapping to 'municipio' -- there may be two:
    // 1. From "Municipio Beneficiario" (partial match) -- actually contains UF codes
    // 2. From "Municipio" (exact match) -- contains real city names
    const municipioHeaders = Object.entries(fixed).filter(([_, v]) => v === 'municipio')

    let ufDataHeader: string | null = null
    let cityDataHeader: string | null = null

    for (const [origHeader] of municipioHeaders) {
      const norm = normalizeHeader(origHeader)
      if (norm.includes('beneficiario')) {
        ufDataHeader = origHeader   // "Municipio Beneficiario" -> actually has UF codes
      } else {
        cityDataHeader = origHeader // "Municipio" -> actually has city names
      }
    }

    // Remap the shifted columns
    fixed[ufHeader] = 'orgao_concedente'           // "UF Beneficiario" -> orgao_concedente
    if (ufDataHeader) fixed[ufDataHeader] = 'uf'   // "Municipio Beneficiario" -> uf
    if (cityDataHeader) fixed[cityDataHeader] = 'municipio' // stays as municipio
  }
  return fixed
}

const INSERT_SQL = `
  INSERT INTO vendedor_projetos (
    vendedor_id, codigo_programa, nome_programa, link_externo, orgao_concedente,
    uf, municipio, qualificacao, nr_emenda, parlamentar,
    cnpj, nome, natureza_juridica,
    valor_emenda, valor_global, valor_empenhado, valor_liberado,
    nr_convenio, objeto, modalidade, situacao, saldo_conta,
    telefone, email, observacoes,
    importado_de
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
`

export async function POST(request: NextRequest) {
  const pool = getPool()

  try {
    const contentType = request.headers.get('content-type') || ''
    let workbook: XLSX.WorkBook

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      const buffer = Buffer.from(await file.arrayBuffer())
      workbook = XLSX.read(buffer, { type: 'buffer' })
    } else {
      return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })
    }

    // Detect format from first sheet headers
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const firstRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as Record<string, unknown>[]
    if (firstRows.length === 0) {
      return NextResponse.json({ error: 'Spreadsheet is empty' }, { status: 400 })
    }
    const format = detectFormat(Object.keys(firstRows[0]))
    if (format === 'unknown') {
      return NextResponse.json({ error: 'Could not detect format. Expected Siconv or CRM headers.' }, { status: 400 })
    }

    // Get existing rows for dedup (cnpj + parlamentar + link_externo) + CNPJ-to-vendedor for assignment
    const existingRes = await pool.query('SELECT cnpj, parlamentar, link_externo, vendedor_id FROM vendedor_projetos')
    const existingPairs = new Set<string>()
    const cnpjToVendedor = new Map<string, string>()
    for (const r of existingRes.rows) {
      const parlamentar = r.parlamentar ? String(r.parlamentar).trim() : ''
      const linkExterno = r.link_externo ? String(r.link_externo).trim() : ''
      const key = `${r.cnpj}|${parlamentar}|${linkExterno}`
      existingPairs.add(key)
      if (r.vendedor_id) cnpjToVendedor.set(r.cnpj, r.vendedor_id)
    }

    // Get vendedor user IDs for round-robin auto-distribution
    const usersRes = await pool.query("SELECT id, email, nome FROM users WHERE role = 'vendedor' AND active = true ORDER BY nome")
    const vendedorIds: string[] = usersRes.rows.map((u: { id: string }) => u.id)
    const usersByEmail: Record<string, string> = {}
    for (const u of usersRes.rows) {
      usersByEmail[u.email] = u.id
    }

    // Round-robin counter: start balanced by checking current distribution
    const countRes = await pool.query(
      `SELECT vendedor_id, COUNT(DISTINCT cnpj)::int as cnt
       FROM vendedor_projetos WHERE vendedor_id IS NOT NULL
       GROUP BY vendedor_id`
    )
    const vendedorCounts = new Map<string, number>()
    for (const vid of vendedorIds) vendedorCounts.set(vid, 0)
    for (const r of countRes.rows) {
      if (vendedorCounts.has(r.vendedor_id)) vendedorCounts.set(r.vendedor_id, r.cnt)
    }

    // Pick the vendedor with fewest CNPJs assigned (least-loaded)
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

    // Load proponentes contact data for enrichment (telefone, email)
    const proponentesRes = await pool.query(
      `SELECT cnpj, nome, email, telefone
       FROM proponentes
       WHERE email IS NOT NULL OR telefone IS NOT NULL
       LIMIT 100000`
    ).catch(() => ({ rows: [] })) // graceful fallback if table doesn't exist
    const contactByCnpj = new Map<string, { email: string | null; telefone: string | null }>()
    for (const p of proponentesRes.rows) {
      const pCnpj = cleanCNPJ(p.cnpj)
      if (pCnpj) {
        contactByCnpj.set(pCnpj, { email: p.email || null, telefone: p.telefone || null })
      }
    }

    // Load existing clients for flagging
    const clientsRes = await pool.query(
      `SELECT cnpj FROM proponentes WHERE is_existing_client = true`
    ).catch(() => ({ rows: [] }))
    const existingClients = new Set<string>()
    for (const c of clientsRes.rows) {
      const cCnpj = cleanCNPJ(c.cnpj)
      if (cCnpj) existingClients.add(cCnpj)
    }

    const columnMap = format === 'siconv' ? SICONV_COLUMN_MAP : CRM_COLUMN_MAP
    const sheetResults: { sheet: string; vendedor: string | null; rows: number; duplicates: number; skipped: number; enriched: number; existing_clients: number }[] = []
    let totalInserted = 0
    let totalDuplicates = 0
    let totalErrors = 0
    let totalEnriched = 0
    let totalExistingClients = 0
    // Track CNPJs inserted without contact data for BrasilAPI enrichment
    const cnpjsNeedingContacts = new Set<string>()

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]

      if (rawRows.length === 0) {
        sheetResults.push({ sheet: sheetName, vendedor: null, rows: 0, duplicates: 0, skipped: 0, enriched: 0, existing_clients: 0 })
        continue
      }

      // For CRM format, use sheet name to determine vendedor
      let sheetVendedorId: string | null = null
      if (format === 'crm') {
        const normalized = normalizeHeader(sheetName)
        const vendedorEmail = VENDEDOR_MAP[normalized]
        sheetVendedorId = vendedorEmail ? usersByEmail[vendedorEmail] || null : null
      }

      const sampleHeaders = Object.keys(rawRows[0])
      const headerMap = detectAndFixHeaderShift(mapHeaders(sampleHeaders, columnMap), rawRows[0])

      let inserted = 0
      let duplicates = 0
      let skipped = 0
      let enriched = 0
      let existingClientCount = 0

      for (const raw of rawRows) {
        const row: Record<string, unknown> = {}
        for (const [orig, mapped] of Object.entries(headerMap)) {
          row[mapped] = raw[orig]
        }

        // Extract data from unnamed columns (__EMPTY, __EMPTY_1, etc.)
        // Gabriel's sheet has extra unlabeled columns with email and phone data
        for (const [key, val] of Object.entries(raw)) {
          if (!key.startsWith('__EMPTY') || !val || String(val).trim() === '') continue
          const strVal = String(val).trim()
          if (strVal.includes('@') && !row.email) {
            row.email = strVal
          } else if (/^[\d\s\-().+]+$/.test(strVal) && strVal.replace(/\D/g, '').length >= 8 && !row.telefone) {
            row.telefone = strVal
          }
        }

        const cnpj = cleanCNPJ(row.cnpj)
        if (!cnpj) { skipped++; continue }

        // Duplicate detection: full row identity (cnpj + parlamentar + link_externo)
        const parlamentar = row.parlamentar ? String(row.parlamentar).trim() : ''
        const linkExterno = row.link_externo ? String(row.link_externo).trim() : ''
        const dedupKey = `${cnpj}|${parlamentar}|${linkExterno}`
        if (existingPairs.has(dedupKey)) {
          duplicates++
          continue
        }

        // Determine vendedor for this lead:
        // 1. CRM format: use sheet-based vendedor
        // 2. If CNPJ already assigned to a vendedor, use same vendedor
        // 3. Otherwise: round-robin auto-distribute
        let vendedorId = sheetVendedorId
        if (!vendedorId && cnpjToVendedor.has(cnpj)) {
          vendedorId = cnpjToVendedor.get(cnpj)!
        }
        if (!vendedorId) {
          vendedorId = pickNextVendedor()
          if (vendedorId) {
            vendedorCounts.set(vendedorId, (vendedorCounts.get(vendedorId) ?? 0) + 1)
            cnpjToVendedor.set(cnpj, vendedorId)
          }
        }

        // Prefer spreadsheet's own contact data over proponentes enrichment
        const spreadsheetTelefone = row.telefone ? String(row.telefone).trim() : null
        const spreadsheetEmail = row.email ? String(row.email).trim() : null
        const contact = contactByCnpj.get(cnpj)
        const finalTelefone = spreadsheetTelefone || contact?.telefone || null
        const finalEmail = spreadsheetEmail || contact?.email || null
        if (contact || spreadsheetTelefone || spreadsheetEmail) enriched++

        // Flag existing clients in observacoes
        const isExistingClient = existingClients.has(cnpj)
        if (isExistingClient) existingClientCount++
        const obs = isExistingClient ? 'JA E CLIENTE PROJETUS' : null

        const str = (key: string) => row[key] ? String(row[key]).trim() : null
        const num = (key: string) => parseNumeric(row[key])

        const values = [
          vendedorId,                    // vendedor_id
          str('codigo_programa'),         // codigo_programa
          str('nome_programa'),           // nome_programa
          str('link_externo'),            // link_externo
          str('orgao_concedente'),        // orgao_concedente
          str('uf') ? String(row.uf).trim().toUpperCase() : null, // uf
          str('municipio'),               // municipio
          str('qualificacao'),            // qualificacao
          str('nr_emenda'),               // nr_emenda
          str('parlamentar'),             // parlamentar
          cnpj,                           // cnpj
          str('nome') || 'Sem nome',      // nome
          str('natureza_juridica'),        // natureza_juridica
          num('valor_emenda'),             // valor_emenda
          num('valor_global'),             // valor_global
          num('valor_empenhado'),          // valor_empenhado
          num('valor_liberado'),           // valor_liberado
          str('nr_convenio'),              // nr_convenio
          str('objeto'),                   // objeto
          str('modalidade'),               // modalidade
          str('situacao'),                 // situacao
          num('saldo_conta'),              // saldo_conta
          finalTelefone,                   // telefone
          finalEmail,                      // email
          obs,                             // observacoes
          format,                          // importado_de
        ]

        try {
          await pool.query(INSERT_SQL, values)
          inserted++
          existingPairs.add(dedupKey) // track within this import too
          if (!finalTelefone && !finalEmail) {
            cnpjsNeedingContacts.add(cnpj)
          }
        } catch (err) {
          console.error('Insert error for CNPJ', cnpj, err)
          skipped++
          totalErrors++
        }
      }

      totalInserted += inserted
      totalDuplicates += duplicates
      totalEnriched += enriched
      totalExistingClients += existingClientCount
      sheetResults.push({ sheet: sheetName, vendedor: sheetVendedorId, rows: inserted, duplicates, skipped, enriched, existing_clients: existingClientCount })
    }

    // BrasilAPI enrichment: fetch phone/email/address from Receita Federal for leads still missing data
    let apiEnriched = 0
    let apiPhoneAdded = 0
    let apiEmailAdded = 0
    let apiAddressAdded = 0
    let apiErrors = 0
    const cnpjsToEnrich = Array.from(cnpjsNeedingContacts).slice(0, 30) // limit to avoid timeout

    for (const cnpj of cnpjsToEnrich) {
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
        })
        if (!res.ok) { apiErrors++; await delay(500); continue }

        const data = await res.json()
        const phone = data.ddd_telefone_1 && data.ddd_telefone_1.replace(/\D/g, '').length >= 8 ? formatPhone(data.ddd_telefone_1) : null
        const rawEmail = data.email ? data.email.trim().toLowerCase() : ''
        const email = rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@') ? rawEmail : null

        // Build address from BrasilAPI fields
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
        const nome = data.razao_social || data.nome_fantasia || null
        const natJur = data.natureza_juridica ? String(data.natureza_juridica).replace(/^\d+\s*-\s*/, '') : null

        if (!phone && !email && !endereco && !apiUf && !nome) { await delay(500); continue }

        const updates: string[] = []
        const params: unknown[] = []
        let paramIdx = 1

        if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${paramIdx++})`); params.push(phone) }
        if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${paramIdx++})`); params.push(email) }
        if (endereco) { updates.push(`endereco = COALESCE(NULLIF(endereco, ''), $${paramIdx++})`); params.push(endereco) }
        if (apiUf) { updates.push(`uf = COALESCE(NULLIF(uf, ''), $${paramIdx++})`); params.push(apiUf) }
        if (apiMunicipio) { updates.push(`municipio = COALESCE(NULLIF(municipio, ''), $${paramIdx++})`); params.push(apiMunicipio) }
        if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${paramIdx++} ELSE nome END`); params.push(nome) }
        if (natJur) { updates.push(`natureza_juridica = COALESCE(natureza_juridica, $${paramIdx++})`); params.push(natJur) }
        updates.push('updated_at = NOW()')
        params.push(cnpj)

        await pool.query(
          `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${paramIdx}`,
          params
        )
        apiEnriched++
        if (phone) apiPhoneAdded++
        if (email) apiEmailAdded++
        if (endereco) apiAddressAdded++
      } catch {
        apiErrors++
      }
      await delay(500)
    }

    return NextResponse.json({
      success: true,
      format,
      totalRows: sheetResults.reduce((s, r) => s + r.rows + r.duplicates + r.skipped, 0),
      inserted: totalInserted,
      duplicates: totalDuplicates,
      errors: totalErrors,
      enriched: totalEnriched,
      existing_clients: totalExistingClients,
      auto_distributed: format !== 'crm' ? totalInserted : 0,
      api_enriched: apiEnriched,
      api_phone_added: apiPhoneAdded,
      api_email_added: apiEmailAdded,
      api_errors: apiErrors,
      api_remaining: Math.max(0, cnpjsNeedingContacts.size - cnpjsToEnrich.length),
      sheets: sheetResults,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
