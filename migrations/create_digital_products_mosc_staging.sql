CREATE TABLE IF NOT EXISTS digital_products_etl_runs (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(120) NOT NULL,
  source_reference TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,
  rows_read INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS digital_products_mosc_orgs (
  cnpj VARCHAR(14) PRIMARY KEY,
  razao_social TEXT,
  nome_fantasia TEXT,
  natureza_juridica TEXT,
  matriz_filial TEXT,
  situacao_cadastral TEXT,
  data_fundacao DATE,
  removida_do_mosc BOOLEAN,
  data_fechamento DATE,
  ano_fechamento INTEGER,
  uf VARCHAR(2),
  municipio_codigo VARCHAR(10),
  municipio TEXT,
  cep VARCHAR(8),
  endereco TEXT,
  email TEXT,
  telefone TEXT,
  longitude NUMERIC(12,8),
  latitude NUMERIC(12,8),
  cnae VARCHAR(20),
  cnae_secundaria TEXT,
  is_osc BOOLEAN DEFAULT TRUE,
  source_reference TEXT NOT NULL,
  source_updated_at DATE,
  record_hash VARCHAR(64),
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_digital_products_mosc_orgs_uf
  ON digital_products_mosc_orgs(uf);

CREATE INDEX IF NOT EXISTS ix_digital_products_mosc_orgs_area
  ON digital_products_mosc_orgs(situacao_cadastral);

CREATE INDEX IF NOT EXISTS ix_digital_products_mosc_orgs_geo
  ON digital_products_mosc_orgs(latitude, longitude);

CREATE TABLE IF NOT EXISTS digital_products_mosc_areas (
  cnpj VARCHAR(14) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  nome TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (cnpj, tipo, nome)
);

CREATE INDEX IF NOT EXISTS ix_digital_products_mosc_areas_area
  ON digital_products_mosc_areas(tipo, nome);
