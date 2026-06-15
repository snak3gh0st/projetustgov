-- Foundation schema for Mentoria + Conta Azul integration
-- Date: 2026-06-08
-- Notes:
-- 1. This migration is intentionally additive.
-- 2. It does not assume a new "student" role in users.
-- 3. It keeps learner identity decoupled from internal staff users.

-- ==========================================
-- Education / Mentoria
-- ==========================================

CREATE TABLE IF NOT EXISTS education_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  description TEXT,
  product_type VARCHAR(40) NOT NULL DEFAULT 'course',
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  visibility VARCHAR(40) NOT NULL DEFAULT 'private',
  cover_image_url TEXT,
  sales_page_url TEXT,
  default_price_cents INTEGER,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_products_type_check CHECK (product_type IN ('course', 'mentorship', 'bundle')),
  CONSTRAINT education_products_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT education_products_visibility_check CHECK (visibility IN ('private', 'unlisted', 'public'))
);

CREATE INDEX IF NOT EXISTS ix_education_products_status ON education_products(status);
CREATE INDEX IF NOT EXISTS ix_education_products_visibility ON education_products(visibility);

CREATE TABLE IF NOT EXISTS education_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  enrollment_opens_at TIMESTAMPTZ,
  enrollment_closes_at TIMESTAMPTZ,
  seat_limit INTEGER,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_cohorts_status_check CHECK (status IN ('draft', 'open', 'closed', 'archived'))
);

CREATE INDEX IF NOT EXISTS ix_education_cohorts_product_id ON education_cohorts(product_id);
CREATE INDEX IF NOT EXISTS ix_education_cohorts_status ON education_cohorts(status);

CREATE TABLE IF NOT EXISTS education_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES education_cohorts(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  drip_days_after_enrollment INTEGER,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_modules_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT uq_education_module_slug UNIQUE (product_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_education_modules_product_id ON education_modules(product_id);
CREATE INDEX IF NOT EXISTS ix_education_modules_cohort_id ON education_modules(cohort_id);
CREATE INDEX IF NOT EXISTS ix_education_modules_position ON education_modules(product_id, position);

CREATE TABLE IF NOT EXISTS education_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES education_modules(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  content_html TEXT,
  lesson_type VARCHAR(40) NOT NULL DEFAULT 'video',
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  position INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  drip_days_after_enrollment INTEGER,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_lessons_type_check CHECK (lesson_type IN ('video', 'live', 'text', 'download')),
  CONSTRAINT education_lessons_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT uq_education_lesson_slug UNIQUE (module_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_education_lessons_module_id ON education_lessons(module_id);
CREATE INDEX IF NOT EXISTS ix_education_lessons_product_id ON education_lessons(product_id);
CREATE INDEX IF NOT EXISTS ix_education_lessons_position ON education_lessons(module_id, position);

CREATE TABLE IF NOT EXISTS education_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  module_id UUID REFERENCES education_modules(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES education_lessons(id) ON DELETE CASCADE,
  asset_type VARCHAR(40) NOT NULL,
  provider VARCHAR(80),
  provider_asset_id VARCHAR(255),
  title VARCHAR(255),
  mime_type VARCHAR(120),
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  url TEXT,
  playback_url TEXT,
  download_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_assets_type_check CHECK (asset_type IN ('video', 'thumbnail', 'attachment', 'subtitle', 'cover'))
);

CREATE INDEX IF NOT EXISTS ix_education_assets_product_id ON education_assets(product_id);
CREATE INDEX IF NOT EXISTS ix_education_assets_lesson_id ON education_assets(lesson_id);
CREATE INDEX IF NOT EXISTS ix_education_assets_provider_asset_id ON education_assets(provider, provider_asset_id);

CREATE TABLE IF NOT EXISTS education_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES education_cohorts(id) ON DELETE SET NULL,
  order_id UUID,
  learner_email VARCHAR(255) NOT NULL,
  learner_name VARCHAR(255),
  learner_phone VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  enrolled_at TIMESTAMPTZ,
  access_starts_at TIMESTAMPTZ,
  access_ends_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_enrollments_status_check CHECK (status IN ('pending', 'active', 'completed', 'paused', 'revoked', 'expired')),
  CONSTRAINT uq_education_enrollment UNIQUE (product_id, cohort_id, learner_email)
);

CREATE INDEX IF NOT EXISTS ix_education_enrollments_product_id ON education_enrollments(product_id);
CREATE INDEX IF NOT EXISTS ix_education_enrollments_cohort_id ON education_enrollments(cohort_id);
CREATE INDEX IF NOT EXISTS ix_education_enrollments_email ON education_enrollments(learner_email);
CREATE INDEX IF NOT EXISTS ix_education_enrollments_status ON education_enrollments(status);

CREATE TABLE IF NOT EXISTS education_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES education_enrollments(id) ON DELETE CASCADE,
  grant_type VARCHAR(40) NOT NULL,
  source_ref VARCHAR(255),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT education_access_grants_type_check CHECK (grant_type IN ('purchase', 'manual', 'courtesy', 'partner', 'scholarship'))
);

CREATE INDEX IF NOT EXISTS ix_education_access_grants_enrollment_id ON education_access_grants(enrollment_id);
CREATE INDEX IF NOT EXISTS ix_education_access_grants_source_ref ON education_access_grants(source_ref);

CREATE TABLE IF NOT EXISTS education_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES education_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES education_lessons(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'not_started',
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_position_seconds INTEGER,
  started_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT education_progress_status_check CHECK (status IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT uq_education_progress UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS ix_education_progress_enrollment_id ON education_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS ix_education_progress_lesson_id ON education_progress(lesson_id);

-- ==========================================
-- Billing / Orders
-- ==========================================

CREATE TABLE IF NOT EXISTS billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_customer_ref VARCHAR(255),
  learner_email VARCHAR(255) NOT NULL,
  learner_name VARCHAR(255),
  learner_phone VARCHAR(40),
  document_type VARCHAR(20),
  document_number VARCHAR(40),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_billing_customers_email UNIQUE (learner_email)
);

CREATE INDEX IF NOT EXISTS ix_billing_customers_document ON billing_customers(document_number);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_customer_id UUID REFERENCES billing_customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES education_products(id) ON DELETE SET NULL,
  cohort_id UUID REFERENCES education_cohorts(id) ON DELETE SET NULL,
  source_context VARCHAR(40) NOT NULL DEFAULT 'education',
  source_ref VARCHAR(255),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_total_cents INTEGER NOT NULL DEFAULT 0,
  gateway_provider VARCHAR(80),
  gateway_order_id VARCHAR(255),
  approved_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_source_context_check CHECK (source_context IN ('education', 'service', 'project')),
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'authorized', 'paid', 'partially_paid', 'failed', 'canceled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS ix_orders_billing_customer_id ON orders(billing_customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS ix_orders_gateway_order_id ON orders(gateway_provider, gateway_order_id);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type VARCHAR(40) NOT NULL DEFAULT 'education_product',
  product_id UUID REFERENCES education_products(id) ON DELETE SET NULL,
  cohort_id UUID REFERENCES education_cohorts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_price_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT order_items_type_check CHECK (item_type IN ('education_product', 'service', 'fee'))
);

CREATE INDEX IF NOT EXISTS ix_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL,
  provider_payment_id VARCHAR(255),
  method VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_status_check CHECK (status IN ('pending', 'authorized', 'paid', 'failed', 'canceled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS ix_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS ix_payments_provider_payment_id ON payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS ix_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL,
  provider_refund_id VARCHAR(255),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT refunds_status_check CHECK (status IN ('pending', 'processed', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS ix_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS ix_refunds_provider_refund_id ON refunds(provider, provider_refund_id);

ALTER TABLE education_enrollments
  ADD CONSTRAINT education_enrollments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- ==========================================
-- Conta Azul integration
-- ==========================================

CREATE TABLE IF NOT EXISTS conta_azul_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key VARCHAR(120) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  account_email VARCHAR(255),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  client_id_ref VARCHAR(255),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conta_azul_connections_status_check CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'error'))
);

CREATE INDEX IF NOT EXISTS ix_conta_azul_connections_status ON conta_azul_connections(status);

CREATE TABLE IF NOT EXISTS conta_azul_entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  entity_type VARCHAR(40) NOT NULL,
  internal_id UUID,
  internal_ref VARCHAR(255),
  external_id VARCHAR(255) NOT NULL,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conta_azul_entity_map_type_check CHECK (entity_type IN ('customer', 'product', 'service', 'sale', 'payable', 'receivable', 'contract')),
  CONSTRAINT uq_conta_azul_entity_map UNIQUE (connection_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS ix_conta_azul_entity_map_internal_id ON conta_azul_entity_map(entity_type, internal_id);
CREATE INDEX IF NOT EXISTS ix_conta_azul_entity_map_internal_ref ON conta_azul_entity_map(entity_type, internal_ref);

CREATE TABLE IF NOT EXISTS conta_azul_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL DEFAULT 'push',
  trigger_type VARCHAR(40) NOT NULL DEFAULT 'manual',
  status VARCHAR(40) NOT NULL DEFAULT 'running',
  total_items INTEGER NOT NULL DEFAULT 0,
  success_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT conta_azul_sync_runs_direction_check CHECK (direction IN ('push', 'pull')),
  CONSTRAINT conta_azul_sync_runs_trigger_check CHECK (trigger_type IN ('manual', 'cron', 'retry', 'web')),
  CONSTRAINT conta_azul_sync_runs_status_check CHECK (status IN ('running', 'completed', 'partial', 'failed'))
);

CREATE INDEX IF NOT EXISTS ix_conta_azul_sync_runs_connection_id ON conta_azul_sync_runs(connection_id);
CREATE INDEX IF NOT EXISTS ix_conta_azul_sync_runs_status ON conta_azul_sync_runs(status);

CREATE TABLE IF NOT EXISTS conta_azul_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  sync_run_id UUID REFERENCES conta_azul_sync_runs(id) ON DELETE SET NULL,
  entity_type VARCHAR(40) NOT NULL,
  action VARCHAR(20) NOT NULL,
  internal_id UUID,
  internal_ref VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conta_azul_sync_queue_type_check CHECK (entity_type IN ('customer', 'product', 'service', 'sale', 'payable', 'receivable', 'contract')),
  CONSTRAINT conta_azul_sync_queue_action_check CHECK (action IN ('create', 'update', 'refresh')),
  CONSTRAINT conta_azul_sync_queue_status_check CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS ix_conta_azul_sync_queue_connection_id ON conta_azul_sync_queue(connection_id);
CREATE INDEX IF NOT EXISTS ix_conta_azul_sync_queue_status ON conta_azul_sync_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_conta_azul_sync_queue_internal_ref ON conta_azul_sync_queue(entity_type, internal_ref);

CREATE TABLE IF NOT EXISTS conta_azul_raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES conta_azul_connections(id) ON DELETE CASCADE,
  sync_run_id UUID REFERENCES conta_azul_sync_runs(id) ON DELETE SET NULL,
  entity_type VARCHAR(40) NOT NULL,
  external_id VARCHAR(255),
  event_type VARCHAR(40) NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_conta_azul_raw_events_connection_id ON conta_azul_raw_events(connection_id);
CREATE INDEX IF NOT EXISTS ix_conta_azul_raw_events_external_id ON conta_azul_raw_events(entity_type, external_id);
