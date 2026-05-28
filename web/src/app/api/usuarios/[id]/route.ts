import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, ROLE_CAN_DELETE, type Role } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const actorRole = session.role as Role
    const targetUserId = params.id

    if (targetUserId === session.userId) {
      return NextResponse.json({ error: 'Nao pode deletar seu proprio usuario' }, { status: 400 })
    }

    const targetUser = await query('SELECT role FROM users WHERE id = $1', [targetUserId])
    if (targetUser.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
    }

    const targetRole = targetUser[0].role as Role
    const deletableRoles = ROLE_CAN_DELETE[actorRole] ?? []
    if (!deletableRoles.includes(targetRole)) {
      return NextResponse.json({ error: 'Sem permissao para deletar este usuario' }, { status: 403 })
    }

    // Soft delete preserves ownership, comments, and commission history.
    // Lead reassignment must be an explicit audited action, not a delete side effect.
    await query('UPDATE users SET active = false WHERE id = $1', [targetUserId])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete usuario error:', error)
    return NextResponse.json({ error: 'Erro ao deletar usuario' }, { status: 500 })
  }
}
