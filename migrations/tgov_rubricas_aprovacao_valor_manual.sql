-- ============================================================================
-- Reunião TGov 23/10/2026:
--  * observação opcional por linha de rubrica;
--  * aprovação das rubricas (coord. Aprovação / adm. produto) — a Execução só
--    vê rubricas aprovadas; salvar as linhas de novo tira a aprovação;
--  * valor do contrato informado à mão no card quando o Comercial não tem.
-- ============================================================================

ALTER TABLE tgov_rubricas ADD COLUMN IF NOT EXISTS observacao TEXT;

CREATE TABLE IF NOT EXISTS tgov_rubricas_aprovacao (
  nr_proposta   TEXT PRIMARY KEY,
  aprovado_por  UUID REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tgov_valor_contrato (
  nr_proposta  TEXT PRIMARY KEY,
  valor        NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O app conecta como sigma_app (dono das outras tabelas tgov_*).
ALTER TABLE tgov_rubricas_aprovacao OWNER TO sigma_app;
ALTER TABLE tgov_valor_contrato OWNER TO sigma_app;
