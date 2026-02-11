import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for Vercel

// Railway source DB
const SOURCE_URL = 'postgresql://postgres:FCIKWxLaKmAdKYkWjGKsLZCuYBlzYtQl@shortline.proxy.rlwy.net:30852/railway'

function getSourcePool() {
  return new Pool({
    connectionString: SOURCE_URL,
    max: 2,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
}

function getTargetPool() {
  // Uses Railway or Supabase POSTGRES_URL from Vercel env
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!url) throw new Error('No target DB URL configured')
  return new Pool({
    connectionString: url,
    max: 2,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
}

const TABLES_CONFIG = [
  { name: 'programas', key: 'transfer_gov_id' },
  { name: 'proponentes', key: 'cnpj' },
  { name: 'propostas', key: 'transfer_gov_id' },
  { name: 'apoiadores', key: 'transfer_gov_id' },
  { name: 'emendas', key: 'transfer_gov_id' },
  { name: 'convenios', key: 'transfer_gov_id' },
  { name: 'desembolsos', key: 'transfer_gov_id' },
  { name: 'proposta_apoiadores', key: 'id' },
  { name: 'proposta_emendas', key: 'id' },
  { name: 'historico_situacao', key: 'id' },
  { name: 'extraction_logs', key: 'id' },
]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const table = searchParams.get('table')
  const offset = parseInt(searchParams.get('offset') || '0')
  const batchSize = parseInt(searchParams.get('batch') || '50000')

  // If no table specified, return status of all tables
  if (!table) {
    const source = getSourcePool()
    const target = getTargetPool()
    try {
      const status = []
      for (const t of TABLES_CONFIG) {
        const [srcRes, tgtRes] = await Promise.all([
          source.query(`SELECT COUNT(*) as c FROM ${t.name}`),
          target.query(`SELECT COUNT(*) as c FROM ${t.name}`),
        ])
        status.push({
          table: t.name,
          source: Number(srcRes.rows[0].c),
          target: Number(tgtRes.rows[0].c),
          synced: Number(srcRes.rows[0].c) === Number(tgtRes.rows[0].c),
        })
      }
      return NextResponse.json({ status })
    } finally {
      await source.end()
      await target.end()
    }
  }

  // Validate table name
  const tableConfig = TABLES_CONFIG.find(t => t.name === table)
  if (!tableConfig) {
    return NextResponse.json({ error: `Invalid table: ${table}` }, { status: 400 })
  }

  const source = getSourcePool()
  const target = getTargetPool()

  try {
    // Get column names from source
    const colRes = await source.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table])
    const columns = colRes.rows.map((r: { column_name: string }) => r.column_name)

    // Read batch from source
    const sourceRows = await source.query(
      `SELECT * FROM ${table} ORDER BY ${tableConfig.key} LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    )

    if (sourceRows.rows.length === 0) {
      return NextResponse.json({
        table,
        offset,
        inserted: 0,
        done: true,
        message: `No more rows at offset ${offset}`,
      })
    }

    // Insert into target in sub-batches of 1000
    let totalInserted = 0
    const subBatchSize = 1000

    for (let i = 0; i < sourceRows.rows.length; i += subBatchSize) {
      const batch = sourceRows.rows.slice(i, i + subBatchSize)

      // Build multi-row INSERT with ON CONFLICT DO NOTHING
      const placeholders = batch.map((_, rowIdx) => {
        const rowPlaceholders = columns.map((_, colIdx) =>
          `$${rowIdx * columns.length + colIdx + 1}`
        )
        return `(${rowPlaceholders.join(',')})`
      })

      const values = batch.flatMap((row: Record<string, unknown>) =>
        columns.map(col => row[col] ?? null)
      )

      const colList = columns.map(c => `"${c}"`).join(',')

      await target.query(
        `INSERT INTO ${table} (${colList}) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
        values
      )

      totalInserted += batch.length
    }

    const nextOffset = offset + sourceRows.rows.length
    const done = sourceRows.rows.length < batchSize

    return NextResponse.json({
      table,
      offset,
      fetched: sourceRows.rows.length,
      inserted: totalInserted,
      nextOffset,
      done,
      nextUrl: done ? null : `/api/migrate?table=${table}&offset=${nextOffset}&batch=${batchSize}`,
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({
      error: String(error),
      table,
      offset,
    }, { status: 500 })
  } finally {
    await source.end()
    await target.end()
  }
}

// POST handler to create CRM tables and seed gestor user
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { seed } = body

  const target = getTargetPool()

  try {
    // Create CRM tables
    await target.query(`
      -- Users table for auth
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (role IN ('gestor', 'vendedor')),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Lead assignments (vendedor <-> lead)
      CREATE TABLE IF NOT EXISTS lead_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_cnpj VARCHAR(20) NOT NULL,
        vendedor_id UUID NOT NULL REFERENCES users(id),
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(30) DEFAULT 'novo' CHECK (status IN ('novo', 'contactado', 'em_negociacao', 'fechado')),
        UNIQUE(lead_cnpj)
      );

      -- Contact notes per lead
      CREATE TABLE IF NOT EXISTS contact_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_cnpj VARCHAR(20) NOT NULL,
        vendedor_id UUID NOT NULL REFERENCES users(id),
        tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ligacao', 'email', 'whatsapp', 'reuniao', 'outro')),
        observacao TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Commissions per lead closure
      CREATE TABLE IF NOT EXISTS commissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_cnpj VARCHAR(20) NOT NULL,
        vendedor_id UUID NOT NULL REFERENCES users(id),
        valor_contrato NUMERIC(15,2) NOT NULL,
        percentual NUMERIC(5,2) NOT NULL DEFAULT 5.00,
        valor_comissao NUMERIC(15,2) GENERATED ALWAYS AS (valor_contrato * percentual / 100) STORED,
        status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_lead_assignments_vendedor ON lead_assignments(vendedor_id);
      CREATE INDEX IF NOT EXISTS idx_lead_assignments_cnpj ON lead_assignments(lead_cnpj);
      CREATE INDEX IF NOT EXISTS idx_contact_notes_lead ON contact_notes(lead_cnpj);
      CREATE INDEX IF NOT EXISTS idx_contact_notes_vendedor ON contact_notes(vendedor_id);
      CREATE INDEX IF NOT EXISTS idx_commissions_vendedor ON commissions(vendedor_id);
    `)

    const result: Record<string, unknown> = {
      success: true,
      message: 'CRM tables created successfully',
      tables: ['users', 'lead_assignments', 'contact_notes', 'commissions'],
    }

    // Seed gestor user if requested
    if (seed) {
      const bcrypt = await import('bcrypt')
      const passwordHash = await bcrypt.default.hash('sigma2026', 10)

      // Check if gestor already exists
      const existing = await target.query(
        `SELECT id FROM users WHERE email = $1`,
        ['gestor@sigma.com']
      )

      if (existing.rows.length === 0) {
        await target.query(
          `INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
          ['Gestor', 'gestor@sigma.com', passwordHash, 'gestor']
        )
        result.seeded = true
        result.gestorEmail = 'gestor@sigma.com'
        result.gestorPassword = 'sigma2026'
      } else {
        result.seeded = false
        result.message = 'CRM tables created. Gestor user already exists.'
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('CRM migration error:', error)
    return NextResponse.json({
      error: String(error),
      success: false,
    }, { status: 500 })
  } finally {
    await target.end()
  }
}
