-- Academy: learner watchlist (favorites) + course reviews/ratings
-- Idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS education_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_education_watchlist UNIQUE (learner_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_education_watchlist_learner ON education_watchlist(learner_id);

CREATE TABLE IF NOT EXISTS education_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_education_reviews UNIQUE (learner_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_education_reviews_product ON education_reviews(product_id);
