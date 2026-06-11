import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { ok, err } from '@/lib/http'

const body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, 'Credenciais inválidas')

  const { email, password } = parsed.data
  const lower = email.toLowerCase().trim()

  const rows = await query<{ id: string; email: string; name: string; password_hash: string; status: string }>(
    'SELECT id, email, name, password_hash, status FROM learners WHERE email = $1',
    [lower],
  )

  const learner = rows[0]
  if (!learner || learner.status !== 'active') return err(401, 'Credenciais inválidas')

  const valid = await verifyPassword(password, learner.password_hash)
  if (!valid) return err(401, 'Credenciais inválidas')

  await query('UPDATE learners SET last_login_at = NOW() WHERE id = $1', [learner.id])

  await createSession({ sub: learner.id, email: learner.email, name: learner.name, role: 'learner' })

  return ok({ id: learner.id, email: learner.email, name: learner.name })
}
