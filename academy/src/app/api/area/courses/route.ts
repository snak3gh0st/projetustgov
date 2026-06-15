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
           ) AS lesson_count,
           (
             SELECT COUNT(*)::int FROM education_progress pr
             JOIN education_lessons l ON l.id = pr.lesson_id
             WHERE pr.enrollment_id = e.id AND pr.status = 'completed' AND l.status = 'published'
           ) AS completed_count,
           (
             SELECT l.slug FROM education_progress pr
             JOIN education_lessons l ON l.id = pr.lesson_id
             WHERE pr.enrollment_id = e.id AND pr.status = 'in_progress' AND l.status = 'published'
             ORDER BY pr.updated_at DESC NULLS LAST LIMIT 1
           ) AS resume_lesson_slug,
           (
             SELECT l.title FROM education_progress pr
             JOIN education_lessons l ON l.id = pr.lesson_id
             WHERE pr.enrollment_id = e.id AND pr.status = 'in_progress' AND l.status = 'published'
             ORDER BY pr.updated_at DESC NULLS LAST LIMIT 1
           ) AS resume_lesson_title,
           (SELECT COALESCE(AVG(rating),0)::float FROM education_reviews rv WHERE rv.product_id = p.id) AS avg_rating,
           (SELECT COUNT(*)::int FROM education_reviews rv WHERE rv.product_id = p.id) AS review_count,
           EXISTS(SELECT 1 FROM education_watchlist w WHERE w.product_id = p.id AND w.learner_id = $2) AS in_watchlist
    FROM education_enrollments e
    JOIN education_products p ON p.id = e.product_id
    WHERE e.learner_email = $1 AND e.status = 'active'
    ORDER BY e.enrolled_at DESC
  `, [session.email, session.sub])

  return ok(rows)
}
