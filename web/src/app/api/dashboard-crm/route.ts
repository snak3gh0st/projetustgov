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

    // 1. Global stats with status breakdown
    const globalRows = await query(`
      SELECT
        COUNT(*)::int as total_leads,
        COUNT(CASE WHEN vendedor_id IS NOT NULL THEN 1 END)::int as total_assigned,
        COUNT(CASE WHEN vendedor_id IS NULL THEN 1 END)::int as total_unassigned,
        COALESCE(SUM(valor_emenda::numeric), 0) as total_valor_emenda,
        SUM(CASE WHEN COALESCE(status_contato, 'Novo') = 'Novo' THEN 1 ELSE 0 END)::int as status_novo,
        SUM(CASE WHEN status_contato = 'Tentativa de Contato' THEN 1 ELSE 0 END)::int as status_tentativa,
        SUM(CASE WHEN status_contato = 'Contactado' THEN 1 ELSE 0 END)::int as status_contactado,
        SUM(CASE WHEN status_contato = 'Em Negociação' THEN 1 ELSE 0 END)::int as status_negociacao,
        SUM(CASE WHEN status_contato = 'Sem Interesse' THEN 1 ELSE 0 END)::int as status_sem_interesse
      FROM vendedor_projetos
    `)

    const g = globalRows[0] || {}

    // 2. Per-vendedor aggregations
    const vendedorRows = await query(`
      SELECT
        vp.vendedor_id,
        u.nome as vendedor_nome,
        COUNT(*)::int as total_leads,
        SUM(CASE WHEN COALESCE(vp.status_contato, 'Novo') = 'Novo' THEN 1 ELSE 0 END)::int as novo,
        SUM(CASE WHEN vp.status_contato = 'Tentativa de Contato' THEN 1 ELSE 0 END)::int as tentativa,
        SUM(CASE WHEN vp.status_contato = 'Contactado' THEN 1 ELSE 0 END)::int as contactado,
        SUM(CASE WHEN vp.status_contato = 'Em Negociação' THEN 1 ELSE 0 END)::int as negociacao,
        SUM(CASE WHEN vp.status_contato = 'Sem Interesse' THEN 1 ELSE 0 END)::int as sem_interesse,
        COALESCE(SUM(vp.valor_emenda::numeric), 0) as valor_total_emenda,
        MAX(vp.updated_at) as last_activity
      FROM vendedor_projetos vp
      JOIN users u ON u.id = vp.vendedor_id
      WHERE vp.vendedor_id IS NOT NULL
      GROUP BY vp.vendedor_id, u.nome
      ORDER BY total_leads DESC
    `)

    // 3. Recent activity (last 10 updates)
    const recentRows = await query(`
      SELECT
        vp.cnpj,
        vp.nome,
        COALESCE(u.nome, 'Sem vendedor') as vendedor_nome,
        COALESCE(vp.status_contato, 'Novo') as status_contato,
        vp.updated_at
      FROM vendedor_projetos vp
      LEFT JOIN users u ON u.id = vp.vendedor_id
      WHERE vp.updated_at IS NOT NULL
      ORDER BY vp.updated_at DESC
      LIMIT 10
    `)

    return NextResponse.json({
      global: {
        total_leads: Number(g.total_leads) || 0,
        total_assigned: Number(g.total_assigned) || 0,
        total_unassigned: Number(g.total_unassigned) || 0,
        total_valor_emenda: Number(g.total_valor_emenda) || 0,
        by_status: {
          'Novo': Number(g.status_novo) || 0,
          'Tentativa de Contato': Number(g.status_tentativa) || 0,
          'Contactado': Number(g.status_contactado) || 0,
          'Em Negociação': Number(g.status_negociacao) || 0,
          'Sem Interesse': Number(g.status_sem_interesse) || 0,
        },
      },
      vendedores: vendedorRows.map((v: Record<string, unknown>) => ({
        vendedor_id: v.vendedor_id,
        vendedor_nome: v.vendedor_nome,
        total_leads: Number(v.total_leads),
        novo: Number(v.novo),
        tentativa: Number(v.tentativa),
        contactado: Number(v.contactado),
        negociacao: Number(v.negociacao),
        sem_interesse: Number(v.sem_interesse),
        valor_total_emenda: Number(v.valor_total_emenda),
        last_activity: v.last_activity,
      })),
      recent_activity: recentRows.map((r: Record<string, unknown>) => ({
        cnpj: r.cnpj,
        nome: r.nome,
        vendedor_nome: r.vendedor_nome,
        status_contato: r.status_contato,
        updated_at: r.updated_at,
      })),
    })
  } catch (error) {
    console.error('Dashboard CRM query error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
