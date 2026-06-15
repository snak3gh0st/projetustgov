import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  learner_name: string | null
}

type AggregateRow = {
  avg: string
  count: number
}

type MineRow = {
  rating: number
  comment: string | null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Unauthorized')

  const productId = new URL(req.url).searchParams.get('productId')
  if (!productId || !z.string().uuid().safeParse(productId).success) {
    return err(400, 'productId obrigatório')
  }

  const reviews = await query<ReviewRow>(
    `SELECT r.id, r.rating, r.comment, r.created_at, l.name AS learner_name
     FROM education_reviews r
     JOIN learners l ON l.id = r.learner_id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC LIMIT 50`,
    [productId]
  )

  const aggRows = await query<AggregateRow>(
    `SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS avg, COUNT(*)::int AS count
     FROM education_reviews WHERE product_id = $1`,
    [productId]
  )
  const aggRow = aggRows[0]

  const mineRows = await query<MineRow>(
    `SELECT rating, comment FROM education_reviews WHERE product_id = $1 AND learner_id = $2`,
    [productId, session.sub]
  )
  const mineRow = mineRows[0]

  return ok({
    reviews,
    avg: Number(aggRow.avg),
    count: aggRow.count,
    mine: mineRow ?? null,
  })
}

const upsertSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(4000).nullable().optional(),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return err(401, 'Unauthorized')

  const body = await request.json().catch(() => null)
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return err(400, parsed.error.flatten().fieldErrors)
  }

  const { productId, rating, comment } = parsed.data

  const enrolled = await query(
    `SELECT 1 FROM education_enrollments
     WHERE product_id = $1 AND learner_email = $2 AND status = 'active' LIMIT 1`,
    [productId, session.email]
  )
  if (enrolled.length === 0) {
    return err(403, 'Você precisa estar matriculado para avaliar')
  }

  await query(
    `INSERT INTO education_reviews (learner_id, product_id, rating, comment, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (learner_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()`,
    [session.sub, productId, rating, comment ?? null]
  )

  return ok({ saved: true })
}
