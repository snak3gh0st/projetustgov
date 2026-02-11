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
  'wellington': 'wellington@sigma.com',
  'elisson': 'elisson@sigma.com',
  'gabriel': 'gabriel@sigma.com',
  'vitória': 'vitoria@sigma.com',
  'vitoria': 'vitoria@sigma.com',
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s+/g, ' ')
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
  const crmIndicators = ['codigo programa', 'nome programa', 'qualificacao']

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
  'qualificacao': 'qualificacao',
  'nr emenda beneficiario': 'nr_emenda',
  'n emenda beneficiario': 'nr_emenda',
  'parlamentar beneficiario': 'parlamentar',
  'cnpj beneficiario': 'cnpj',
  'nome beneficiario': 'nome',
  'nat jur beneficiario': 'natureza_juridica',
  'nat. jur. beneficiario': 'natureza_juridica',
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

const INSERT_SQL = `
  INSERT INTO vendedor_projetos (
    vendedor_id, codigo_programa, nome_programa, link_externo, orgao_concedente,
    uf, municipio, qualificacao, nr_emenda, parlamentar,
    cnpj, nome, natureza_juridica,
    valor_emenda, valor_global, valor_empenhado, valor_liberado,
    nr_convenio, objeto, modalidade, situacao, saldo_conta,
    importado_de
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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

    // Get existing CNPJs for duplicate detection
    const existingRes = await pool.query('SELECT DISTINCT cnpj FROM vendedor_projetos')
    const existingCnpjs = new Set(existingRes.rows.map((r: { cnpj: string }) => r.cnpj))

    // Get vendedor user IDs
    const usersRes = await pool.query("SELECT id, email FROM users WHERE role = 'vendedor'")
    const usersByEmail: Record<string, string> = {}
    for (const u of usersRes.rows) {
      usersByEmail[u.email] = u.id
    }

    const columnMap = format === 'siconv' ? SICONV_COLUMN_MAP : CRM_COLUMN_MAP
    const sheetResults: { sheet: string; vendedor: string | null; rows: number; duplicates: number; skipped: number }[] = []
    let totalInserted = 0
    let totalDuplicates = 0
    let totalErrors = 0

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]

      if (rawRows.length === 0) {
        sheetResults.push({ sheet: sheetName, vendedor: null, rows: 0, duplicates: 0, skipped: 0 })
        continue
      }

      // Determine vendedor
      let vendedorId: string | null = null
      if (format === 'crm') {
        const normalized = sheetName.toLowerCase().trim()
        const vendedorEmail = VENDEDOR_MAP[normalized]
        vendedorId = vendedorEmail ? usersByEmail[vendedorEmail] || null : null
      }

      const sampleHeaders = Object.keys(rawRows[0])
      const headerMap = mapHeaders(sampleHeaders, columnMap)

      let inserted = 0
      let duplicates = 0
      let skipped = 0

      for (const raw of rawRows) {
        const row: Record<string, unknown> = {}
        for (const [orig, mapped] of Object.entries(headerMap)) {
          row[mapped] = raw[orig]
        }

        const cnpj = cleanCNPJ(row.cnpj)
        if (!cnpj) { skipped++; continue }

        // Duplicate detection
        if (existingCnpjs.has(cnpj)) {
          duplicates++
          continue
        }

        const str = (key: string) => row[key] ? String(row[key]).trim() : null
        const num = (key: string) => format === 'siconv' ? parseNumeric(row[key]) : null

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
          format,                          // importado_de
        ]

        try {
          await pool.query(INSERT_SQL, values)
          inserted++
          existingCnpjs.add(cnpj) // track within this import too
        } catch (err) {
          console.error('Insert error for CNPJ', cnpj, err)
          skipped++
          totalErrors++
        }
      }

      totalInserted += inserted
      totalDuplicates += duplicates
      sheetResults.push({ sheet: sheetName, vendedor: vendedorId, rows: inserted, duplicates, skipped })
    }

    return NextResponse.json({
      success: true,
      format,
      totalRows: sheetResults.reduce((s, r) => s + r.rows + r.duplicates + r.skipped, 0),
      inserted: totalInserted,
      duplicates: totalDuplicates,
      errors: totalErrors,
      sheets: sheetResults,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
