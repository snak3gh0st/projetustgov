import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// CSM-04: read-only proxy onto the commission SQL with vendedor_id pinned to session.userId.
// Intentionally narrower than /api/comissoes — strips paulo_breakdown, selected_vendedor_stats,
// per_vendedor, and vendedores_list. CSM never gets cross-seller visibility.
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canCsm(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    const dateField = 'COALESCE(vp.fechamento_at, vp.updated_at)'

    // Hardcoded scope: only this CSM's rows. NO vendedorId query-param override is honored.
    const filters: string[] = [
      'vp.vendedor_id IS NOT NULL',
      'vp.comissao_valor IS NOT NULL',
      'vp.comissao_valor > 0',
      "vp.status_contato = 'Fechado'",
    ]
    const params: unknown[] = []
    let paramIndex = 1

    // CSM-only: pin vendedor_id to the session user. No role branch.
    filters.push(`vp.vendedor_id = $${paramIndex++}`)
    params.push(session.userId)

    if (startDate) {
      filters.push(`${dateField} >= $${paramIndex++}::timestamp`)
      params.push(`${startDate} 00:00:00`)
    }
    if (endDate) {
      filters.push(`${dateField} <= $${paramIndex++}::timestamp`)
      params.push(`${endDate} 23:59:59`)
    }

    const whereClause = filters.join(' AND ')

    const [leadsRows, summaryRows] = await Promise.all([
      query(`
        SELECT
          vp.id,
          vp.cnpj,
          vp.nome,
          vp.valor_emenda,
          COALESCE(vp.valor_venda, 0) as valor_venda,
          vp.tipo_vendedor,
          vp.comissao_percentual,
          vp.comissao_valor,
          COALESCE(vp.comissao_bonus, 0) as comissao_bonus,
          vp.comissao_locked,
          COALESCE(vp.status_contato, 'Não Contatado') as status_contato,
          u.nome as vendedor_nome,
          u.role as vendedor_role,
          vp.vendedor_id,
          vp.closer_id,
          uc.nome as closer_nome,
          vp.closer_comissao_percentual,
          COALESCE(vp.closer_comissao_valor, 0) as closer_comissao_valor,
          ${dateField} as updated_at
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        LEFT JOIN users uc ON uc.id = vp.closer_id
        WHERE ${whereClause}
        ORDER BY ${dateField} DESC
      `, params),

      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj)::int as total_leads,
          COALESCE(SUM(vp.comissao_valor), 0)::numeric as total_comissao,
          COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)), 0)::numeric as total_bonus,
          COALESCE(SUM(vp.valor_venda), 0)::numeric as total_valor_venda,
          COALESCE(SUM(vp.valor_emenda), 0)::numeric as total_valor_emenda
        FROM vendedor_projetos vp
        WHERE ${whereClause}
      `, params),
    ])

    const summary = summaryRows[0] || {}

    // Comissão de gestor e Fundo Comercial são visíveis apenas para gestor — mesma regra de /api/comissoes.
    const isGestorView = session.role === 'gestor'

    const leads = leadsRows.map(lead => ({
      id: lead.id,
      cnpj: lead.cnpj,
      nome: lead.nome,
      valor_emenda: Number(lead.valor_emenda) || 0,
      valor_venda: Number(lead.valor_venda) || 0,
      tipo_vendedor: lead.tipo_vendedor,
      comissao_percentual: Number(lead.comissao_percentual) || 0,
      comissao_valor: Number(lead.comissao_valor) || 0,
      comissao_bonus: isGestorView ? (Number(lead.comissao_bonus) || 0) : 0,
      comissao_locked: Boolean(lead.comissao_locked),
      status_contato: lead.status_contato,
      vendedor_nome: lead.vendedor_nome,
      vendedor_id: lead.vendedor_id,
      closer_id: lead.closer_id || null,
      closer_nome: lead.closer_nome || null,
      closer_comissao_percentual: isGestorView ? (Number(lead.closer_comissao_percentual) || 0) : 0,
      closer_comissao_valor: isGestorView ? (Number(lead.closer_comissao_valor) || 0) : 0,
      updated_at: lead.updated_at,
    }))

    const total_bonus_corrected = leads.reduce((sum, l) => sum + (l.comissao_bonus || 0), 0)

    return NextResponse.json({
      role: session.role,
      summary: {
        total_leads: Number(summary.total_leads) || 0,
        total_comissao: Number(summary.total_comissao) || 0,
        total_bonus: total_bonus_corrected,
        total_valor_venda: Number(summary.total_valor_venda) || 0,
        total_valor_emenda: Number(summary.total_valor_emenda) || 0,
      },
      leads,
      filters_applied: {
        start_date: startDate,
        end_date: endDate,
      },
    })
  } catch (error) {
    console.error('CSM comissoes query error:', error)
    return NextResponse.json({ error: 'Failed to fetch commission data' }, { status: 500 })
  }
}
