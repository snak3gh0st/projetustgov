-- Requires 20261105_financeiro_integrado.sql. Additive; no provider writes or delivery flags.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('projete_despesas_20261112'));
CREATE TABLE IF NOT EXISTS expense_policies (
  tenant_key TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_by UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expense_requests (
  id UUID PRIMARY KEY, tenant_key TEXT NOT NULL, requester_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('authorization','reimbursement','purchase')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','head_review','admin_review','authority_review','changes','approved','finance_review','exception_review','released','rejected','canceled')),
  revision INTEGER NOT NULL DEFAULT 1, data JSONB NOT NULL,
  authorization_id UUID REFERENCES expense_requests(id), policy JSONB,
  authority_id UUID, protocol TEXT, approved_amount_cents BIGINT,
  approved_conditions TEXT, execution_mode TEXT CHECK (execution_mode IN ('company','employee')),
  valid_until DATE, released_at TIMESTAMPTZ, due_date DATE,
  finance_entry_id UUID UNIQUE REFERENCES finance_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,protocol),
  CHECK (kind <> 'authorization' OR authorization_id IS NULL),
  CHECK (kind <> 'purchase' OR authorization_id IS NOT NULL),
  CHECK (status <> 'released' OR (released_at IS NOT NULL AND finance_entry_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS expense_requests_owner ON expense_requests(tenant_key,requester_id,created_at DESC);
CREATE INDEX IF NOT EXISTS expense_requests_queue ON expense_requests(tenant_key,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS expense_requests_authorization ON expense_requests(authorization_id);
CREATE TABLE IF NOT EXISTS expense_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL REFERENCES expense_requests(id),
  type TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 5242880), sha256 TEXT NOT NULL,
  content BYTEA NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), removed_at TIMESTAMPTZ,
  UNIQUE(request_id,sha256), CHECK(octet_length(content)=size)
);
ALTER TABLE expense_documents ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS expense_history (
  id BIGSERIAL PRIMARY KEY, tenant_key TEXT NOT NULL, request_id UUID REFERENCES expense_requests(id),
  actor_id UUID NOT NULL, action TEXT NOT NULL, revision INTEGER, note TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_history_request ON expense_history(request_id,id);
CREATE TABLE IF NOT EXISTS expense_notifications (
  id BIGSERIAL PRIMARY KEY, tenant_key TEXT NOT NULL, user_id UUID NOT NULL,
  request_id UUID NOT NULL REFERENCES expense_requests(id), history_id BIGINT NOT NULL REFERENCES expense_history(id),
  seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,history_id)
);
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS expense_config JSONB;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sigma_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON expense_policies,expense_requests,expense_documents,expense_history,expense_notifications TO sigma_app;
    GRANT USAGE,SELECT ON SEQUENCE expense_history_id_seq,expense_notifications_id_seq TO sigma_app;
  END IF;
END $$;
COMMIT;
