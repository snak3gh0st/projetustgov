// web/src/app/api/usuarios/[id]/reset-password/route.ts
import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { sendPasswordResetEmail } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

const ALLOWED_ACTOR_ROLES = ['admin', 'gestor']

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ALLOWED_ACTOR_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params

    let payload: { password?: string }
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { password } = payload
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Senha excede 200 caracteres' }, { status: 400 })
    }

    const users = await query<{ id: string; nome: string; email: string; active: boolean }>(
      `SELECT id, nome, email, active FROM users WHERE id = $1`,
      [id],
    )
    const target = users[0]
    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, id])

    console.log('[reset-password] actor=%s target=%s', session.userId, id)

    // Fire-and-forget email
    sendPasswordResetEmail({ nome: target.nome, email: target.email, newPassword: password })
      .catch(err => console.error('[reset-password] email failed', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset-password] error', err)
    return NextResponse.json({ error: 'Falha ao resetar senha' }, { status: 500 })
  }
}
