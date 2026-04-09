import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET /api/tgov/usuarios/tecnicos
// Pool de técnicos elegíveis para designação (D2 do CONTEXT)
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query<{ id: string; nome: string; email: string; role: string }>(
      `SELECT id, nome, email, role
       FROM users
       WHERE role IN ('adm_produto', 'gestor', 'admin', 'coord_aprovacao', 'projetista')
       ORDER BY nome ASC`,
    )
    return NextResponse.json({ tecnicos: rows })
  } catch (error) {
    console.error('[api/tgov/usuarios/tecnicos][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch tecnicos' }, { status: 500 })
  }
}
