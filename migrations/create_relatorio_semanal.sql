-- Retrato semanal do relatório da diretoria (sexta 18h). A rota /api/cron/relatorio-semanal
-- cria a tabela sozinha no primeiro envio; este arquivo é o registro do esquema.
--
-- Aplicar como dono (sigma_app), se for criar à mão:
--   sudo -u postgres psql -d projetus_hub -c 'SET ROLE sigma_app' -f create_relatorio_semanal.sql

CREATE TABLE IF NOT EXISTS relatorio_semanal (
  semana_ate DATE PRIMARY KEY,
  semana_de DATE NOT NULL,
  dados JSONB NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Quem já recebeu esta semana: impede e-mail repetido nas retentativas do run-cron.sh.
  enviado_para TEXT[] NOT NULL DEFAULT '{}',
  enviado_em TIMESTAMPTZ
);
