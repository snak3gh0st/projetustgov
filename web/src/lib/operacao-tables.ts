import { getPool } from '@/lib/db'
import { OPERACAO_CHECKLIST, OPERACAO_DOCUMENTOS } from '@/lib/operacao'

let ensured = false

export async function ensureOperacaoTables(): Promise<void> {
  const pool = getPool()

  if (!ensured) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS operacao_checklists (
      id BIGSERIAL PRIMARY KEY,
      cnpj VARCHAR(14) NOT NULL,
      nr_convenio VARCHAR(30) NOT NULL,
      item_key VARCHAR(80) NOT NULL,
      item_label VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      note TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cnpj, nr_convenio, item_key)
    )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS ix_operacao_checklists_cnpj ON operacao_checklists(cnpj)`)

    await pool.query(`
    CREATE TABLE IF NOT EXISTS operacao_documentos (
      id BIGSERIAL PRIMARY KEY,
      cnpj VARCHAR(14) NOT NULL,
      nr_convenio VARCHAR(30) NOT NULL,
      document_key VARCHAR(80) NOT NULL,
      document_label VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pendente',
      note TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cnpj, nr_convenio, document_key)
    )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS ix_operacao_documentos_cnpj ON operacao_documentos(cnpj)`)

    await pool.query(`
    CREATE TABLE IF NOT EXISTS operacao_eventos (
      id BIGSERIAL PRIMARY KEY,
      cnpj VARCHAR(14) NOT NULL,
      nr_convenio VARCHAR(30),
      event_type VARCHAR(40) NOT NULL,
      from_status VARCHAR(80),
      to_status VARCHAR(80),
      note TEXT,
      source VARCHAR(40) NOT NULL DEFAULT 'operacional',
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS ix_operacao_eventos_cnpj ON operacao_eventos(cnpj, occurred_at DESC)`)
    ensured = true
  }

  // The government sync remains the only writer of government facts. These
  // rows are an operational overlay, initialized only for new synced convenios.
  const checklistValues = OPERACAO_CHECKLIST.map((item, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')
  const checklistParams = OPERACAO_CHECKLIST.flatMap(item => [item.key, item.label])
  await pool.query(`
    INSERT INTO operacao_checklists (cnpj, nr_convenio, item_key, item_label)
    SELECT pe.cnpj, pe.nr_convenio, v.item_key, v.item_label
    FROM projetos_execucao pe
    CROSS JOIN (VALUES ${checklistValues}) AS v(item_key, item_label)
    ON CONFLICT (cnpj, nr_convenio, item_key) DO NOTHING
  `, checklistParams)

  const documentValues = OPERACAO_DOCUMENTOS.map((item, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')
  const documentParams = OPERACAO_DOCUMENTOS.flatMap(item => [item.key, item.label])
  await pool.query(`
    INSERT INTO operacao_documentos (cnpj, nr_convenio, document_key, document_label)
    SELECT pe.cnpj, pe.nr_convenio, v.document_key, v.document_label
    FROM projetos_execucao pe
    CROSS JOIN (VALUES ${documentValues}) AS v(document_key, document_label)
    ON CONFLICT (cnpj, nr_convenio, document_key) DO NOTHING
  `, documentParams)

}
