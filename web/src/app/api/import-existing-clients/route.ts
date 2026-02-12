import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import * as XLSX from 'xlsx'
import { auth } from '@/lib/auth'

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

export async function POST(request: NextRequest) {
  const pool = getPool()

  try {
    // Check if user is gestor
    const session = await auth()
    if (!session?.user || session.user.role !== 'gestor') {
      return NextResponse.json({ error: 'Acesso restrito a gestores' }, { status: 403 })
    }

    // Parse multipart form data
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Read Excel file
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // Read first sheet only
    const firstSheetName = workbook.SheetNames[0]
    const firstSheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as Record<string, unknown>[]

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 })
    }

    // Validate columns: must have CNPJ and ENTIDADE
    const headers = Object.keys(rows[0]).map(h => normalizeHeader(h))
    const hasCnpj = headers.some(h => h.includes('cnpj'))
    const hasEntidade = headers.some(h => h.includes('entidade'))

    if (!hasCnpj || !hasEntidade) {
      return NextResponse.json({
        error: 'Planilha deve conter colunas CNPJ e ENTIDADE',
        found_headers: Object.keys(rows[0])
      }, { status: 400 })
    }

    // Map headers to find CNPJ and ENTIDADE columns
    const originalHeaders = Object.keys(rows[0])
    let cnpjColumn: string | null = null
    let entidadeColumn: string | null = null

    for (const h of originalHeaders) {
      const normalized = normalizeHeader(h)
      if (normalized.includes('cnpj') && !cnpjColumn) cnpjColumn = h
      if (normalized.includes('entidade') && !entidadeColumn) entidadeColumn = h
    }

    if (!cnpjColumn || !entidadeColumn) {
      return NextResponse.json({ error: 'Colunas CNPJ e ENTIDADE não encontradas' }, { status: 400 })
    }

    // Process rows
    let inserted = 0
    let duplicates = 0
    let skipped = 0
    let errors = 0
    const addedBy = session.user.id
    const notes = 'Importado de CLIENTES.xlsx'

    for (const row of rows) {
      const cnpj = cleanCNPJ(row[cnpjColumn])
      if (!cnpj) {
        skipped++
        continue
      }

      const nome = row[entidadeColumn] ? String(row[entidadeColumn]).trim() : null

      try {
        const result = await pool.query(
          `INSERT INTO existing_clients (cnpj, nome, added_by, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (cnpj) DO NOTHING
           RETURNING id`,
          [cnpj, nome, addedBy, notes]
        )

        if (result.rows.length > 0) {
          inserted++
        } else {
          duplicates++
        }
      } catch (err) {
        console.error('Insert error for CNPJ', cnpj, err)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted,
      duplicates,
      skipped,
      errors,
    })
  } catch (error) {
    console.error('Import existing clients error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
