import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ moduleId: string }> }

const createBody = z.object({
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(255),
  description: z.string().optional(),
  content_type: z.enum(['video', 'text', 'quiz', 'live']).default('video'),
  position: z.number().int().min(0).default(0),
  is_preview: z.boolean().default(false),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { moduleId } = await params
  const rows = await query(`
    SELECT l.*,
           a.playback_url, a.duration_seconds AS asset_duration
    FROM education_lessons l
    LEFT JOIN education_assets a ON a.lesson_id = l.id AND a.asset_type = 'video'
    WHERE l.module_id = $1
    ORDER BY l.position ASC, l.created_at ASC
  `, [moduleId])

  return ok(rows)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { moduleId } = await params

  const moduleRows = await query(
    'SELECT product_id FROM education_modules WHERE id = $1',
    [moduleId],
  )
  if (!moduleRows[0]) return err(404, 'Módulo não encontrado')

  const parsed = createBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const d = parsed.data
  const rows = await query(
    `INSERT INTO education_lessons
       (module_id, product_id, slug, title, description, content_type, position, is_preview)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [moduleId, (moduleRows[0] as Record<string, unknown>).product_id, d.slug, d.title, d.description ?? null, d.content_type, d.position, d.is_preview],
  )

  return ok(rows[0], 201)
}
