import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import * as bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const password = searchParams.get('password')

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    }

    // Query user
    const users = await query(
      `SELECT id, nome, email, role, active, password_hash FROM users WHERE email = $1`,
      [email]
    )

    if (users.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'User not found',
        email
      })
    }

    const user = users[0]
    const passwordMatch = await bcrypt.compare(password, user.password_hash as string)

    return NextResponse.json({
      found: true,
      active: user.active,
      role: user.role,
      nome: user.nome,
      passwordMatch,
      hasPasswordHash: !!user.password_hash
    })
  } catch (error) {
    console.error('Debug auth error:', error)
    return NextResponse.json({
      error: 'Failed to debug auth',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
