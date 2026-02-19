import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query(`
      SELECT
        u.id,
        u.nome,
        u.email,
        u.role,
        u.active,
        u.created_at,
        COUNT(vp.id)::int AS lead_count
      FROM users u
      LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id
      GROUP BY u.id, u.nome, u.email, u.role, u.active, u.created_at
      ORDER BY u.nome
    `)

    const result = rows.map((row: Record<string, unknown>) => ({
      ...row,
      is_self: row.id === session.userId,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Usuarios query error:', error)
    return NextResponse.json({ error: 'Failed to fetch usuarios' }, { status: 500 })
  }
}
