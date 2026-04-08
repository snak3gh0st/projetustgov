// ============================================================================
// tgov-tables.ts — DDL idempotente para tabelas TGov-only
// ============================================================================
//
// Garante existência de tgov_propostas e tgov_projetos_execucao. Pode ser
// chamado por:
//   - tgov-only-sync (writer)
//   - rotas /api/tgov/* (reader, defensivo — first-call init)
//
// Implementa cache de processo: roda DDL apenas uma vez por instância Node.
// ============================================================================

import { getPool } from '@/lib/db'

let tablesEnsured = false

export async function ensureTgovTables(): Promise<void> {
  if (tablesEnsured) return
  const pool = getPool()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tgov_propostas (
      id SERIAL PRIMARY KEY,
      transfer_gov_id VARCHAR NOT NULL UNIQUE,
      nr_proposta VARCHAR,
      titulo VARCHAR,
      valor_global FLOAT,
      valor_repasse FLOAT,
      valor_contrapartida FLOAT,
      data_publicacao DATE,
      data_inicio_vigencia DATE,
      data_fim_vigencia DATE,
      situacao VARCHAR,
      estado VARCHAR(2),
      municipio VARCHAR,
      proponente VARCHAR,
      proponente_cnpj VARCHAR(14),
      modalidade VARCHAR,
      orgao_superior VARCHAR,
      orgao_vinculado VARCHAR,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_propostas_cnpj ON tgov_propostas(proponente_cnpj)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_propostas_nr_proposta ON tgov_propostas(nr_proposta)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_propostas_situacao ON tgov_propostas(situacao)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tgov_projetos_execucao (
      id SERIAL PRIMARY KEY,
      nr_convenio          VARCHAR(30)    NOT NULL,
      id_proposta          VARCHAR(30),
      nr_proposta          VARCHAR(30),
      situacao             VARCHAR(100),
      modalidade           VARCHAR(100),
      cnpj                 VARCHAR(14)    NOT NULL,
      nome_proponente      VARCHAR(500),
      objeto               TEXT,
      uf                   VARCHAR(2),
      municipio            VARCHAR(200),
      valor_global         NUMERIC(18,2),
      valor_repasse        NUMERIC(18,2),
      valor_desembolsado   NUMERIC(18,2),
      saldo_conta          NUMERIC(18,2),
      valor_empenhado      NUMERIC(18,2),
      rendimento_aplicacao   NUMERIC(18,2) DEFAULT 0,
      ingresso_contrapartida NUMERIC(18,2) DEFAULT 0,
      data_assinatura      DATE,
      data_inicio_vigencia DATE,
      data_fim_vigencia    DATE,
      pct_execucao         NUMERIC(6,2),
      dias_em_execucao     INTEGER,
      dias_ate_vencimento  INTEGER,
      alerta_desembolso    BOOLEAN DEFAULT FALSE,
      verificar_saldo      BOOLEAN DEFAULT FALSE,
      ano_referencia       INTEGER,
      dia_limite_prest_contas DATE,
      dias_prest_contas    INTEGER DEFAULT 0,
      synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tgov_projetos_execucao_nr_convenio UNIQUE (nr_convenio)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_pe_cnpj ON tgov_projetos_execucao(cnpj)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_pe_situacao ON tgov_projetos_execucao(situacao)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_pe_data_fim ON tgov_projetos_execucao(data_fim_vigencia) WHERE data_fim_vigencia IS NOT NULL`)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_pe_nr_proposta ON tgov_projetos_execucao(nr_proposta) WHERE nr_proposta IS NOT NULL`)

  // Phase 20 — defensive: ensure tecnico_id columns exist on TGov tables
  await pool.query(`ALTER TABLE tgov_propostas ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES users(id) ON DELETE SET NULL`)
  await pool.query(`ALTER TABLE tgov_projetos_execucao ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES users(id) ON DELETE SET NULL`)

  // Phase 20 — defensive: ensure tgov_comments table exists (append-only v1)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tgov_comments (
      id SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('proposta','execucao')),
      target_key TEXT NOT NULL,
      author_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS ix_tgov_comments_target ON tgov_comments(target_type, target_key, created_at DESC)`)

  tablesEnsured = true
}
