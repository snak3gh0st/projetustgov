import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, ROLE_CAN_CREATE, canManageRole, type Role } from '@/lib/dal'

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

    const actorRole = session.role as Role
    const creatableRoles = ROLE_CAN_CREATE[actorRole] ?? []

    if (creatableRoles.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params

    if (session.userId === id) {
      return NextResponse.json({ error: 'Nao e possivel alterar o proprio cargo' }, { status: 403 })
    }

    let body: { role?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { role } = body

    if (!role || !creatableRoles.includes(role as Role)) {
      return NextResponse.json(
        { error: `Role invalido. Valores permitidos: ${creatableRoles.join(', ')}` },
        { status: 400 }
      )
    }

    const targetRows = await query(`SELECT id, role FROM users WHERE id = $1`, [id])
    if (targetRows.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
    }

    const targetRole = targetRows[0].role as Role

    if (targetRole === 'gestor') {
      return NextResponse.json({ error: 'Nao e possivel alterar o cargo de um gestor' }, { status: 403 })
    }

    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json({ error: 'Sem permissao para alterar este cargo' }, { status: 403 })
    }

    const updated = await query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, nome, email, role, active, created_at`,
      [role, id]
    )

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
