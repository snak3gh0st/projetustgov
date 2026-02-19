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

    const isVendedor = session.role === 'vendedor' || session.role === 'gestor_vendedor'
    const vendedorFilter = isVendedor ? ' WHERE vp.vendedor_id = $1' : ''
    const vendedorParams = isVendedor ? [session.userId] : []
    const assignedFilter = isVendedor ? ' AND vp.vendedor_id = $1' : ' AND vp.vendedor_id IS NOT NULL'

    // Run all queries in parallel to avoid sequential connection queuing
    const [
      kpiConversionRows,
      kpiDaysRows,
      kpiPipelineRows,
      kpiCommissionRows,
      pipelineFunnelRows,
      commissionByVendedorRows,
      leadsByUfRows,
      activityTrendRows,
    ] = await Promise.all([

      // 1. KPI: Conversion Rate
      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.status_contato = 'Fechado')::int as fechado_count,
          COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.vendedor_id IS NOT NULL)::int as assigned_count
        FROM vendedor_projetos vp
        ${vendedorFilter}
      `, vendedorParams),

      // 2. KPI: Avg Days to Close
      query(`
        SELECT
          COALESCE(
            AVG(EXTRACT(DAY FROM (vp.updated_at - vp.created_at)))::int,
            NULL
          ) as avg_days_to_close
        FROM vendedor_projetos vp
        WHERE vp.status_contato = 'Fechado'
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
      `, vendedorParams),

      // 3. KPI: Total Pipeline Value (non-Fechado assigned) + Closed Value
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN vp.status_contato != 'Fechado' THEN vp.valor_emenda::numeric ELSE 0 END), 0) as pipeline_value,
          COALESCE(SUM(CASE WHEN vp.status_contato = 'Fechado' THEN vp.valor_venda::numeric ELSE 0 END), 0) as closed_value
        FROM vendedor_projetos vp
        WHERE vp.vendedor_id IS NOT NULL
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
      `, vendedorParams),

      // 4. KPI: Commission Earned (Fechado only)
      query(`
        SELECT
          COALESCE(SUM(vp.comissao_valor::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as commission_earned,
          COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as commission_bonus
        FROM vendedor_projetos vp
        WHERE vp.vendedor_id IS NOT NULL
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
      `, vendedorParams),

      // 5. Chart: Pipeline Funnel — status counts for assigned leads
      // Wrapped in subquery so ORDER BY can reference the computed 'status' column
      // (PostgreSQL disallows referencing raw vp.status_contato in ORDER BY after GROUP BY)
      query(`
        SELECT * FROM (
          SELECT
            CASE
              WHEN COALESCE(vp.status_contato, 'Nao Contatado') IN ('Nao Contatado', 'Não Contatado', 'Novo', 'Contactado') THEN 'Nao Contatado'
              ELSE vp.status_contato
            END as status,
            COUNT(DISTINCT vp.cnpj)::int as count
          FROM vendedor_projetos vp
          WHERE vp.vendedor_id IS NOT NULL
          ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
          GROUP BY 1
        ) funnel
        ORDER BY
          CASE status
            WHEN 'Nao Contatado' THEN 1
            WHEN 'Retorno' THEN 2
            WHEN 'Proposta' THEN 3
            WHEN 'Fechado' THEN 4
            ELSE 5
          END
      `, vendedorParams),
      // 6. Chart: Commission by Vendedor (Fechado leads only)
      query(`
        SELECT
          u.nome as vendedor_nome,
          COALESCE(SUM(vp.comissao_valor::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as total_comissao,
          COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as total_bonus
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
        GROUP BY u.nome
        HAVING COUNT(*) FILTER (WHERE vp.status_contato = 'Fechado') > 0
        ORDER BY total_comissao DESC
      `, vendedorParams),

      // 7. Chart: Leads by UF (top 15)
      query(`
        SELECT
          vp.uf,
          COUNT(DISTINCT vp.cnpj)::int as count,
          COALESCE(SUM(vp.valor_emenda::numeric), 0) as valor_emenda
        FROM vendedor_projetos vp
        WHERE vp.uf IS NOT NULL AND vp.uf != ''
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
        GROUP BY vp.uf
        ORDER BY count DESC
        LIMIT 15
      `, vendedorParams),

      // 8. Chart: Activity Trend (last 6 months from contact_notes)
      // Use EXISTS subquery instead of JOIN to avoid multiplying rows when a CNPJ
      // has multiple entries in vendedor_projetos (one per emenda/programa)
      isVendedor
        ? query(`
          SELECT
            DATE_TRUNC('month', cn.created_at)::date as month,
            COUNT(*)::int as total_notes,
            COUNT(DISTINCT cn.lead_cnpj)::int as unique_leads
          FROM contact_notes cn
          WHERE cn.created_at >= NOW() - INTERVAL '6 months'
            AND EXISTS (
              SELECT 1 FROM vendedor_projetos vp
              WHERE vp.cnpj = cn.lead_cnpj
                AND vp.vendedor_id = $1
            )
          GROUP BY 1
          ORDER BY 1 ASC
        `, vendedorParams)
        : query(`
          SELECT
            DATE_TRUNC('month', cn.created_at)::date as month,
            COUNT(*)::int as total_notes,
            COUNT(DISTINCT cn.lead_cnpj)::int as unique_leads
          FROM contact_notes cn
          WHERE cn.created_at >= NOW() - INTERVAL '6 months'
          GROUP BY 1
          ORDER BY 1 ASC
        `, []),
    ])

    const kpi = kpiConversionRows[0] || {}
    const fechadoCount = Number(kpi.fechado_count) || 0
    const assignedCount = Number(kpi.assigned_count) || 0
    const conversionRate = assignedCount > 0 ? Number(((fechadoCount / assignedCount) * 100).toFixed(1)) : 0

    const daysRow = kpiDaysRows[0] || {}
    const avgDaysToClose = daysRow.avg_days_to_close != null ? Number(daysRow.avg_days_to_close) : null

    const pipelineRow = kpiPipelineRows[0] || {}
    const commissionRow = kpiCommissionRows[0] || {}

    return NextResponse.json({
      role: session.role,
      kpis: {
        conversion_rate: conversionRate,
        fechado_count: fechadoCount,
        assigned_count: assignedCount,
        avg_days_to_close: avgDaysToClose,
        pipeline_value: Number(pipelineRow.pipeline_value) || 0,
        closed_value: Number(pipelineRow.closed_value) || 0,
        commission_earned: Number(commissionRow.commission_earned) || 0,
        commission_bonus: Number(commissionRow.commission_bonus) || 0,
      },
      pipeline_funnel: pipelineFunnelRows.map(r => ({
        status: r.status as string,
        count: Number(r.count),
      })),
      commission_by_vendedor: commissionByVendedorRows.map(r => ({
        vendedor_nome: r.vendedor_nome as string,
        total_comissao: Number(r.total_comissao),
        total_bonus: Number(r.total_bonus),
      })),
      leads_by_uf: leadsByUfRows.map(r => ({
        uf: r.uf as string,
        count: Number(r.count),
        valor_emenda: Number(r.valor_emenda),
      })),
      activity_trend: activityTrendRows.map(r => ({
        month: r.month,
        total_notes: Number(r.total_notes),
        unique_leads: Number(r.unique_leads),
      })),
    })
  } catch (error) {
    console.error('BI query error:', error)
    return NextResponse.json({ error: 'Failed to fetch BI data' }, { status: 500 })
  }
}
