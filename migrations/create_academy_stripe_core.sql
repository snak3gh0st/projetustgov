CREATE SCHEMA IF NOT EXISTS academy;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS academy.connect_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_company_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL UNIQUE,
  email TEXT,
  company_name TEXT,
  country VARCHAR(2) NOT NULL DEFAULT 'BR',
  account_type TEXT NOT NULL DEFAULT 'standard',
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_onboarding_link_created_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_academy_connect_accounts_internal_company_id
  ON academy.connect_accounts(internal_company_id);

CREATE TABLE IF NOT EXISTS academy.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_account_id TEXT NOT NULL REFERENCES academy.connect_accounts(stripe_account_id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stripe_product_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL UNIQUE,
  currency VARCHAR(3) NOT NULL,
  unit_amount INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_academy_products_slug_per_account UNIQUE (stripe_account_id, slug)
);

CREATE TABLE IF NOT EXISTS academy.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES academy.products(id) ON DELETE RESTRICT,
  stripe_account_id TEXT NOT NULL REFERENCES academy.connect_accounts(stripe_account_id) ON DELETE RESTRICT,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_customer_email TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  currency VARCHAR(3) NOT NULL,
  unit_amount INTEGER NOT NULL,
  amount_total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_academy_orders_status
  ON academy.orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_academy_orders_stripe_account_id
  ON academy.orders(stripe_account_id);

CREATE TABLE IF NOT EXISTS academy.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_academy_webhook_events_account_type
  ON academy.webhook_events(stripe_account_id, event_type, created_at DESC);
