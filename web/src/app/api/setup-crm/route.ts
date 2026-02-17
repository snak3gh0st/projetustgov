import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import { getApiSession } from '@/lib/dal'

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

export async function GET() {
  const session = await getApiSession()
  if (!session || session.role !== 'gestor') {
    return NextResponse.json({ error: 'Unauthorized — gestor only' }, { status: 401 })
  }
  return runSetup()
}

export async function POST() {
  const session = await getApiSession()
  if (!session || session.role !== 'gestor') {
    return NextResponse.json({ error: 'Unauthorized — gestor only' }, { status: 401 })
  }
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
        role VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (role IN ('gestor', 'vendedor', 'visualizador', 'gestor_vendedor')),
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
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('gestor', 'vendedor', 'visualizador', 'gestor_vendedor'));
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
        valor_venda NUMERIC(15,2),
        telefone VARCHAR(50),
        email VARCHAR(500),
        status_contato VARCHAR(50) DEFAULT 'Não Contatado',
        tipo_vendedor VARCHAR(20) DEFAULT 'SDR' CHECK (tipo_vendedor IN ('SDR', 'Closer')),
        comissao_percentual NUMERIC(5,2),
        comissao_valor NUMERIC(15,2),
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

    // 2a. Deduplicate on new granularity: (cnpj, codigo_programa, nr_emenda).
    // Old concatenated rows (nr_emenda = "EM1 | EM2") are cleaned up in repo-sync.ts AFTER
    // reading existing assignments, so vendedor assignments are preserved during migration.
    await pool.query(`
      DELETE FROM vendedor_projetos a
      USING vendedor_projetos b
      WHERE a.cnpj = b.cnpj
        AND a.codigo_programa = b.codigo_programa
        AND COALESCE(a.nr_emenda, '') = COALESCE(b.nr_emenda, '')
        AND a.id > b.id
    `).catch(() => {}) // safe if no duplicates exist

    // 2c. Drop old (cnpj, codigo_programa) unique index — now replaced by per-emenda granularity
    await pool.query(`
      DROP INDEX IF EXISTS idx_vp_cnpj_codigo_programa
    `).catch(() => {})

    // 2d. Create unique expression index on (cnpj, codigo_programa, COALESCE(nr_emenda, ''))
    // This allows multiple emendas per (cnpj, programa) while still preventing exact duplicates.
    // Named idx_vp_cnpj_prog_emenda — referenced by ON CONFLICT in repo-sync.ts
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vp_cnpj_prog_emenda
      ON vendedor_projetos(cnpj, codigo_programa, COALESCE(nr_emenda, ''))
    `)

    // 2b. Add commission columns if they don't exist (Quick Task 4)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='valor_venda') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN valor_venda NUMERIC(15,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='tipo_vendedor') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN tipo_vendedor VARCHAR(20) DEFAULT 'SDR' CHECK (tipo_vendedor IN ('SDR', 'Closer'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='comissao_percentual') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN comissao_percentual NUMERIC(5,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='comissao_valor') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN comissao_valor NUMERIC(15,2);
        END IF;
      END $$;
    `).catch(() => {}) // ignore if already exists

    // 2c. Calculate commission for existing records
    // Formula: comissao_valor = valor_venda * vendedor_percentage (commission only, no bonus)
    //          comissao_bonus = R$50 per fechamento (separate)
    await pool.query(`
      UPDATE vendedor_projetos
      SET
        comissao_percentual = CASE
          WHEN tipo_vendedor = 'SDR' THEN 1.00
          WHEN tipo_vendedor = 'Closer' THEN 4.00
          ELSE 1.00
        END,
        comissao_valor = CASE
          WHEN tipo_vendedor = 'SDR' THEN COALESCE(valor_venda, 0) * 0.01
          WHEN tipo_vendedor = 'Closer' THEN COALESCE(valor_venda, 0) * 0.04
          ELSE COALESCE(valor_venda, 0) * 0.01
        END,
        comissao_bonus = 50.00
      WHERE valor_venda IS NOT NULL AND valor_venda > 0
        AND (comissao_valor IS NULL OR comissao_percentual IS NULL);
    `).catch(() => {})

    // 3. Migrate old statuses to "Não Contatado" (updated from "Ainda Não")
    await pool.query(`
      UPDATE vendedor_projetos SET status_contato = 'Não Contatado'
      WHERE status_contato IN ('Ainda Não', 'Novo', 'Contactado') OR status_contato IS NULL;
    `)

    // 4. Update default for status_contato column
    await pool.query(`
      ALTER TABLE vendedor_projetos ALTER COLUMN status_contato SET DEFAULT 'Não Contatado';
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

    // 6b. Create commission_config table (Phase 13 Plan 01)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_config (
        id SERIAL PRIMARY KEY,
        tipo_vendedor VARCHAR(20) NOT NULL CHECK (tipo_vendedor IN ('SDR', 'Closer')),
        percentual_default NUMERIC(5,2) NOT NULL,
        taxa_fixa NUMERIC(15,2) NOT NULL DEFAULT 0,
        vendedor_id UUID REFERENCES users(id),
        active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `).catch(() => {})
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cc_tipo_vendedor ON commission_config(tipo_vendedor);`).catch(() => {})
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cc_active ON commission_config(active);`).catch(() => {})

    // 6c. Create commission_overrides table (Phase 13 Plan 01)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_overrides (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES vendedor_projetos(id),
        percentual_override NUMERIC(5,2) NOT NULL,
        taxa_fixa_override NUMERIC(15,2),
        motivo TEXT NOT NULL,
        approved_by UUID NOT NULL REFERENCES users(id),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `).catch(() => {})
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_co_lead_id ON commission_overrides(lead_id);`).catch(() => {})
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_co_active ON commission_overrides(active);`).catch(() => {})

    // 6d. Seed default commission config (SDR: 1%+R$50, Closer: 4%+R$50)
    await pool.query(`
      INSERT INTO commission_config (tipo_vendedor, percentual_default, taxa_fixa, active)
      SELECT 'SDR', 1.00, 50.00, true
      WHERE NOT EXISTS (SELECT 1 FROM commission_config WHERE tipo_vendedor = 'SDR' AND active = true);
    `).catch(() => {})
    await pool.query(`
      INSERT INTO commission_config (tipo_vendedor, percentual_default, taxa_fixa, active)
      SELECT 'Closer', 4.00, 50.00, true
      WHERE NOT EXISTS (SELECT 1 FROM commission_config WHERE tipo_vendedor = 'Closer' AND active = true);
    `).catch(() => {})

    // 6e. Add comissao_locked and comissao_bonus columns to vendedor_projetos
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='comissao_locked') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN comissao_locked BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='comissao_bonus') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN comissao_bonus NUMERIC(15,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='endereco') THEN
          ALTER TABLE vendedor_projetos ADD COLUMN endereco TEXT;
        END IF;
      END $$;
    `).catch(() => {})

    // 6f. Lock commission for existing Fechado leads
    await pool.query(`
      UPDATE vendedor_projetos SET comissao_locked = true WHERE status_contato = 'Fechado' AND comissao_locked IS NOT true;
    `).catch(() => {})

    // 6g. Migrate existing records: separate bonus from comissao_valor
    // If comissao_bonus is NULL/0 but comissao_valor has the old combined value,
    // recalculate: comissao_valor = valor_venda * (comissao_percentual/100), bonus = 50
    await pool.query(`
      UPDATE vendedor_projetos
      SET comissao_valor = COALESCE(valor_venda, 0) * (COALESCE(comissao_percentual, 1.00) / 100),
          comissao_bonus = 50.00
      WHERE comissao_valor IS NOT NULL
        AND comissao_valor > 0
        AND valor_venda IS NOT NULL
        AND valor_venda > 0
        AND (comissao_bonus IS NULL OR comissao_bonus = 0)
    `).catch(() => {})

    // 7. Status migration already handled in step 3 above (Quick Task 4)

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

    // 8b. BrasilAPI retroactive enrichment for leads missing contacts OR address
    const missingData = await pool.query(`
      SELECT DISTINCT cnpj FROM vendedor_projetos
      WHERE (telefone IS NULL OR telefone = '') OR (email IS NULL OR email = '') OR (endereco IS NULL OR endereco = '')
      LIMIT 50
    `).catch(() => ({ rows: [] }))

    let apiEnrichedCount = 0
    const cnpjsToEnrich = (missingData.rows || []) as { cnpj: string }[]

    for (const row of cnpjsToEnrich) {
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${row.cnpj}`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
        })
        if (!res.ok) { await new Promise(r => setTimeout(r, 300)); continue }
        const data = await res.json()
        const phoneRaw = data.ddd_telefone_1 || ''
        const phoneDigits = phoneRaw.replace(/\D/g, '')
        const phone = phoneDigits.length >= 10
          ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.length === 11 ? phoneDigits.slice(2, 7) : phoneDigits.slice(2, 6)}-${phoneDigits.slice(-4)}`
          : phoneDigits.length >= 8 ? phoneRaw : null
        const rawEmail = (data.email || '').trim().toLowerCase()
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

        if (!phone && !email && !endereco && !apiUf && !nome) { await new Promise(r => setTimeout(r, 300)); continue }

        const updates: string[] = []
        const params: unknown[] = []
        let idx = 1
        if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx++})`); params.push(phone) }
        if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${idx++})`); params.push(email) }
        if (endereco) { updates.push(`endereco = COALESCE(NULLIF(endereco, ''), $${idx++})`); params.push(endereco) }
        if (apiUf) { updates.push(`uf = COALESCE(NULLIF(uf, ''), $${idx++})`); params.push(apiUf) }
        if (apiMunicipio) { updates.push(`municipio = COALESCE(NULLIF(municipio, ''), $${idx++})`); params.push(apiMunicipio) }
        if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${idx++} ELSE nome END`); params.push(nome) }
        if (natJur) { updates.push(`natureza_juridica = COALESCE(natureza_juridica, $${idx++})`); params.push(natJur) }
        updates.push('updated_at = NOW()')
        params.push(row.cnpj)
        await pool.query(
          `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx}`,
          params
        )
        apiEnrichedCount++
      } catch {
        // BrasilAPI timeout or error — skip this CNPJ
      }
      await new Promise(r => setTimeout(r, 300))
    }

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

    // 10. Create/ensure users with @projetus.org emails (password = nome123)
    const allUsers = [
      { nome: 'Elisson', email: 'elisson@projetus.org', role: 'vendedor', password: 'Elisson#482' },
      { nome: 'Wellington', email: 'wellington@projetus.org', role: 'vendedor', password: 'Wellington#739' },
      { nome: 'Gabriel', email: 'gabriel@projetus.org', role: 'vendedor', password: 'Gabriel#615' },
      { nome: 'Vitória', email: 'vitoria@projetus.org', role: 'vendedor', password: 'Vitoria#904' },
      { nome: 'Philipe', email: 'philipe@projetus.org', role: 'gestor', password: 'Philipe#268' },
      { nome: 'Tito', email: 'tito@projetus.org', role: 'gestor', password: 'Tito#351' },
      { nome: 'Paulo', email: 'paulo@projetus.org', role: 'gestor_vendedor', password: 'Paulo#649' },
      { nome: 'Admin', email: 'admin@projetus.org', role: 'gestor', password: 'admin123' },
    ]

    // Update passwords and roles for all existing users
    for (const u of allUsers) {
      const hash = await bcrypt.hash(u.password, 10)
      await pool.query('UPDATE users SET password_hash = $1, role = $3 WHERE email = $2', [hash, u.email, u.role])
    }

    const created: string[] = []
    for (const u of allUsers) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [u.email])
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(u.password, 10)
        await pool.query(
          'INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [u.nome, u.email, hash, u.role]
        )
        created.push(`${u.nome} (${u.role})`)
      }
    }

    // 11. Create lead_contacts table (Quick Task 9 — multi-contact per lead)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_contacts (
        id SERIAL PRIMARY KEY,
        lead_cnpj VARCHAR(20) NOT NULL,
        nome_pessoa VARCHAR(255),
        cargo VARCHAR(255),
        telefone VARCHAR(100),
        email VARCHAR(500),
        telefone_status VARCHAR(20) DEFAULT 'desconhecido' CHECK (telefone_status IN ('valido', 'invalido', 'nao_atende', 'desconhecido')),
        principal BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_contacts_cnpj ON lead_contacts(lead_cnpj);`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_contacts_principal ON lead_contacts(lead_cnpj, principal);`)

    // 11b. Migrate existing vendedor_projetos telefone/email as principal contacts
    await pool.query(`
      INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
      SELECT DISTINCT ON (cnpj)
        cnpj,
        NULLIF(telefone, ''),
        NULLIF(email, ''),
        true,
        'desconhecido'
      FROM vendedor_projetos
      WHERE ((telefone IS NOT NULL AND telefone != '') OR (email IS NOT NULL AND email != ''))
        AND NOT EXISTS (SELECT 1 FROM lead_contacts WHERE lead_cnpj = vendedor_projetos.cnpj)
    `).catch(() => {}) // safe — handles re-runs gracefully

    // Summary diagnostics
    const vpCount = await pool.query(
      `SELECT COUNT(*) as total, COUNT(NULLIF(telefone,'')) as with_phone, COUNT(NULLIF(email,'')) as with_email FROM vendedor_projetos`
    )
    const noContact = await pool.query(`
      SELECT COUNT(DISTINCT cnpj) as cnt FROM vendedor_projetos
      WHERE (telefone IS NULL OR telefone = '') AND (email IS NULL OR email = '')
    `).catch(() => ({ rows: [{ cnt: 0 }] }))

    return NextResponse.json({
      success: true,
      vendedores_created: created,
      enriched_from_proponentes: enrichedCount,
      enriched_from_brasil_api: apiEnrichedCount,
      leads: vpCount.rows[0],
      remaining_no_contact: Number(noContact.rows[0].cnt),
    })
  } catch (error) {
    console.error('Setup CRM error:', error)
    return NextResponse.json({ error: String(error), success: false }, { status: 500 })
  } finally {
    await pool.end()
  }
}
