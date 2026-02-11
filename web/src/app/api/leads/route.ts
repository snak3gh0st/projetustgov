import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vendedorId = searchParams.get('vendedor_id')
    const search = searchParams.get('search')
    const statusContato = searchParams.get('status_contato')
    const limit = searchParams.get('limit') || '10000'

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    // Vendedor role -> only their projects
    if (session.role === 'vendedor') {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(session.userId)
    } else if (vendedorId) {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }

    if (search) {
      conditions.push(`(vp.nome ILIKE $${paramIndex} OR vp.cnpj LIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (statusContato && statusContato !== 'all') {
      conditions.push(`vp.status_contato = $${paramIndex++}`)
      params.push(statusContato)
    }

    params.push(Number(limit))

    const rows = await query(`
      SELECT vp.*, u.nome as vendedor_nome
      FROM vendedor_projetos vp
      LEFT JOIN users u ON vp.vendedor_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY vp.cnpj, vp.valor_global DESC NULLS LAST
      LIMIT $${paramIndex}
    `, params)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Leads query error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}
