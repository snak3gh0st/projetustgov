-- Conta Azul finance mirror (pull) for the BI Financeiro area.
-- Spec: docs/superpowers/specs/2026-10-08-bi-financeiro-conta-azul-design.md
--
-- Apply on btdb as postgres (the app user sigma_app does not own tables):
--   ssh btdb "sudo -u postgres psql -d projetus_hub -v ON_ERROR_STOP=1 -f -" < migrations/create_conta_azul_finance.sql
--
-- Conta Azul ids are stored as TEXT: most are UUIDs, but some endpoints also
-- accept legacy numeric ids. Dates come in Sao Paulo local time without offset,
-- so CA timestamps are TIMESTAMP (no time zone) on purpose.

BEGIN;

-- One row per parcela (installment). The search endpoint (buscar) fills the
-- summary columns; the detail endpoint fills payload, evento_id and dates.
CREATE TABLE IF NOT EXISTS conta_azul_parcelas (
  id TEXT PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL,
  evento_id TEXT,
  status VARCHAR(40),
  status_busca VARCHAR(40),
  descricao TEXT,
  data_vencimento DATE,
  data_competencia DATE,
  data_pagamento_previsto DATE,
  valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_pago NUMERIC(15,2) NOT NULL DEFAULT 0,
  nao_pago NUMERIC(15,2) NOT NULL DEFAULT 0,
  perda NUMERIC(15,2),
  pessoa_id TEXT,
  pessoa_nome TEXT,
  conta_financeira_id TEXT,
  origem VARCHAR(60),
  conciliado BOOLEAN,
  ca_data_alteracao TIMESTAMP,
  detail_alteracao TIMESTAMP,
  payload JSONB,
  busca_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  busca_synced_at TIMESTAMPTZ,
  detail_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT conta_azul_parcelas_tipo_check CHECK (tipo IN ('RECEITA', 'DESPESA'))
);
CREATE INDEX IF NOT EXISTS ix_ca_parcelas_tipo_venc ON conta_azul_parcelas (tipo, data_vencimento);
CREATE INDEX IF NOT EXISTS ix_ca_parcelas_evento ON conta_azul_parcelas (evento_id);
CREATE INDEX IF NOT EXISTS ix_ca_parcelas_pessoa ON conta_azul_parcelas (pessoa_id);
CREATE INDEX IF NOT EXISTS ix_ca_parcelas_open ON conta_azul_parcelas (tipo, data_vencimento) WHERE deleted_at IS NULL AND nao_pago > 0;

-- One row per baixa (payment actually received or paid).
CREATE TABLE IF NOT EXISTS conta_azul_baixas (
  id TEXT PRIMARY KEY,
  parcela_id TEXT NOT NULL REFERENCES conta_azul_parcelas(id) ON DELETE CASCADE,
  evento_id TEXT,
  tipo VARCHAR(10) NOT NULL,
  data_pagamento DATE NOT NULL,
  valor_bruto NUMERIC(15,2) NOT NULL DEFAULT 0,
  juros NUMERIC(15,2) NOT NULL DEFAULT 0,
  multa NUMERIC(15,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxa NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquido NUMERIC(15,2) NOT NULL DEFAULT 0,
  conta_financeira_id TEXT,
  metodo_pagamento VARCHAR(60),
  origem VARCHAR(60)
);
CREATE INDEX IF NOT EXISTS ix_ca_baixas_data ON conta_azul_baixas (data_pagamento);
CREATE INDEX IF NOT EXISTS ix_ca_baixas_evento ON conta_azul_baixas (evento_id);
CREATE INDEX IF NOT EXISTS ix_ca_baixas_parcela ON conta_azul_baixas (parcela_id);

-- Category split of a lancamento (evento). Conta Azul repeats the full evento
-- rateio inside every parcela; it is stored ONCE per evento here.
CREATE TABLE IF NOT EXISTS conta_azul_rateio (
  evento_id TEXT NOT NULL,
  linha INT NOT NULL,
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL,
  categoria_id TEXT,
  categoria_nome TEXT,
  centro_custo_id TEXT,
  valor NUMERIC(15,2) NOT NULL,
  data_competencia DATE,
  origem VARCHAR(60),
  PRIMARY KEY (evento_id, linha)
);
CREATE INDEX IF NOT EXISTS ix_ca_rateio_categoria ON conta_azul_rateio (categoria_id);
CREATE INDEX IF NOT EXISTS ix_ca_rateio_competencia ON conta_azul_rateio (data_competencia);

-- Dimensions
CREATE TABLE IF NOT EXISTS conta_azul_categorias (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo VARCHAR(20),
  categoria_pai TEXT,
  entrada_dre VARCHAR(60),
  considera_custo_dre BOOLEAN,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conta_azul_dre_linhas (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  codigo VARCHAR(20),
  descricao TEXT NOT NULL,
  posicao INT NOT NULL DEFAULT 0,
  nivel INT NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 0,
  totalizador BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conta_azul_dre_categorias (
  dre_linha_id TEXT NOT NULL,
  categoria_id TEXT NOT NULL,
  PRIMARY KEY (dre_linha_id, categoria_id)
);
CREATE INDEX IF NOT EXISTS ix_ca_dre_categorias_cat ON conta_azul_dre_categorias (categoria_id);

CREATE TABLE IF NOT EXISTS conta_azul_centros_custo (
  id TEXT PRIMARY KEY,
  codigo VARCHAR(60),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conta_azul_contas_financeiras (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  banco VARCHAR(120),
  codigo_banco INT,
  tipo VARCHAR(60),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  conta_padrao BOOLEAN NOT NULL DEFAULT FALSE,
  agencia VARCHAR(40),
  numero VARCHAR(60),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conta_azul_pessoas (
  id TEXT PRIMARY KEY,
  nome TEXT,
  documento VARCHAR(40),
  documento_digits VARCHAR(20),
  tipo_pessoa VARCHAR(20),
  perfis TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ca_pessoas_doc ON conta_azul_pessoas (documento_digits);

-- Current balance per account, captured on every sync (Sao Paulo date).
-- Conta Azul only exposes the current balance, so history starts here.
CREATE TABLE IF NOT EXISTS conta_azul_saldos_diarios (
  conta_financeira_id TEXT NOT NULL,
  data DATE NOT NULL,
  saldo NUMERIC(15,2) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conta_financeira_id, data)
);

-- At most one running pull per connection; the runner relies on this to
-- serialise cron and "Sincronizar agora" without holding a DB connection.
CREATE UNIQUE INDEX IF NOT EXISTS ux_conta_azul_sync_runs_running_pull
  ON conta_azul_sync_runs (connection_id)
  WHERE status = 'running' AND direction = 'pull';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  conta_azul_parcelas,
  conta_azul_baixas,
  conta_azul_rateio,
  conta_azul_categorias,
  conta_azul_dre_linhas,
  conta_azul_dre_categorias,
  conta_azul_centros_custo,
  conta_azul_contas_financeiras,
  conta_azul_pessoas,
  conta_azul_saldos_diarios
TO sigma_app;

COMMIT;
