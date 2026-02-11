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

    // Only gestor can list vendedores
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query(
      `SELECT id, nome, email, active FROM users WHERE role = 'vendedor' ORDER BY nome ASC`
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Vendedores query error:', error)
    return NextResponse.json({ error: 'Failed to fetch vendedores' }, { status: 500 })
  }
}
