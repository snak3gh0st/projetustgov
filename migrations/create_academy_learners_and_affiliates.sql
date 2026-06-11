-- Academy: Learner auth + Affiliates tracking
-- Date: 2026-06-11

-- ==========================================
-- Learner identity (decoupled from staff users)
-- ==========================================

CREATE TABLE IF NOT EXISTS learners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(255),
  phone          VARCHAR(40),
  password_hash  TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status         VARCHAR(40) NOT NULL DEFAULT 'active',
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learners_status_check CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX IF NOT EXISTS ix_learners_email ON learners(email);
CREATE INDEX IF NOT EXISTS ix_learners_status ON learners(status);

-- ==========================================
-- Affiliates (internal tracking only — no portal)
-- ==========================================

CREATE TABLE IF NOT EXISTS affiliates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 VARCHAR(60) NOT NULL UNIQUE,
  name                 VARCHAR(255) NOT NULL,
  email                VARCHAR(255),
  commission_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,
  status               VARCHAR(40) NOT NULL DEFAULT 'active',
  notes                TEXT,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT affiliates_status_check CHECK (status IN ('active', 'paused', 'inactive')),
  CONSTRAINT affiliates_rate_check CHECK (commission_rate >= 0 AND commission_rate <= 100)
);

CREATE INDEX IF NOT EXISTS ix_affiliates_code ON affiliates(code);
CREATE INDEX IF NOT EXISTS ix_affiliates_status ON affiliates(status);

-- ==========================================
-- Link orders to affiliates + learners
-- ==========================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS learner_id  UUID REFERENCES learners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(60);

CREATE INDEX IF NOT EXISTS ix_orders_learner_id ON orders(learner_id);
CREATE INDEX IF NOT EXISTS ix_orders_affiliate_id ON orders(affiliate_id);

-- ==========================================
-- Commission records (one per paid order with affiliate)
-- ==========================================

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_total_cents INTEGER NOT NULL DEFAULT 0,
  rate              NUMERIC(5,2) NOT NULL,
  commission_cents  INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(40) NOT NULL DEFAULT 'pending',
  paid_at           TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT affiliate_commissions_status_check CHECK (status IN ('pending', 'approved', 'paid', 'canceled')),
  CONSTRAINT uq_affiliate_commissions_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS ix_affiliate_commissions_affiliate_id ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS ix_affiliate_commissions_status ON affiliate_commissions(status);

-- ==========================================
-- Link education_enrollments to learners
-- ==========================================

ALTER TABLE education_enrollments
  ADD COLUMN IF NOT EXISTS learner_id UUID REFERENCES learners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_education_enrollments_learner_id ON education_enrollments(learner_id);

-- ==========================================
-- Password reset tokens
-- ==========================================

CREATE TABLE IF NOT EXISTS learner_password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_learner_password_resets_token_hash ON learner_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS ix_learner_password_resets_learner_id ON learner_password_resets(learner_id);
