import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

export async function GET() {
  return runSetup()
}

export async function POST() {
  return runSetup()
}

async function runSetup() {
  const pool = getPool()

  try {
    // 1. Ensure users table exists
    await pool.query(`
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
    `)

    // 2. Create vendedor_projetos if not exists (safe — never drops data)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendedor_projetos (
        id SERIAL PRIMARY KEY,
        vendedor_id UUID REFERENCES users(id),
        codigo_programa TEXT,
        nome_programa TEXT,
        link_externo TEXT,
        orgao_concedente VARCHAR(255),
        uf VARCHAR(5),
        municipio VARCHAR(255),
        qualificacao TEXT,
        nr_emenda TEXT,
        parlamentar TEXT,
        cnpj VARCHAR(20) NOT NULL,
        nome TEXT NOT NULL,
        natureza_juridica VARCHAR(255),
        valor_emenda NUMERIC(15,2),
        valor_global NUMERIC(15,2),
        valor_empenhado NUMERIC(15,2),
        valor_liberado NUMERIC(15,2),
        nr_convenio TEXT,
        objeto TEXT,
        modalidade VARCHAR(100),
        situacao VARCHAR(100),
        saldo_conta NUMERIC(15,2),
        telefone VARCHAR(50),
        email VARCHAR(500),
        status_contato VARCHAR(50) DEFAULT 'Ainda Não',
        observacoes TEXT,
        importado_de TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vp_vendedor ON vendedor_projetos(vendedor_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vp_cnpj ON vendedor_projetos(cnpj)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vp_status_contato ON vendedor_projetos(status_contato)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vp_uf ON vendedor_projetos(uf)`)

    // 3. Migrate old statuses to Tito's 4 statuses
    await pool.query(`
      UPDATE vendedor_projetos SET status_contato = 'Ainda Não'
      WHERE status_contato IN ('Novo', 'Contactado') OR status_contato IS NULL;
    `)

    // 4. Update default for status_contato column
    await pool.query(`
      ALTER TABLE vendedor_projetos ALTER COLUMN status_contato SET DEFAULT 'Ainda Não';
    `).catch(() => {}) // ignore if already set

    // 5. Create vendedores
    const passwordHash = await bcrypt.hash('sigma2026', 10)
    const vendedores = [
      { nome: 'Wellington', email: 'wellington@sigma.com' },
      { nome: 'Elisson', email: 'elisson@sigma.com' },
      { nome: 'Gabriel', email: 'gabriel@sigma.com' },
      { nome: 'Vitória', email: 'vitoria@sigma.com' },
    ]

    const created: string[] = []
    for (const v of vendedores) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [v.email])
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [v.nome, v.email, passwordHash, 'vendedor']
        )
        created.push(v.nome)
      }
    }

    // Ensure gestor exists
    const gestorExists = await pool.query('SELECT id FROM users WHERE email = $1', ['gestor@sigma.com'])
    if (gestorExists.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Gestor', 'gestor@sigma.com', passwordHash, 'gestor']
      )
      created.push('Gestor')
    }

    return NextResponse.json({
      success: true,
      tables: ['vendedor_projetos'],
      vendedores_created: created,
      message: `Setup complete. Created: ${created.join(', ') || 'all already existed'}`,
    })
  } catch (error) {
    console.error('Setup CRM error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
