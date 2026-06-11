import { NextRequest } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { verifyPassword, createAdminSession } from '@/lib/auth'
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

  const rows = await query<{ id: string; email: string; name: string; password: string; role: string }>(
    `SELECT id, email, name, password, role FROM users
     WHERE email = $1 AND role IN ('admin', 'gestor')`,
    [lower],
  )

  const user = rows[0]
  if (!user) return err(401, 'Acesso não autorizado')

  const valid = await verifyPassword(password, user.password)
  if (!valid) return err(401, 'Acesso não autorizado')

  await createAdminSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'admin' | 'gestor',
  })

  return ok({ id: user.id, email: user.email, name: user.name, role: user.role })
}
