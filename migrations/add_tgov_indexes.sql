-- Index for propostas by data_publicacao (used in TGov aprovacao queries)
CREATE INDEX IF NOT EXISTS ix_propostas_data_publicacao
ON propostas(data_publicacao);

-- Index for propostas by situacao (used in GROUP BY / filter)
CREATE INDEX IF NOT EXISTS ix_propostas_situacao
ON propostas(situacao);

-- Indexes for tgov_whitelist (used in EXISTS subquery)
CREATE INDEX IF NOT EXISTS ix_tgov_whitelist_cnpj
ON tgov_whitelist(cnpj, tab);

CREATE INDEX IF NOT EXISTS ix_tgov_whitelist_nr_proposta
ON tgov_whitelist(nr_proposta, tab);
