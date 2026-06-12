import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

const createBody = z.object({
  code: z.string().min(2).max(60).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(2).max(255),
  email: z.string().email().optional(),
  commission_rate: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
})

export async function GET() {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const rows = await query(`
    SELECT a.*,
           COUNT(ac.id)::int  AS commission_count,
           COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status = 'pending'),0)::int  AS pending_cents,
           COALESCE(SUM(ac.commission_cents) FILTER (WHERE ac.status = 'paid'),0)::int     AS paid_cents
    FROM affiliates a
    LEFT JOIN affiliate_commissions ac ON ac.affiliate_id = a.id
    WHERE a.status != 'inactive'
    GROUP BY a.id
    ORDER BY a.created_at DESC
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
    `INSERT INTO affiliates (code, name, email, commission_rate, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.code, d.name, d.email ?? null, d.commission_rate, d.notes ?? null],
  )

  return ok(rows[0], 201)
}
