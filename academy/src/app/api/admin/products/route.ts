import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

const createBody = z.object({
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(255),
  subtitle: z.string().max(255).optional(),
  description: z.string().optional(),
  product_type: z.enum(['course', 'mentorship', 'bundle']).default('course'),
  default_price_cents: z.number().int().min(0).optional(),
  currency: z.string().length(3).default('BRL'),
})

export async function GET() {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const rows = await query(`
    SELECT p.*,
           COUNT(DISTINCT m.id)::int  AS module_count,
           COUNT(DISTINCT e.id)::int  AS enrollment_count
    FROM education_products p
    LEFT JOIN education_modules m ON m.product_id = p.id
    LEFT JOIN education_enrollments e ON e.product_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `)

  return ok(rows)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const parsed = createBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const d = parsed.data
  const rows = await query(
    `INSERT INTO education_products
       (slug, title, subtitle, description, product_type, default_price_cents, currency, status, visibility)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft','private')
     RETURNING *`,
    [d.slug, d.title, d.subtitle ?? null, d.description ?? null, d.product_type, d.default_price_cents ?? null, d.currency],
  )

  return ok(rows[0], 201)
}
