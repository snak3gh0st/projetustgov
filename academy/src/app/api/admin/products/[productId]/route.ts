import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ productId: string }> }

const patchBody = z.object({
  title: z.string().min(2).max(255).optional(),
  subtitle: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional(),
  default_price_cents: z.number().int().min(0).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  sales_page_url: z.string().url().nullable().optional(),
}).strict()

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { productId } = await params
  const rows = await query(`
    SELECT p.*,
           json_agg(
             json_build_object(
               'id', m.id, 'slug', m.slug, 'title', m.title,
               'position', m.position, 'status', m.status,
               'lesson_count', (SELECT COUNT(*) FROM education_lessons l WHERE l.module_id = m.id),
               'lessons', (
                 SELECT json_agg(
                   json_build_object(
                     'id', l.id,
                     'slug', l.slug,
                     'title', l.title,
                     'summary', l.summary,
                     'content_html', l.content_html,
                     'position', l.position,
                     'lesson_type', l.lesson_type,
                     'duration_seconds', l.duration_seconds,
                     'status', l.status
                   ) ORDER BY l.position
                 )
                 FROM education_lessons l
                 WHERE l.module_id = m.id
               )
             ) ORDER BY m.position
           ) FILTER (WHERE m.id IS NOT NULL) AS modules
    FROM education_products p
    LEFT JOIN education_modules m ON m.product_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [productId])

  if (!rows[0]) return err(404, 'Não encontrado')
  return ok(rows[0])
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { productId } = await params
  const parsed = patchBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const updates = parsed.data
  const fields = Object.keys(updates)
  if (!fields.length) return err(400, 'Nenhum campo para atualizar')

  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const values = fields.map(k => (updates as Record<string, unknown>)[k])

  const rows = await query(
    `UPDATE education_products SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [productId, ...values],
  )

  if (!rows[0]) return err(404, 'Não encontrado')
  return ok(rows[0])
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { productId } = await params
  await query('DELETE FROM education_products WHERE id = $1', [productId])
  return ok({ deleted: true })
}
