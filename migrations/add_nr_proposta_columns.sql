-- Add nr_proposta column to propostas and projetos_execucao tables
-- NR_PROPOSTA = SICONV proposal number (column H), format "NUMERO/ANO" e.g. "004822/2020"
-- Different from ID_PROPOSTA (transfer_gov_id) which is the sequential internal SICONV ID

ALTER TABLE propostas ADD COLUMN IF NOT EXISTS nr_proposta VARCHAR;
ALTER TABLE projetos_execucao ADD COLUMN IF NOT EXISTS nr_proposta VARCHAR(30);

-- Index for fast whitelist filtering
CREATE INDEX IF NOT EXISTS ix_propostas_nr_proposta ON propostas(nr_proposta) WHERE nr_proposta IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_projetos_execucao_nr_proposta ON projetos_execucao(nr_proposta) WHERE nr_proposta IS NOT NULL;
