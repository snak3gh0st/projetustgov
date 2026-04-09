import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const { proposta_key } = payload as { proposta_key?: string }
    if (!proposta_key || typeof proposta_key !== 'string') {
      return NextResponse.json({ error: 'proposta_key obrigatório' }, { status: 400 })
    }

    await query(
      `INSERT INTO tgov_proposta_seen (user_id, proposta_key, seen_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, proposta_key)
       DO UPDATE SET seen_at = now()`,
      [session.userId, proposta_key],
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/tgov/seen][PATCH] error:', error)
    return NextResponse.json({ error: 'Failed to mark seen' }, { status: 500 })
  }
}
