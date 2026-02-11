-- Projetus CRM Schema for Supabase
-- 11 tables + 1 lineage table

-- 1. Programas
CREATE TABLE IF NOT EXISTS programas (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
  nome VARCHAR,
  orgao_superior VARCHAR,
  orgao_vinculado VARCHAR,
  modalidade VARCHAR,
  acao_orcamentaria VARCHAR,
  natureza_juridica VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_programas_transfer_gov_id ON programas(transfer_gov_id);

-- 2. Proponentes
CREATE TABLE IF NOT EXISTS proponentes (
  id SERIAL PRIMARY KEY,
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  nome VARCHAR,
  natureza_juridica VARCHAR(100),
  estado VARCHAR(2),
  municipio VARCHAR,
  cep VARCHAR(8),
  endereco VARCHAR,
  bairro VARCHAR,
  is_osc BOOLEAN DEFAULT FALSE,
  is_existing_client BOOLEAN DEFAULT FALSE,
  total_propostas INTEGER DEFAULT 0,
  total_emendas INTEGER DEFAULT 0,
  valor_total_emendas FLOAT,
  total_convenios INTEGER DEFAULT 0,
  valor_total_desembolsos FLOAT,
  email VARCHAR,
  telefone VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_proponentes_cnpj ON proponentes(cnpj);
CREATE INDEX IF NOT EXISTS ix_proponentes_natureza_juridica ON proponentes(natureza_juridica);
CREATE INDEX IF NOT EXISTS ix_proponentes_is_osc ON proponentes(is_osc);
CREATE INDEX IF NOT EXISTS ix_proponentes_is_existing_client ON proponentes(is_existing_client);

-- 3. Propostas
CREATE TABLE IF NOT EXISTS propostas (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
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
  programa_id VARCHAR,
  proponente_cnpj VARCHAR(14),
  modalidade VARCHAR,
  orgao_superior VARCHAR,
  orgao_vinculado VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_propostas_transfer_gov_id ON propostas(transfer_gov_id);
CREATE INDEX IF NOT EXISTS ix_propostas_proponente_cnpj ON propostas(proponente_cnpj);
CREATE INDEX IF NOT EXISTS ix_propostas_situacao ON propostas(situacao);
CREATE INDEX IF NOT EXISTS ix_propostas_estado ON propostas(estado);
CREATE INDEX IF NOT EXISTS ix_propostas_data_publicacao ON propostas(data_publicacao);
CREATE INDEX IF NOT EXISTS ix_propostas_valor_global ON propostas(valor_global);

-- 4. Apoiadores
CREATE TABLE IF NOT EXISTS apoiadores (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
  nome VARCHAR,
  tipo VARCHAR,
  orgao VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_apoiadores_transfer_gov_id ON apoiadores(transfer_gov_id);

-- 5. Emendas
CREATE TABLE IF NOT EXISTS emendas (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
  numero VARCHAR,
  autor VARCHAR,
  valor FLOAT,
  tipo VARCHAR,
  ano INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_emendas_transfer_gov_id ON emendas(transfer_gov_id);

-- 6. Proposta-Apoiadores (junction)
CREATE TABLE IF NOT EXISTS proposta_apoiadores (
  id SERIAL PRIMARY KEY,
  proposta_transfer_gov_id VARCHAR NOT NULL,
  apoiador_transfer_gov_id VARCHAR NOT NULL,
  extraction_date DATE,
  CONSTRAINT uq_proposta_apoiador UNIQUE (proposta_transfer_gov_id, apoiador_transfer_gov_id)
);
CREATE INDEX IF NOT EXISTS ix_proposta_apoiadores_proposta ON proposta_apoiadores(proposta_transfer_gov_id);
CREATE INDEX IF NOT EXISTS ix_proposta_apoiadores_apoiador ON proposta_apoiadores(apoiador_transfer_gov_id);

-- 7. Proposta-Emendas (junction)
CREATE TABLE IF NOT EXISTS proposta_emendas (
  id SERIAL PRIMARY KEY,
  proposta_transfer_gov_id VARCHAR NOT NULL,
  emenda_transfer_gov_id VARCHAR NOT NULL,
  extraction_date DATE,
  CONSTRAINT uq_proposta_emenda UNIQUE (proposta_transfer_gov_id, emenda_transfer_gov_id)
);
CREATE INDEX IF NOT EXISTS ix_proposta_emendas_proposta ON proposta_emendas(proposta_transfer_gov_id);
CREATE INDEX IF NOT EXISTS ix_proposta_emendas_emenda ON proposta_emendas(emenda_transfer_gov_id);

-- 8. Convenios
CREATE TABLE IF NOT EXISTS convenios (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
  proposta_id VARCHAR,
  situacao VARCHAR,
  instrumento_ativo VARCHAR,
  valor_global FLOAT,
  valor_repasse FLOAT,
  valor_contrapartida FLOAT,
  valor_desembolsado FLOAT,
  data_assinatura DATE,
  data_publicacao DATE,
  data_inicio_vigencia DATE,
  data_fim_vigencia DATE,
  ano INTEGER,
  valor_empenhado FLOAT,
  saldo_conta FLOAT,
  saldo_reman_tesouro FLOAT,
  saldo_reman_convenente FLOAT,
  rendimento_aplicacao FLOAT,
  ingresso_contrapartida FLOAT,
  valor_global_original FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_convenios_transfer_gov_id ON convenios(transfer_gov_id);
CREATE INDEX IF NOT EXISTS ix_convenios_proposta_id ON convenios(proposta_id);

-- 9. Desembolsos
CREATE TABLE IF NOT EXISTS desembolsos (
  id SERIAL PRIMARY KEY,
  transfer_gov_id VARCHAR NOT NULL UNIQUE,
  convenio_id VARCHAR,
  data_desembolso DATE,
  valor_desembolsado FLOAT,
  nr_siafi VARCHAR,
  ano_desembolso INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE
);
CREATE INDEX IF NOT EXISTS ix_desembolsos_transfer_gov_id ON desembolsos(transfer_gov_id);
CREATE INDEX IF NOT EXISTS ix_desembolsos_convenio_id ON desembolsos(convenio_id);

-- 10. Historico Situacao
CREATE TABLE IF NOT EXISTS historico_situacao (
  id SERIAL PRIMARY KEY,
  proposta_id VARCHAR,
  convenio_id VARCHAR,
  data_historico TIMESTAMP,
  situacao VARCHAR,
  dias_historico INTEGER,
  cod_historico VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  extraction_date DATE,
  CONSTRAINT uq_historico_situacao UNIQUE (proposta_id, convenio_id, data_historico, situacao)
);
CREATE INDEX IF NOT EXISTS ix_historico_situacao_proposta ON historico_situacao(proposta_id);
CREATE INDEX IF NOT EXISTS ix_historico_situacao_convenio ON historico_situacao(convenio_id);

-- 11. Extraction Logs
CREATE TABLE IF NOT EXISTS extraction_logs (
  id SERIAL PRIMARY KEY,
  run_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR NOT NULL,
  files_downloaded INTEGER,
  total_records INTEGER,
  records_inserted INTEGER,
  records_updated INTEGER,
  records_skipped INTEGER,
  duration_seconds FLOAT,
  error_message TEXT
);

-- 12. Data Lineage
CREATE TABLE IF NOT EXISTS data_lineage (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR NOT NULL,
  entity_id VARCHAR NOT NULL,
  source_file VARCHAR NOT NULL,
  extraction_date TIMESTAMP NOT NULL,
  pipeline_version VARCHAR,
  record_hash VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_data_lineage_entity ON data_lineage(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_data_lineage_source ON data_lineage(source_file);
