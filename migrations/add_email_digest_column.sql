-- Spec 3 — Email digest opt-in column
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false;
