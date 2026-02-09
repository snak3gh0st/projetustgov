-- Performance optimization indexes for Railway database
-- Run this to speed up dashboard queries significantly

-- Index for proposta_apoiadores junction table (used in JOINs)
CREATE INDEX IF NOT EXISTS ix_proposta_apoiadores_proposta_id
ON proposta_apoiadores(proposta_transfer_gov_id);

CREATE INDEX IF NOT EXISTS ix_proposta_apoiadores_apoiador_id
ON proposta_apoiadores(apoiador_transfer_gov_id);

-- Index for proposta_emendas junction table (used in JOINs)
CREATE INDEX IF NOT EXISTS ix_proposta_emendas_proposta_id
ON proposta_emendas(proposta_transfer_gov_id);

CREATE INDEX IF NOT EXISTS ix_proposta_emendas_emenda_id
ON proposta_emendas(emenda_transfer_gov_id);

-- Composite index for proponentes filtering (most important!)
CREATE INDEX IF NOT EXISTS ix_proponentes_qualification
ON proponentes(is_osc, is_existing_client, estado, total_propostas, total_emendas)
WHERE is_osc = true;

-- Index for proponentes search
CREATE INDEX IF NOT EXISTS ix_proponentes_nome_trgm
ON proponentes USING gin(nome gin_trgm_ops);

-- Enable pg_trgm extension for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for apoiadores orgao (used in STRING_AGG)
CREATE INDEX IF NOT EXISTS ix_apoiadores_orgao
ON apoiadores(orgao)
WHERE orgao IS NOT NULL AND orgao != '';

-- Index for propostas by proponente CNPJ (critical for aggregations)
CREATE INDEX IF NOT EXISTS ix_propostas_proponente_cnpj
ON propostas(proponente_cnpj)
WHERE proponente_cnpj IS NOT NULL;

-- Index for convenios by proposta_id (used in aggregations)
CREATE INDEX IF NOT EXISTS ix_convenios_proposta_id
ON convenios(proposta_id);

-- Index for desembolsos by convenio_id (used in aggregations)
CREATE INDEX IF NOT EXISTS ix_desembolsos_convenio_id
ON desembolsos(convenio_id)
WHERE valor_desembolsado IS NOT NULL;

-- Index for historico_situacao by proposta_id
CREATE INDEX IF NOT EXISTS ix_historico_situacao_proposta_id
ON historico_situacao(proposta_id);
