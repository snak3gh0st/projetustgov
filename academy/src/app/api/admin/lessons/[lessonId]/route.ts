import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ lessonId: string }> }

const patchBody = z.object({
  title: z.string().min(2).max(255).optional(),
  summary: z.string().nullable().optional(),
  content_html: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).strict()

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { lessonId } = await params
  const parsed = patchBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const updates = parsed.data
  const fields = Object.keys(updates)
  if (!fields.length) return err(400, 'Nenhum campo para atualizar')

  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const values = fields.map(k => (updates as Record<string, unknown>)[k])

  const rows = await query(
    `UPDATE education_lessons SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [lessonId, ...values],
  )

  if (!rows[0]) return err(404, 'Não encontrado')

  // When a lesson becomes published, notify all active enrollees of its product.
  if (updates.status === 'published') {
    try {
      const lesson = rows[0] as { product_id: string; title: string }
      const productId = lesson.product_id
      if (productId) {
        const products = await query<{ slug: string }>(
          'SELECT slug FROM education_products WHERE id = $1',
          [productId],
        )
        const slug = products[0]?.slug
        const link = slug ? `/area/${slug}` : null
        await query(
          `INSERT INTO education_notifications (learner_id, type, title, body, link)
           SELECT e.learner_id, 'new_lesson', 'Nova aula disponível', $2, $3
           FROM education_enrollments e
           WHERE e.product_id = $1 AND e.status = 'active' AND e.learner_id IS NOT NULL`,
          [productId, `Nova aula: ${lesson.title}`, link],
        )
      }
    } catch (e) {
      // Notification failures must never break the lesson update.
      console.error('Falha ao criar notificações de nova aula', e)
    }
  }

  return ok(rows[0])
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { lessonId } = await params
  await query('DELETE FROM education_lessons WHERE id = $1', [lessonId])
  return ok({ deleted: true })
}
