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

    const rows = await query(`
      SELECT u.id, u.nome, u.email, u.active, COUNT(DISTINCT vp.cnpj)::int as lead_count
      FROM users u
      LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id
      WHERE u.role IN ('vendedor', 'gestor_vendedor') AND u.active = true
      GROUP BY u.id, u.nome, u.email, u.active
      ORDER BY u.nome
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Vendedores query error:', error)
    return NextResponse.json({ error: 'Failed to fetch vendedores' }, { status: 500 })
  }
}
