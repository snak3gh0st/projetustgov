-- Pagar.me marketplace: recipients, orders, transactions, webhook events
-- Split: SIGMA 1% | Instructor 70% | Academy 29%
-- Idempotent.

CREATE TABLE IF NOT EXISTS pagarme_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  product_id UUID REFERENCES education_products(id) ON DELETE SET NULL,
  pagarme_recipient_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  document TEXT NOT NULL,
  bank_code TEXT,
  agency TEXT,
  account TEXT,
  account_type TEXT DEFAULT 'checking',
  pix_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_pagarme_recipients_product ON pagarme_recipients(product_id);
CREATE INDEX IF NOT EXISTS ix_pagarme_recipients_learner ON pagarme_recipients(learner_id);

CREATE TABLE IF NOT EXISTS pagarme_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE RESTRICT,
  learner_email TEXT NOT NULL,
  learner_name TEXT,
  learner_document TEXT,
  pagarme_order_id TEXT UNIQUE,
  pagarme_charge_id TEXT UNIQUE,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  amount_cents INTEGER NOT NULL,
  sigma_amount_cents INTEGER NOT NULL,
  instructor_amount_cents INTEGER NOT NULL,
  academy_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pix_qr_code TEXT,
  pix_qr_code_url TEXT,
  pix_expires_at TIMESTAMPTZ,
  boleto_url TEXT,
  boleto_barcode TEXT,
  boleto_expires_at TIMESTAMPTZ,
  card_last4 TEXT,
  card_brand TEXT,
  installments INTEGER DEFAULT 1,
  paid_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pagarme_orders_method_check CHECK (payment_method IN ('pix','boleto','credit_card')),
  CONSTRAINT pagarme_orders_status_check CHECK (status IN ('pending','paid','failed','canceled','refunded'))
);

CREATE INDEX IF NOT EXISTS ix_pagarme_orders_product ON pagarme_orders(product_id);
CREATE INDEX IF NOT EXISTS ix_pagarme_orders_email ON pagarme_orders(learner_email);
CREATE INDEX IF NOT EXISTS ix_pagarme_orders_status ON pagarme_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS pagarme_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagarme_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_pagarme_webhook_events_type ON pagarme_webhook_events(event_type, created_at DESC);
