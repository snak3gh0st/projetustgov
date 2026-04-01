CREATE TABLE IF NOT EXISTS tgov_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key TEXT NOT NULL UNIQUE,
  tab TEXT NOT NULL CHECK (tab IN ('aprovacao', 'execucao')),
  status TEXT,
  obs TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_tgov_interactions_item_key ON tgov_interactions(item_key);
