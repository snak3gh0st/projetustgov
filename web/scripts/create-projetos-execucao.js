// ==========================================
// UPSERT POLICY for projetos_execucao
// (Phase 15 sync must follow these rules)
// ==========================================
// UPSERT conflict key: ON CONFLICT (nr_convenio) DO UPDATE
// NEVER use cnpj alone as conflict key — one CNPJ has multiple convenios
// Fields updated on every sync: ALL columns (financial, situacao, modalidade,
//   computed columns, synced_at, sync_run_id)
// Fields NEVER overwritten: None currently — table has no gestor-editable state.
//   If gestor annotations are added later, document them here and guard in SET clause.
// Truncation policy: NEVER truncate projetos_execucao. UPSERT only.
// Column mapping: projetos_execucao.nr_convenio = siconv CSV NR_CONVENIO
//                 = convenios.transfer_gov_id (same value, different column name)
// ==========================================

'use strict';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Parse .env.local manually (same pattern as diagnose-status.js and other scripts)
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
});

const pool = new Pool({
  connectionString: envVars.DATABASE_URL || envVars.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// DDL: CREATE TABLE
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS projetos_execucao (
  id SERIAL PRIMARY KEY,

  -- Convenio identity (from siconv_convenio.csv.zip)
  nr_convenio          VARCHAR(30)    NOT NULL,
  id_proposta          VARCHAR(30),
  situacao             VARCHAR(100),
  modalidade           VARCHAR(100),

  -- Proponent identity (from siconv_proposta.csv.zip via id_proposta join)
  cnpj                 VARCHAR(14)    NOT NULL,
  nome_proponente      VARCHAR(500),
  objeto               TEXT,
  uf                   VARCHAR(2),
  municipio            VARCHAR(200),

  -- Financial state — all NUMERIC(18,2), never FLOAT
  valor_global         NUMERIC(18,2),
  valor_repasse        NUMERIC(18,2),
  valor_desembolsado   NUMERIC(18,2),
  saldo_conta          NUMERIC(18,2),
  valor_empenhado      NUMERIC(18,2),

  -- Execution control
  data_assinatura      DATE,
  data_inicio_vigencia DATE,
  data_fim_vigencia    DATE,

  -- Computed at import time, refreshed daily
  pct_execucao         NUMERIC(6,2),
  dias_em_execucao     INTEGER,
  dias_ate_vencimento  INTEGER,

  -- Alert flags (business rule confirmed before Phase 16 — see STATE.md blockers)
  alerta_desembolso    BOOLEAN DEFAULT FALSE,
  verificar_saldo      BOOLEAN DEFAULT FALSE,

  -- Sync metadata
  synced_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  sync_run_id          INTEGER,

  CONSTRAINT uq_projetos_execucao_nr_convenio UNIQUE (nr_convenio)
);
`;

// DDL: CREATE INDEXES
const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS ix_projetos_execucao_cnpj
  ON projetos_execucao(cnpj);

CREATE INDEX IF NOT EXISTS ix_projetos_execucao_situacao
  ON projetos_execucao(situacao);

CREATE INDEX IF NOT EXISTS ix_projetos_execucao_data_fim
  ON projetos_execucao(data_fim_vigencia)
  WHERE data_fim_vigencia IS NOT NULL;
`;

// Verification queries
const VERIFY_COLUMNS_SQL = `
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'projetos_execucao'
ORDER BY ordinal_position;
`;

const VERIFY_CONSTRAINTS_SQL = `
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'projetos_execucao'::regclass;
`;

const VERIFY_INDEXES_SQL = `
SELECT indexname FROM pg_indexes WHERE tablename = 'projetos_execucao';
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Creating projetos_execucao table...');

    await client.query('BEGIN');

    // Create table
    await client.query(CREATE_TABLE_SQL);
    console.log('  CREATE TABLE projetos_execucao — OK');

    // Create indexes
    await client.query(CREATE_INDEXES_SQL);
    console.log('  CREATE INDEX ix_projetos_execucao_cnpj — OK');
    console.log('  CREATE INDEX ix_projetos_execucao_situacao — OK');
    console.log('  CREATE INDEX ix_projetos_execucao_data_fim — OK');

    await client.query('COMMIT');
    console.log('\nDDL committed successfully.\n');

    // Verification: columns
    console.log('--- Column Verification ---');
    console.log('column_name'.padEnd(25) + 'data_type'.padEnd(20) + 'precision'.padEnd(12) + 'scale');
    console.log('-'.repeat(70));
    const colRes = await client.query(VERIFY_COLUMNS_SQL);
    colRes.rows.forEach(row => {
      console.log(
        (row.column_name || '').padEnd(25) +
        (row.data_type || '').padEnd(20) +
        (row.numeric_precision !== null ? String(row.numeric_precision) : '-').padEnd(12) +
        (row.numeric_scale !== null ? String(row.numeric_scale) : '-')
      );
    });

    // Verification: constraints
    console.log('\n--- Constraint Verification ---');
    console.log('conname'.padEnd(50) + 'contype');
    console.log('-'.repeat(60));
    const conRes = await client.query(VERIFY_CONSTRAINTS_SQL);
    conRes.rows.forEach(row => {
      console.log((row.conname || '').padEnd(50) + (row.contype || ''));
    });

    // Verification: indexes
    console.log('\n--- Index Verification ---');
    const idxRes = await client.query(VERIFY_INDEXES_SQL);
    idxRes.rows.forEach(row => {
      console.log('  ' + row.indexname);
    });

    console.log('\nDone. projetos_execucao table is ready for Phase 15 sync.\n');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating projetos_execucao table:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
