import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['vendedor', 'visualizador', 'coordenador', 'adm_produto'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params

    // Prevent changing own role
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

    if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json(
        { error: `Role invalido. Valores permitidos: ${ALLOWED_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    // Check target user exists and is not a gestor
    const targetRows = await query(`SELECT id, role FROM users WHERE id = $1`, [id])
    if (targetRows.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 })
    }
    if (targetRows[0].role === 'gestor') {
      return NextResponse.json({ error: 'Nao e possivel alterar o cargo de um gestor' }, { status: 403 })
    }

    // Update role
    const updated = await query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, nome, email, role, active, created_at`,
      [role as AllowedRole, id]
    )

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
