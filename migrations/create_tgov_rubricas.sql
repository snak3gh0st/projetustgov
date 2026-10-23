-- ============================================================================
-- Rubricas da proposta: o time de Aprovação monta as linhas (cargo, meses,
-- data de início, valor unitário) no card da proposta; a Execução vê o total.
-- Total da linha = meses × valor_unitario (calculado no app, não gravado).
-- ============================================================================

CREATE TABLE IF NOT EXISTS tgov_rubricas (
  id              BIGSERIAL PRIMARY KEY,
  nr_proposta     TEXT NOT NULL,
  ordem           INTEGER NOT NULL,
  cargo           TEXT NOT NULL,
  meses           INTEGER NOT NULL CHECK (meses > 0),
  data_inicio     DATE,
  valor_unitario  NUMERIC(14,2) NOT NULL CHECK (valor_unitario >= 0),
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tgov_rubricas_proposta
  ON tgov_rubricas(nr_proposta, ordem);

-- O app conecta como sigma_app (dono das outras tabelas tgov_*).
ALTER TABLE tgov_rubricas OWNER TO sigma_app;
