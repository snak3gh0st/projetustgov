-- ============================================================================
-- Spec 2 — Notification tables + tgov_propostas columns for seen tracking
-- ============================================================================

-- Participants: who interacted with a proposal (auto-inserted by endpoints)
CREATE TABLE IF NOT EXISTS tgov_proposta_participants (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);
CREATE INDEX IF NOT EXISTS ix_tgov_proposta_participants_user
  ON tgov_proposta_participants(user_id);

-- Seen: when user last viewed a proposal (clears NOVO for that proposal)
CREATE TABLE IF NOT EXISTS tgov_proposta_seen (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);
CREATE INDEX IF NOT EXISTS ix_tgov_proposta_seen_user
  ON tgov_proposta_seen(user_id);

-- New columns on tgov_propostas for tracking assignment + situacao change
ALTER TABLE tgov_propostas
  ADD COLUMN IF NOT EXISTS situacao_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- RLS for consistency
ALTER TABLE tgov_proposta_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tgov_proposta_seen ENABLE ROW LEVEL SECURITY;
