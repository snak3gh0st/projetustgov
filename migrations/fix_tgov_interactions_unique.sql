-- Fix: tgov_interactions had UNIQUE(item_key) but needs UNIQUE(item_key, tab)
-- so that the same item_key can have independent records per tab.
-- The old constraint caused ON CONFLICT(item_key) upserts to overwrite the tab
-- column, so an aprovacao save could silently destroy an execucao record.

-- Step 1: remove old unique constraint on item_key alone
ALTER TABLE tgov_interactions DROP CONSTRAINT IF EXISTS tgov_interactions_item_key_key;

-- Step 2: remove old index (may exist from CREATE INDEX)
DROP INDEX IF EXISTS ix_tgov_interactions_item_key;

-- Step 3: add composite unique constraint (item_key, tab)
ALTER TABLE tgov_interactions ADD CONSTRAINT tgov_interactions_item_key_tab_key UNIQUE (item_key, tab);

-- Step 4: recreate index on item_key for fast lookups
CREATE INDEX IF NOT EXISTS ix_tgov_interactions_item_key ON tgov_interactions(item_key);
