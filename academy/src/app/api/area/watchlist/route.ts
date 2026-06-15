import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

const toggleSchema = z.object({
  productId: z.string().uuid(),
})

export async function GET() {
  const session = await getSession()
  if (!session) return err(401, 'Unauthorized')

  const rows = await query<{ product_id: string }>(
    'SELECT product_id FROM education_watchlist WHERE learner_id = $1',
    [session.sub]
  )

  return ok({ productIds: rows.map((r) => r.product_id) })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return err(401, 'Unauthorized')

  const body = await request.json().catch(() => null)
  const parsed = toggleSchema.safeParse(body)
  if (!parsed.success) {
    return err(400, parsed.error.flatten().fieldErrors)
  }

  const { productId } = parsed.data

  const existing = await query<{ id: string }>(
    'SELECT id FROM education_watchlist WHERE learner_id = $1 AND product_id = $2',
    [session.sub, productId]
  )

  if (existing.length > 0) {
    await query(
      'DELETE FROM education_watchlist WHERE learner_id = $1 AND product_id = $2',
      [session.sub, productId]
    )
    return ok({ inWatchlist: false })
  }

  await query(
    'INSERT INTO education_watchlist (learner_id, product_id) VALUES ($1, $2) ON CONFLICT (learner_id, product_id) DO NOTHING',
    [session.sub, productId]
  )
  return ok({ inWatchlist: true })
}
