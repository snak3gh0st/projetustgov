import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ productId: string }> }

const createBody = z.object({
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(255),
  description: z.string().optional(),
  position: z.number().int().min(0).default(0),
})

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { productId } = await params
  const rows = await query(`
    SELECT m.*,
           COUNT(l.id)::int AS lesson_count
    FROM education_modules m
    LEFT JOIN education_lessons l ON l.module_id = m.id
    WHERE m.product_id = $1
    GROUP BY m.id
    ORDER BY m.position ASC, m.created_at ASC
  `, [productId])

  return ok(rows)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const { productId } = await params
  const parsed = createBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const d = parsed.data
  const rows = await query(
    `INSERT INTO education_modules (product_id, slug, title, description, position)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [productId, d.slug, d.title, d.description ?? null, d.position],
  )

  return ok(rows[0], 201)
}
