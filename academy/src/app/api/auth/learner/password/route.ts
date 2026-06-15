import { NextRequest } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { getSession, hashPassword, verifyPassword } from '@/lib/auth'
import { ok, err } from '@/lib/http'

const body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autenticado')

  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return err(400, parsed.error.flatten().fieldErrors)

  const { currentPassword, newPassword } = parsed.data

  const rows = await query<{ hash: string }>(
    'SELECT password_hash AS hash FROM learners WHERE id = $1',
    [session.sub],
  )
  const row = rows[0]
  if (!row) return err(404, 'Usuário não encontrado')

  const valid = await verifyPassword(currentPassword, row.hash)
  if (!valid) return err(400, 'Senha atual incorreta')

  const newHash = await hashPassword(newPassword)
  await query('UPDATE learners SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, session.sub])

  return ok({ changed: true })
}
