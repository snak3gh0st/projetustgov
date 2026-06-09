import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { query } from '@/lib/db'
import { sendForgotPasswordEmail } from '@/lib/email-service'

export const dynamic = 'force-dynamic'

function appUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://projetus.vercel.app'
}

export async function POST(request: Request) {
  try {
    let body: { email?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 })
    }

    const users = await query<{ id: string; nome: string; email: string }>(
      `SELECT id, nome, email FROM users WHERE LOWER(email) = $1 AND active = true`,
      [email],
    )

    if (users[0]) {
      const user = users[0]
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

      await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id])
      await query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, token, expiresAt],
      )

      const resetUrl = `${appUrl()}/redefinir-senha?token=${token}`
      sendForgotPasswordEmail({ nome: user.nome, email: user.email, resetUrl })
        .catch(err => console.error('[forgot-password] email failed', err))
    }

    // Always 200 to avoid email enumeration
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[forgot-password] error', err)
    return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 })
  }
}
