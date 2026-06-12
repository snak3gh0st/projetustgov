import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const rows = await query(`
    SELECT lr.id, lr.email, lr.name, lr.status, lr.created_at, lr.last_login_at,
           COUNT(e.id)::int AS enrollment_count
    FROM learners lr
    LEFT JOIN education_enrollments e ON e.learner_id = lr.id AND e.status = 'active'
    WHERE lr.status != 'deleted'
    GROUP BY lr.id
    ORDER BY lr.created_at DESC
    LIMIT 500
  `)

  return ok(rows)
}
