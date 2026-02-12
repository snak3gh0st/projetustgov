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
        role VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (role IN ('gestor', 'vendedor', 'visualizador')),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `)

    // 1b. Update existing constraint to include visualizador (Phase 11 Plan 04)
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('gestor', 'vendedor', 'visualizador'));
      END $$;
    `).catch(() => {}) // Ignore if constraint doesn't exist or already updated

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
        status_contato VARCHAR(50) DEFAULT 'Não Contatado',
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

    // 5. Create existing_clients table (Phase 11 Decision #2)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS existing_clients (
        id SERIAL PRIMARY KEY,
        cnpj VARCHAR(20) UNIQUE NOT NULL,
        nome TEXT,
        added_by UUID REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_existing_clients_cnpj ON existing_clients(cnpj);`)

    // 6. Activate contact_notes table (ready for timeline feature in Phase 11)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_cnpj VARCHAR(20) NOT NULL,
        vendedor_id UUID REFERENCES users(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('ligacao', 'email', 'whatsapp', 'reuniao', 'outro')),
        observacao TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contact_notes_lead_cnpj ON contact_notes(lead_cnpj);`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contact_notes_vendedor ON contact_notes(vendedor_id);`)

    // 7. Update status_contato default to 'Não Contatado' (Phase 11 Decision #1)
    await pool.query(`
      UPDATE vendedor_projetos
      SET status_contato = 'Não Contatado'
      WHERE status_contato = 'Ainda Não' AND observacoes IS NULL;
    `).catch(() => {})

    await pool.query(`
      ALTER TABLE vendedor_projetos
      ALTER COLUMN status_contato SET DEFAULT 'Não Contatado';
    `).catch(() => {})

    // 8. Enrich existing leads with telefone/email from proponentes table
    const enrichResult = await pool.query(`
      UPDATE vendedor_projetos vp
      SET
        telefone = COALESCE(NULLIF(vp.telefone, ''), p.telefone),
        email = COALESCE(NULLIF(vp.email, ''), p.email)
      FROM proponentes p
      WHERE p.cnpj = vp.cnpj
        AND (p.email IS NOT NULL OR p.telefone IS NOT NULL)
        AND (vp.telefone IS NULL OR vp.telefone = '' OR vp.email IS NULL OR vp.email = '')
    `).catch(() => ({ rowCount: 0 }))
    const enrichedCount = enrichResult.rowCount || 0

    // 9. Migrate existing @sigma.com emails to @projetus.org
    const emailMigrations = [
      { old: 'wellington@sigma.com', new: 'wellington@projetus.org' },
      { old: 'elisson@sigma.com', new: 'elisson@projetus.org' },
      { old: 'gabriel@sigma.com', new: 'gabriel@projetus.org' },
      { old: 'vitoria@sigma.com', new: 'vitoria@projetus.org' },
      { old: 'gestor@sigma.com', new: 'philipe@projetus.org', nome: 'Philipe' },
      { old: 'paulo@sigma.com', new: 'paulo@projetus.org' },
    ]
    for (const m of emailMigrations) {
      await pool.query(
        `UPDATE users SET email = $1${m.nome ? ', nome = $3' : ''} WHERE email = $2`,
        m.nome ? [m.new, m.old, m.nome] : [m.new, m.old]
      ).catch(() => {}) // ignore if old email doesn't exist or new already taken
    }

    // 10. Create/ensure users with @projetus.org emails
    const passwordHash = await bcrypt.hash('sigma2026', 10)
    const allUsers = [
      { nome: 'Elisson', email: 'elisson@projetus.org', role: 'vendedor' },
      { nome: 'Wellington', email: 'wellington@projetus.org', role: 'vendedor' },
      { nome: 'Gabriel', email: 'gabriel@projetus.org', role: 'vendedor' },
      { nome: 'Vitória', email: 'vitoria@projetus.org', role: 'vendedor' },
      { nome: 'Philipe', email: 'philipe@projetus.org', role: 'gestor' },
      { nome: 'Tito', email: 'tito@projetus.org', role: 'gestor' },
      { nome: 'Paulo', email: 'paulo@projetus.org', role: 'visualizador' },
    ]

    const created: string[] = []
    for (const u of allUsers) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [u.email])
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [u.nome, u.email, passwordHash, u.role]
        )
        created.push(`${u.nome} (${u.role})`)
      }
    }

    // Diagnostics: check state of data
    const diag: Record<string, unknown> = {}
    const propCount = await pool.query(
      `SELECT COUNT(*) as total, COUNT(email) as with_email, COUNT(telefone) as with_phone FROM proponentes`
    ).catch(() => ({ rows: [{ total: 'TABLE_NOT_FOUND', with_email: 0, with_phone: 0 }] }))
    diag.proponentes = propCount.rows[0]

    const vpCount = await pool.query(
      `SELECT COUNT(*) as total, COUNT(NULLIF(telefone,'')) as with_phone, COUNT(NULLIF(email,'')) as with_email FROM vendedor_projetos`
    )
    diag.vendedor_projetos = vpCount.rows[0]

    const overlap = await pool.query(
      `SELECT COUNT(DISTINCT vp.cnpj) as matching FROM vendedor_projetos vp JOIN proponentes p ON p.cnpj = vp.cnpj`
    ).catch(() => ({ rows: [{ matching: 0 }] }))
    diag.cnpj_overlap = overlap.rows[0]

    const sampleVp = await pool.query(`SELECT cnpj FROM vendedor_projetos LIMIT 3`)
    const sampleP = await pool.query(`SELECT cnpj FROM proponentes LIMIT 3`).catch(() => ({ rows: [] }))
    diag.sample_cnpj_vp = sampleVp.rows.map((r: { cnpj: string }) => r.cnpj)
    diag.sample_cnpj_prop = sampleP.rows.map((r: { cnpj: string }) => r.cnpj)

    const statusDist = await pool.query(
      `SELECT status_contato, COUNT(*)::int as cnt FROM vendedor_projetos GROUP BY status_contato ORDER BY cnt DESC`
    )
    diag.status_distribution = statusDist.rows

    return NextResponse.json({
      success: true,
      vendedores_created: created,
      enriched_contacts: enrichedCount,
      diagnostics: diag,
    })
  } catch (error) {
    console.error('Setup CRM error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
