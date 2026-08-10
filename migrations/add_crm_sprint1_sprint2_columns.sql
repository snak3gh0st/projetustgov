-- CRM Sprint 1: service tag for closed sales.
ALTER TABLE vendedor_projetos
  ADD COLUMN IF NOT EXISTS tipo_servico VARCHAR(40);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendedor_projetos_tipo_servico_check'
  ) THEN
    ALTER TABLE vendedor_projetos
      ADD CONSTRAINT vendedor_projetos_tipo_servico_check
      CHECK (tipo_servico IS NULL OR tipo_servico IN ('Aprovação', 'Execução', 'Prestação de Contas'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vp_tipo_servico ON vendedor_projetos(tipo_servico);

-- CRM Sprint 2: timestamp consumed by immediate alerts and the 48h digest.
ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS situacao_changed_at TIMESTAMPTZ;
