BEGIN;
CREATE TABLE IF NOT EXISTS projete_slack_state (
  team_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  job_owner UUID,
  job_until TIMESTAMPTZ
);
ALTER TABLE projete_slack_state ADD COLUMN IF NOT EXISTS job_owner UUID;
ALTER TABLE projete_slack_state ADD COLUMN IF NOT EXISTS job_until TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS projete_slack_notifications (
  id BIGSERIAL PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES projete_slack_state(team_id),
  notification_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('approval','daily','connection_down','connection_recovered')),
  channel_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  lead_event_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','retry','failed','uncertain','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sending_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  message_ts TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id,notification_key)
);
CREATE INDEX IF NOT EXISTS projete_slack_pending ON projete_slack_notifications(team_id,next_attempt_at,id) WHERE status IN ('pending','retry');
CREATE TABLE IF NOT EXISTS projete_slack_connections (
  team_id TEXT NOT NULL REFERENCES projete_slack_state(team_id),
  instance TEXT NOT NULL,
  bad_since TIMESTAMPTZ,
  incident TEXT,
  last_checked TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(team_id,instance)
);
ALTER TABLE projete_slack_state OWNER TO sigma_app;
ALTER TABLE projete_slack_notifications OWNER TO sigma_app;
ALTER SEQUENCE projete_slack_notifications_id_seq OWNER TO sigma_app;
ALTER TABLE projete_slack_connections OWNER TO sigma_app;
COMMIT;
