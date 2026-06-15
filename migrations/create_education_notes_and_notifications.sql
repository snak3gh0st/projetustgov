-- Academy: learner notes per lesson + learner notifications
-- Idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS education_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES education_lessons(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_education_notes UNIQUE (learner_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS ix_education_notes_learner ON education_notes(learner_id);
CREATE INDEX IF NOT EXISTS ix_education_notes_lesson ON education_notes(lesson_id);

CREATE TABLE IF NOT EXISTS education_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_education_notifications_learner
  ON education_notifications(learner_id, created_at DESC);
