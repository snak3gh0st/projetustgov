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

    // Check for exclude_existing parameter (for gestor assignment view)
    const excludeExisting = searchParams.get('exclude_existing')

    // Vendedor and gestor_vendedor -> only their assigned projects
    if (session.role === 'vendedor' || session.role === 'gestor_vendedor') {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(session.userId)
    } else if (vendedorId === 'unassigned') {
      conditions.push(`vp.vendedor_id IS NULL`)
    } else if (vendedorId) {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }

    // Optional filter for gestor to exclude existing clients
    if (excludeExisting === 'true' && session.role !== 'vendedor' && session.role !== 'gestor_vendedor') {
      conditions.push('ec.cnpj IS NULL')
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
      SELECT
        vp.*,
        u.nome as vendedor_nome,
        ec.cnpj IS NOT NULL as is_existing_client,
        p.cnpj IS NULL as is_max_priority,
        p.total_convenios as executed_count,
        (
          SELECT COUNT(DISTINCT vp2.nr_emenda)
          FROM vendedor_projetos vp2
          WHERE vp2.cnpj = vp.cnpj
        ) as emenda_count,
        (
          SELECT SUM(vp2.valor_emenda)
          FROM vendedor_projetos vp2
          WHERE vp2.cnpj = vp.cnpj
        ) as total_valor_emendas
      FROM vendedor_projetos vp
      LEFT JOIN users u ON vp.vendedor_id = u.id
      LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj
      LEFT JOIN proponentes p ON vp.cnpj = p.cnpj
      WHERE ${conditions.join(' AND ')}
      ORDER BY vp.cnpj, vp.valor_emenda DESC NULLS LAST
      LIMIT $${paramIndex}
    `, params)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Leads query error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}
