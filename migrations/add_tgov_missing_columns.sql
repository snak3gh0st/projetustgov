-- migrations/add_tgov_missing_columns.sql
-- Adds columns from siconv_convenio.csv that were missing:
--   Column E (ANO)                      -> ano_referencia
--   Column S (DIA_LIMITE_PREST_CONTAS)  -> dia_limite_prest_contas
--   Column R (DIAS_PREST_CONTAS)        -> dias_prest_contas

ALTER TABLE projetos_execucao
  ADD COLUMN IF NOT EXISTS ano_referencia          INTEGER,
  ADD COLUMN IF NOT EXISTS dia_limite_prest_contas DATE,
  ADD COLUMN IF NOT EXISTS dias_prest_contas       INTEGER DEFAULT 0;
