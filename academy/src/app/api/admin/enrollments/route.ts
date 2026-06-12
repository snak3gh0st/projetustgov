import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

const createBody = z.object({
  learner_email: z.string().email(),
  product_id: z.string().uuid(),
})

export async function GET() {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const rows = await query(`
    SELECT e.*,
           p.title AS product_title, p.slug AS product_slug
    FROM education_enrollments e
    JOIN education_products p ON p.id = e.product_id
    ORDER BY e.created_at DESC
    LIMIT 200
  `)

  return ok(rows)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const parsed = createBody.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { learner_email, product_id } = parsed.data

  const productRows = await query('SELECT id FROM education_products WHERE id = $1 LIMIT 1', [product_id])
  if (!productRows[0]) return err(404, 'Produto não encontrado')

  // Try to find learner_id
  const learnerRows = await query<{ id: string }>(
    'SELECT id, name FROM learners WHERE email = $1 AND status != $2 LIMIT 1',
    [learner_email, 'deleted'],
  )
  const learnerId = learnerRows[0]?.id ?? null
  const learnerName = (learnerRows[0] as Record<string, unknown> | undefined)?.name as string | null ?? null

  const rows = await query(
    `INSERT INTO education_enrollments (product_id, learner_email, learner_name, learner_id, status, enrolled_at)
     VALUES ($1,$2,$3,$4,'active',NOW())
     ON CONFLICT (product_id, cohort_id, learner_email)
     DO UPDATE SET status = 'active', learner_id = $4, updated_at = NOW()
     RETURNING *`,
    [product_id, learner_email, learnerName, learnerId],
  )

  return ok(rows[0], 201)
}
