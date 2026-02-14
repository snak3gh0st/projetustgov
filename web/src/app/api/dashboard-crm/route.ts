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

    const isVendedor = session.role === 'vendedor'
    const vendedorFilter = isVendedor ? ' WHERE vendedor_id = $1' : ''
    const vendedorParams = isVendedor ? [session.userId] : []

    // 1. Global stats with status breakdown (Tito's 4 statuses)
    const globalRows = await query(`
      SELECT
        COUNT(*)::int as total_leads,
        COUNT(CASE WHEN vendedor_id IS NOT NULL THEN 1 END)::int as total_assigned,
        COUNT(CASE WHEN vendedor_id IS NULL THEN 1 END)::int as total_unassigned,
        COALESCE(SUM(valor_emenda::numeric), 0) as total_valor_emenda,
        SUM(CASE WHEN COALESCE(status_contato, 'Não Contatado') IN ('Não Contatado', 'Novo', 'Contactado') THEN 1 ELSE 0 END)::int as status_nao_contatado,
        SUM(CASE WHEN status_contato = 'Retorno' THEN 1 ELSE 0 END)::int as status_retorno,
        SUM(CASE WHEN status_contato = 'Proposta' THEN 1 ELSE 0 END)::int as status_proposta,
        SUM(CASE WHEN status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as status_fechado
      FROM vendedor_projetos${vendedorFilter}
    `, vendedorParams)

    const g = globalRows[0] || {}

    // 2. Per-vendedor aggregations
    const vendedorRows = await query(`
      SELECT
        vp.vendedor_id,
        u.nome as vendedor_nome,
        COUNT(*)::int as total_leads,
        SUM(CASE WHEN COALESCE(vp.status_contato, 'Não Contatado') IN ('Não Contatado', 'Novo', 'Contactado') THEN 1 ELSE 0 END)::int as nao_contatado,
        SUM(CASE WHEN vp.status_contato = 'Retorno' THEN 1 ELSE 0 END)::int as retorno,
        SUM(CASE WHEN vp.status_contato = 'Proposta' THEN 1 ELSE 0 END)::int as proposta,
        SUM(CASE WHEN vp.status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as fechado,
        COALESCE(SUM(vp.valor_emenda::numeric), 0) as valor_total_emenda,
        COALESCE(SUM(vp.comissao_valor::numeric), 0) as comissao_total,
        MAX(vp.updated_at) as last_activity
      FROM vendedor_projetos vp
      JOIN users u ON u.id = vp.vendedor_id
      WHERE vp.vendedor_id IS NOT NULL${isVendedor ? ' AND vp.vendedor_id = $1' : ''}
      GROUP BY vp.vendedor_id, u.nome
      ORDER BY total_leads DESC
    `, vendedorParams)

    // 3. Today's activity per vendedor (status changes today)
    const todayRows = await query(`
      SELECT
        vp.vendedor_id,
        SUM(CASE WHEN vp.status_contato = 'Retorno' THEN 1 ELSE 0 END)::int as ligacoes_hoje,
        SUM(CASE WHEN vp.status_contato = 'Proposta' THEN 1 ELSE 0 END)::int as propostas_hoje,
        SUM(CASE WHEN vp.status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as fechados_hoje
      FROM vendedor_projetos vp
      WHERE vp.vendedor_id IS NOT NULL
        AND vp.updated_at >= CURRENT_DATE
        AND vp.status_contato IN ('Retorno', 'Proposta', 'Fechado')${isVendedor ? ' AND vp.vendedor_id = $1' : ''}
      GROUP BY vp.vendedor_id
    `, vendedorParams)
    const todayByVendedor = new Map<string, { ligacoes: number; propostas: number; fechados: number }>()
    for (const t of todayRows) {
      todayByVendedor.set(t.vendedor_id as string, {
        ligacoes: Number(t.ligacoes_hoje),
        propostas: Number(t.propostas_hoje),
        fechados: Number(t.fechados_hoje),
      })
    }

    // 4. Recent activity (last 10 updates)
    const recentRows = await query(`
      SELECT
        vp.cnpj,
        vp.nome,
        COALESCE(u.nome, 'Sem vendedor') as vendedor_nome,
        COALESCE(vp.status_contato, 'Não Contatado') as status_contato,
        vp.updated_at
      FROM vendedor_projetos vp
      LEFT JOIN users u ON u.id = vp.vendedor_id
      WHERE vp.updated_at IS NOT NULL${isVendedor ? ' AND vp.vendedor_id = $1' : ''}
      ORDER BY vp.updated_at DESC
      LIMIT 10
    `, vendedorParams)

    // 5. Commission breakdown by status
    const commissionRows = await query(`
      SELECT
        COALESCE(vp.status_contato, 'Nao Contatado') as status_contato,
        COUNT(*)::int as count,
        SUM(vp.comissao_valor)::numeric as total_comissao,
        SUM(vp.valor_venda)::numeric as total_venda,
        SUM(CASE WHEN vp.comissao_locked = true THEN 1 ELSE 0 END)::int as locked_count
      FROM vendedor_projetos vp
      WHERE vp.vendedor_id IS NOT NULL
        AND vp.comissao_valor IS NOT NULL
        AND vp.comissao_valor > 0
        ${isVendedor ? ' AND vp.vendedor_id = $1' : ''}
      GROUP BY vp.status_contato
      ORDER BY
        CASE vp.status_contato
          WHEN 'Fechado' THEN 1
          WHEN 'Proposta' THEN 2
          WHEN 'Retorno' THEN 3
          WHEN 'Nao Contatado' THEN 4
        END
    `, vendedorParams)

    return NextResponse.json({
      role: session.role,
      global: {
        total_leads: Number(g.total_leads) || 0,
        total_assigned: Number(g.total_assigned) || 0,
        total_unassigned: Number(g.total_unassigned) || 0,
        total_valor_emenda: Number(g.total_valor_emenda) || 0,
        by_status: {
          'Não Contatado': Number(g.status_nao_contatado) || 0,
          'Retorno': Number(g.status_retorno) || 0,
          'Proposta': Number(g.status_proposta) || 0,
          'Fechado': Number(g.status_fechado) || 0,
        },
      },
      vendedores: vendedorRows.map((v: Record<string, unknown>) => {
        const today = todayByVendedor.get(v.vendedor_id as string)
        return {
          vendedor_id: v.vendedor_id,
          vendedor_nome: v.vendedor_nome,
          total_leads: Number(v.total_leads),
          nao_contatado: Number(v.nao_contatado),
          retorno: Number(v.retorno),
          proposta: Number(v.proposta),
          fechado: Number(v.fechado),
          valor_total_emenda: Number(v.valor_total_emenda),
          comissao_total: Number(v.comissao_total),
          last_activity: v.last_activity,
          ligacoes_hoje: today?.ligacoes || 0,
          propostas_hoje: today?.propostas || 0,
          fechados_hoje: today?.fechados || 0,
        }
      }),
      recent_activity: recentRows.map((r: Record<string, unknown>) => ({
        cnpj: r.cnpj,
        nome: r.nome,
        vendedor_nome: r.vendedor_nome,
        status_contato: r.status_contato,
        updated_at: r.updated_at,
      })),
      commission_breakdown: commissionRows.map(r => ({
        status_contato: r.status_contato,
        count: Number(r.count),
        total_comissao: Number(r.total_comissao) || 0,
        total_venda: Number(r.total_venda) || 0,
        locked_count: Number(r.locked_count) || 0,
      })),
    })
  } catch (error) {
    console.error('Dashboard CRM query error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
