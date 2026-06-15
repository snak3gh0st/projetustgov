import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const { slug } = await params

  const enrollRows = await query(
    `SELECT e.id FROM education_enrollments e
     JOIN education_products p ON p.id = e.product_id
     WHERE p.slug = $1 AND e.learner_email = $2 AND e.status = 'active' LIMIT 1`,
    [slug, session.email],
  )
  if (!enrollRows[0]) return err(403, 'Sem acesso a este curso')

  const productRows = await query(`
    SELECT p.*,
      json_agg(
        json_build_object(
          'id', m.id,
          'slug', m.slug,
          'title', m.title,
          'position', m.position,
          'lessons', (
            SELECT json_agg(
              json_build_object(
                'id', l.id,
                'slug', l.slug,
                'title', l.title,
                'position', l.position,
                'lesson_type', l.lesson_type,
                'duration_seconds', l.duration_seconds,
                'video_id', a.provider_asset_id,
                'playback_url', a.playback_url
              ) ORDER BY l.position
            )
            FROM education_lessons l
            LEFT JOIN education_assets a ON a.lesson_id = l.id AND a.asset_type = 'video'
            WHERE l.module_id = m.id AND l.status = 'published'
          )
        ) ORDER BY m.position
      ) FILTER (WHERE m.id IS NOT NULL) AS modules
    FROM education_products p
    LEFT JOIN education_modules m ON m.product_id = p.id AND m.status = 'published'
    WHERE p.slug = $1
    GROUP BY p.id
  `, [slug])

  if (!productRows[0]) return err(404, 'Curso não encontrado')
  return ok({ data: productRows[0] })
}
