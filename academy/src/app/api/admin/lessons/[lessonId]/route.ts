import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ lessonId: string }> }

const patchBody = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  is_preview: z.boolean().optional(),
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
  return ok(rows[0])
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { lessonId } = await params
  await query('DELETE FROM education_lessons WHERE id = $1', [lessonId])
  return ok({ deleted: true })
}
