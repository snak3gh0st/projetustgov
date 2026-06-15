import { NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

// One-time, idempotent schema setup for the notes + notifications features.
// Admin-gated. Runs a fixed set of CREATE TABLE/INDEX IF NOT EXISTS statements.
// Trigger once after deploy: POST /api/admin/migrate (with an admin session).
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS education_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES education_lessons(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_education_notes UNIQUE (learner_id, lesson_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_education_notes_learner ON education_notes(learner_id)`,
  `CREATE INDEX IF NOT EXISTS ix_education_notes_lesson ON education_notes(lesson_id)`,
  `CREATE TABLE IF NOT EXISTS education_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    body TEXT,
    link TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS ix_education_notifications_learner ON education_notifications(learner_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS education_watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_education_watchlist UNIQUE (learner_id, product_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_education_watchlist_learner ON education_watchlist(learner_id)`,
  `CREATE TABLE IF NOT EXISTS education_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES education_products(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_education_reviews UNIQUE (learner_id, product_id)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_education_reviews_product ON education_reviews(product_id)`,
]

export async function POST(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const applied: string[] = []
  for (const sql of STATEMENTS) {
    await query(sql)
    applied.push(sql.trim().split('\n')[0].replace(/\s+/g, ' '))
  }

  return ok({ applied, count: applied.length })
}
