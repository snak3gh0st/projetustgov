-- Additive, single-company financial integration. Apply before enabling /financeiro.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('projete_financeiro_20261105'));
CREATE TABLE IF NOT EXISTS finance_settings (
  tenant_key TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('projete','hotmart')),
  external_key TEXT NOT NULL, customer_name TEXT NOT NULL, customer_document TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '', description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  billing_mode TEXT NOT NULL DEFAULT 'review' CHECK (billing_mode IN ('review','single','fixed','subscription')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','refunded')),
  schedule_confirmed BOOLEAN NOT NULL DEFAULT false, remote_person_id TEXT,
  needs_review TEXT, snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(tenant_key,origin,external_key)
);
CREATE TABLE IF NOT EXISTS finance_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'), due_date DATE NOT NULL,
  total_cents BIGINT NOT NULL CHECK (total_cents > 0), snapshot JSONB NOT NULL,
  approved_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(tenant_key,period)
);
CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('projete','hotmart','conta_azul')),
  source_ref TEXT NOT NULL, sale_id UUID REFERENCES finance_sales(id), closing_id UUID REFERENCES finance_closings(id),
  beneficiary_id UUID, kind TEXT NOT NULL CHECK (kind IN ('receivable','payable')),
  description TEXT NOT NULL, customer_name TEXT NOT NULL, remote_person_id TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0), settled_cents BIGINT NOT NULL DEFAULT 0 CHECK (settled_cents >= 0),
  due_date DATE NOT NULL, competence_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','canceled','refunded','review')),
  paid_date DATE, payments JSONB NOT NULL DEFAULT '[]'::jsonb,
  remote_id TEXT, remote_event_id TEXT, synced_at TIMESTAMPTZ,
  invoice_number TEXT, invoice_date DATE, invoice_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,source_ref), UNIQUE(tenant_key,remote_id)
);
CREATE INDEX IF NOT EXISTS finance_entries_due ON finance_entries(tenant_key,due_date,kind);
CREATE TABLE IF NOT EXISTS finance_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL,
  source_ref TEXT NOT NULL, sale_id UUID NOT NULL REFERENCES finance_sales(id),
  beneficiary_id UUID, beneficiary_name TEXT NOT NULL, role TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'calculated' CHECK(status IN ('calculated','released','approved','paid','void')),
  eligibility_date DATE, evidence TEXT, closing_id UUID REFERENCES finance_closings(id),
  paid_by_hotmart BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,source_ref), CHECK (status NOT IN ('released','approved','paid') OR (eligibility_date IS NOT NULL AND beneficiary_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS finance_people (
  tenant_key TEXT NOT NULL, user_id UUID NOT NULL, remote_person_id TEXT NOT NULL,
  PRIMARY KEY(tenant_key,user_id)
);
CREATE TABLE IF NOT EXISTS finance_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL,
  entry_id UUID NOT NULL REFERENCES finance_entries(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed','uncertain','canceled')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,entry_id)
);
CREATE TABLE IF NOT EXISTS finance_events (
  tenant_key TEXT NOT NULL, provider TEXT NOT NULL, event_id TEXT NOT NULL,
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_key,provider,event_id)
);
CREATE TABLE IF NOT EXISTS finance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_key TEXT NOT NULL, provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  item_count INTEGER NOT NULL DEFAULT 0, scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='finance_runs' AND column_name='heartbeat_at') THEN
    ALTER TABLE finance_runs ADD COLUMN heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS finance_runs_one_active ON finance_runs(tenant_key,provider) WHERE status='running';
CREATE TABLE IF NOT EXISTS finance_audit (
  id BIGSERIAL PRIMARY KEY, tenant_key TEXT NOT NULL, actor_id UUID,
  action TEXT NOT NULL, entity_id UUID, detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_deliveries (
  tenant_key TEXT NOT NULL, delivery_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed','uncertain')),
  provider_id TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_key,delivery_key)
);
-- Existing Conta Azul mirrors accept UUID and legacy numeric external IDs.
-- Avoid taking exclusive locks for no-op type conversions on reapplication.
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type<>'text' AND (
      (table_name IN ('finance_sales','finance_people') AND column_name='remote_person_id') OR
      (table_name='finance_entries' AND column_name IN ('remote_person_id','remote_id','remote_event_id')))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE TEXT USING %I::text',c.table_name,c.column_name,c.column_name);
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sigma_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON finance_settings,finance_sales,finance_closings,finance_entries,
      finance_commissions,finance_people,finance_jobs,finance_events,finance_runs,finance_audit,finance_deliveries TO sigma_app;
    GRANT USAGE,SELECT ON SEQUENCE finance_audit_id_seq TO sigma_app;
  END IF;
END $$;
COMMIT;
