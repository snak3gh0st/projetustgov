import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { hashPassword, createSession } from '@/lib/auth'
import { ok, err } from '@/lib/http'

const body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { email, password, name, phone } = parsed.data
  const lower = email.toLowerCase().trim()

  const existing = await query('SELECT id FROM learners WHERE email = $1', [lower])
  if (existing.length > 0) return err(409, 'Email já cadastrado')

  const password_hash = await hashPassword(password)

  const rows = await query<{ id: string; email: string; name: string }>(
    `INSERT INTO learners (email, name, phone, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name`,
    [lower, name, phone ?? null, password_hash],
  )

  const learner = rows[0]

  await createSession({ sub: learner.id, email: learner.email, name: learner.name, role: 'learner' })

  return ok({ id: learner.id, email: learner.email, name: learner.name })
}
