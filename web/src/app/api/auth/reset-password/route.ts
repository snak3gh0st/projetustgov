import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    let body: { token?: string; password?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { token, password } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    }
    if (password.length > 200) {
      return NextResponse.json({ error: 'Senha excede 200 caracteres' }, { status: 400 })
    }

    const rows = await query<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1`,
      [token],
    )

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 400 })
    }
    if (row.used_at) {
      return NextResponse.json({ error: 'Este link já foi utilizado' }, { status: 400 })
    }
    if (new Date() > new Date(row.expires_at)) {
      return NextResponse.json({ error: 'Link expirado. Solicite um novo.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, row.user_id])
    await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset-password] error', err)
    return NextResponse.json({ error: 'Falha ao redefinir senha' }, { status: 500 })
  }
}
