import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export async function GET() {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const rows = await query(`
    SELECT p.id, p.slug, p.title, p.subtitle, p.cover_image_url, p.product_type,
           e.status AS enrollment_status, e.enrolled_at,
           (
             SELECT COUNT(*)::int FROM education_lessons l
             JOIN education_modules m ON m.id = l.module_id
             WHERE m.product_id = p.id AND l.status = 'published'
           ) AS lesson_count
    FROM education_enrollments e
    JOIN education_products p ON p.id = e.product_id
    WHERE e.learner_email = $1 AND e.status = 'active'
    ORDER BY e.enrolled_at DESC
  `, [session.email])

  return ok(rows)
}
