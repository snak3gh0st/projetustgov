-- Academy: per-lesson Q&A / comments (threaded one level via parent_id)
-- Idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS education_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES education_lessons(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES education_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_education_comments_lesson ON education_comments(lesson_id, created_at);
CREATE INDEX IF NOT EXISTS ix_education_comments_parent ON education_comments(parent_id);
