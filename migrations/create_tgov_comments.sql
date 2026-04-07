-- ============================================================================
-- Phase 20 — Sistema de comentários TGov (append-only v1)
-- Thread vertical no sidecard de ExecucaoSidecard / AprovacaoSidecard.
-- Quem pode escrever: csm, adm_produto, gestor, admin (D6)
-- Edição/deleção: fora de escopo (deferido)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tgov_comments (
  id           SERIAL PRIMARY KEY,
  target_type  TEXT NOT NULL CHECK (target_type IN ('proposta', 'execucao')),
  target_key   TEXT NOT NULL,
  author_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tgov_comments_target
  ON tgov_comments(target_type, target_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tgov_comments_author
  ON tgov_comments(author_id);

-- RLS habilitado por consistência com migrations/enable_rls_all_tables.sql.
-- App conecta como `postgres` superuser → bypassa RLS, sem policies necessárias.
ALTER TABLE tgov_comments ENABLE ROW LEVEL SECURITY;
