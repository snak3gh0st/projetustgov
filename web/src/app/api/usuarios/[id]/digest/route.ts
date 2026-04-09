import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canManageRole, type Role } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Users can toggle their own digest; managers can toggle subordinates
    if (session.userId !== id) {
      const targetRows = await query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id])
      if (targetRows.length === 0) {
        return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
      }
      if (!canManageRole(session.role as Role, targetRows[0].role as Role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    let body: { enabled?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled deve ser boolean' }, { status: 400 })
    }

    await query(
      `UPDATE users SET email_digest = $1 WHERE id = $2`,
      [body.enabled, id]
    )

    return NextResponse.json({ ok: true, email_digest: body.enabled })
  } catch (error) {
    console.error('Update digest error:', error)
    return NextResponse.json({ error: 'Failed to update digest' }, { status: 500 })
  }
}
