-- ============================================================================
-- Phase 20 — Adiciona tecnico_id às 4 tabelas que alimentam os CTEs TGov
-- (aprovacao/route.ts ALL_PROPOSTAS_CTE, execucao/route.ts ALL_EXEC_CTE)
-- Designação manual de técnico responsável (D1/D2/D3 do CONTEXT)
-- Aplicar via Supabase SQL Editor.
-- ============================================================================

ALTER TABLE propostas
  ADD COLUMN IF NOT EXISTS tecnico_id INT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tgov_propostas
  ADD COLUMN IF NOT EXISTS tecnico_id INT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE projetos_execucao
  ADD COLUMN IF NOT EXISTS tecnico_id INT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tgov_projetos_execucao
  ADD COLUMN IF NOT EXISTS tecnico_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_propostas_tecnico_id
  ON propostas(tecnico_id) WHERE tecnico_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tgov_propostas_tecnico_id
  ON tgov_propostas(tecnico_id) WHERE tecnico_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_projetos_execucao_tecnico_id
  ON projetos_execucao(tecnico_id) WHERE tecnico_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tgov_pe_tecnico_id
  ON tgov_projetos_execucao(tecnico_id) WHERE tecnico_id IS NOT NULL;
