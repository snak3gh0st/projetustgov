import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ moduleId: string }> }

const patchBody = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).strict()

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { moduleId } = await params
  const rows = await query(`
    SELECT m.*,
           json_agg(
             json_build_object(
               'id', l.id, 'slug', l.slug, 'title', l.title,
               'position', l.position, 'lesson_type', l.lesson_type,
               'duration_seconds', l.duration_seconds, 'status', l.status
             ) ORDER BY l.position
           ) FILTER (WHERE l.id IS NOT NULL) AS lessons
    FROM education_modules m
    LEFT JOIN education_lessons l ON l.module_id = m.id
    WHERE m.id = $1
    GROUP BY m.id
  `, [moduleId])

  if (!rows[0]) return err(404, 'Não encontrado')
  return ok(rows[0])
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { moduleId } = await params
  const parsed = patchBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const updates = parsed.data
  const fields = Object.keys(updates)
  if (!fields.length) return err(400, 'Nenhum campo para atualizar')

  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const values = fields.map(k => (updates as Record<string, unknown>)[k])

  const rows = await query(
    `UPDATE education_modules SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [moduleId, ...values],
  )

  if (!rows[0]) return err(404, 'Não encontrado')
  return ok(rows[0])
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { moduleId } = await params
  await query('DELETE FROM education_modules WHERE id = $1', [moduleId])
  return ok({ deleted: true })
}
