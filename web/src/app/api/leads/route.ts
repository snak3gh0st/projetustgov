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
    const emExecucao = searchParams.get('em_execucao')
    const limit = searchParams.get('limit') || '10000'

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    // Check for exclude_existing parameter (for gestor assignment view)
    const excludeExisting = searchParams.get('exclude_existing')

    // vendedor -> only their assigned leads (or as closer for Aguardando Closer)
    // gestor / coordenador -> see all leads (no personal filter)
    if (session.role === 'vendedor') {
      conditions.push(`(vp.vendedor_id = $${paramIndex} OR (vp.closer_id = $${paramIndex} AND vp.status_contato = 'Aguardando Closer'))`)
      params.push(session.userId)
      paramIndex++
    } else if (vendedorId === 'unassigned') {
      conditions.push(`vp.vendedor_id IS NULL`)
    } else if (vendedorId) {
      conditions.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }

    // Optional filter for gestor to exclude existing clients
    if (excludeExisting === 'true' && session.role !== 'vendedor' && session.role !== 'coordenador') {
      conditions.push('ec.cnpj IS NULL')
    }

    if (search) {
      const searchClean = search.replace(/[.\-\/]/g, '')
      conditions.push(`(vp.nome ILIKE $${paramIndex} OR vp.cnpj LIKE $${paramIndex} OR vp.cnpj LIKE $${paramIndex + 1})`)
      params.push(`%${search}%`, `%${searchClean}%`)
      paramIndex += 2
    }

    if (statusContato && statusContato !== 'all') {
      conditions.push(`vp.status_contato = $${paramIndex++}`)
      params.push(statusContato)
    }

    if (emExecucao === 'true') {
      conditions.push(`EXISTS (SELECT 1 FROM projetos_execucao pe WHERE pe.cnpj = vp.cnpj)`)
    }

    params.push(Number(limit))

    const rows = await query(`
      SELECT
        vp.*,
        u.nome as vendedor_nome,
        uc.nome as closer_nome,
        ec.cnpj IS NOT NULL as is_existing_client,
        p.cnpj IS NULL as is_max_priority,
        p.total_convenios as executed_count,
        (
          SELECT COUNT(*)
          FROM vendedor_projetos vp2
          WHERE vp2.cnpj = vp.cnpj
        ) as emenda_count,
        (
          SELECT SUM(vp2.valor_emenda)
          FROM vendedor_projetos vp2
          WHERE vp2.cnpj = vp.cnpj
        ) as total_valor_emendas,
        (
          SELECT EXTRACT(DAY FROM NOW() - GREATEST(
            (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
            (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
             WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
          ))::int
        ) as days_since_last_contact,
        (
          SELECT lc.telefone_status
          FROM lead_contacts lc
          WHERE lc.lead_cnpj = vp.cnpj
          ORDER BY lc.principal DESC, lc.created_at ASC
          LIMIT 1
        ) as principal_telefone_status,
        COALESCE(
          (
            SELECT lc.telefone
            FROM lead_contacts lc
            WHERE lc.lead_cnpj = vp.cnpj
            ORDER BY lc.principal DESC, lc.created_at ASC
            LIMIT 1
          ),
          vp.telefone
        ) AS telefone,
        COALESCE(
          (
            SELECT lc.email
            FROM lead_contacts lc
            WHERE lc.lead_cnpj = vp.cnpj
            ORDER BY lc.principal DESC, lc.created_at ASC
            LIMIT 1
          ),
          vp.email
        ) AS email
      FROM vendedor_projetos vp
      LEFT JOIN users u ON vp.vendedor_id = u.id
      LEFT JOIN users uc ON vp.closer_id = uc.id
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
