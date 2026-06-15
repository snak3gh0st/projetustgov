import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'
import { z } from 'zod'

const body = z.object({
  status: z.enum(['in_progress', 'completed']),
  position_seconds: z.number().int().min(0).optional(),
})

type Params = { params: Promise<{ lessonId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, 'Dados inválidos')

  const { lessonId } = await params
  const { status, position_seconds } = parsed.data

  const enrollRows = await query<{ enrollment_id: string }>(
    `SELECT e.id AS enrollment_id
     FROM education_enrollments e
     JOIN learners l ON l.id = e.learner_id
     JOIN education_lessons les ON les.product_id = e.product_id
     WHERE l.email = $1 AND les.id = $2 AND e.status = 'active'
     LIMIT 1`,
    [session.email, lessonId],
  )

  if (!enrollRows[0]) return err(403, 'Sem acesso')

  const enrollmentId = enrollRows[0].enrollment_id
  const now = new Date().toISOString()

  await query(
    `INSERT INTO education_progress (enrollment_id, lesson_id, status, last_position_seconds, last_seen_at, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5,
       CASE WHEN $3 IN ('in_progress','completed') THEN $5 ELSE NULL END,
       CASE WHEN $3 = 'completed' THEN $5 ELSE NULL END
     )
     ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
       status = EXCLUDED.status,
       last_position_seconds = COALESCE($4, education_progress.last_position_seconds),
       last_seen_at = $5,
       completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(education_progress.completed_at, $5) ELSE education_progress.completed_at END,
       updated_at = $5`,
    [enrollmentId, lessonId, status, position_seconds ?? null, now],
  )

  if (status === 'completed') {
    try {
      const prodRows = await query<{ product_id: string; slug: string; title: string }>(
        `SELECT les.product_id, p.slug, p.title
         FROM education_lessons les JOIN education_products p ON p.id = les.product_id
         WHERE les.id = $1`,
        [lessonId],
      )
      const product = prodRows[0]
      if (product) {
        const countRows = await query<{ total: number; done: number }>(
          `SELECT
             (SELECT COUNT(*) FROM education_lessons l WHERE l.product_id = $1 AND l.status = 'published')::int AS total,
             (SELECT COUNT(*) FROM education_progress pr
                JOIN education_lessons l ON l.id = pr.lesson_id
                WHERE pr.enrollment_id = $2 AND pr.status = 'completed' AND l.status = 'published')::int AS done`,
          [product.product_id, enrollmentId],
        )
        const counts = countRows[0]
        if (counts && counts.total > 1 && counts.done === counts.total - 1) {
          const link = `/area/${product.slug}`
          const body = `Falta só 1 aula para concluir "${product.title}". Termine e garanta seu certificado!`
          await query(
            `INSERT INTO education_notifications (learner_id, type, title, body, link)
             SELECT $1, 'almost_done', 'Você está quase lá! 🎯', $2, $3
             WHERE NOT EXISTS (
               SELECT 1 FROM education_notifications n
               WHERE n.learner_id = $1 AND n.type = 'almost_done' AND n.link = $3
             )`,
            [session.sub, body, link],
          )
        }
      }
    } catch {
      // nudge is best-effort; never break the progress save
    }
  }

  return ok({ status })
}
