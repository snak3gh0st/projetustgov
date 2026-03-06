import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isVendedor = session.role === 'vendedor' || session.role === 'coordenador'
    const vendedorFilter = isVendedor ? ' WHERE vp.vendedor_id = $1' : ''
    const vendedorParams = isVendedor ? [session.userId] : []
    const assignedFilter = isVendedor ? ' AND vp.vendedor_id = $1' : ' AND vp.vendedor_id IS NOT NULL'

    // Run all queries in parallel to avoid sequential connection queuing
    const [
      kpiConversionRows,
      kpiDaysRows,
      kpiPipelineRows,
      kpiCommissionRows,
      kpiTicketRows,
      kpiNaoContatadoRows,
      kpiTelefonesRows,
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
      // NOTE: fechado_em column does not exist in vendedor_projetos schema.
      // Using updated_at as a proxy for close date, filtered to Fechado rows only.
      // This measures days from lead import to last update — not exact close date.
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

      // 4. KPI: Commission Earned (Fechado only, excluding gestor-role users)
      query(`
        SELECT
          COALESCE(SUM(vp.comissao_valor::numeric) FILTER (
            WHERE vp.status_contato = 'Fechado' AND u.role != 'gestor'
          ), 0) as commission_earned,
          COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)::numeric) FILTER (
            WHERE vp.status_contato = 'Fechado' AND u.role != 'gestor'
          ), 0) as commission_bonus
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
        ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
      `, vendedorParams),

      // 5. KPI: Ticket Medio (avg per-CNPJ first, then avg across CNPJs to avoid multi-emenda inflation)
      query(`
        SELECT
          COALESCE(AVG(cnpj_avg), 0) as ticket_medio,
          COUNT(*)::int as ticket_count
        FROM (
          SELECT vp.cnpj, AVG(vp.valor_venda::numeric) as cnpj_avg
          FROM vendedor_projetos vp
          WHERE vp.vendedor_id IS NOT NULL
            AND vp.status_contato = 'Fechado'
            AND vp.valor_venda > 0
            ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
          GROUP BY vp.cnpj
        ) t
      `, vendedorParams),

      // 6. KPI: Leads sem contato (Não Contatado + Ainda Não)
      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE COALESCE(vp.status_contato, 'Não Contatado') IN ('Não Contatado', 'Nao Contatado')
              AND vp.vendedor_id IS NOT NULL
          )::int as nao_contatado_count,
          COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' AND vp.vendedor_id IS NOT NULL THEN vp.cnpj END)::int as ainda_nao_count
        FROM vendedor_projetos vp
        ${vendedorFilter}
      `, vendedorParams),

      // 7. KPI: Taxa de telefones validos
      query(`
        SELECT
          COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'valido')::int as telefones_validos,
          COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'invalido')::int as telefones_invalidos,
          COUNT(DISTINCT lc.lead_cnpj)::int as total_com_contato
        FROM lead_contacts lc
        ${isVendedor ? 'WHERE EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = lc.lead_cnpj AND vp.vendedor_id = $1)' : ''}
      `, vendedorParams),

      // 8. Chart: Pipeline Funnel — all 6 statuses in correct funnel order
      query(`
        SELECT * FROM (
          SELECT
            CASE
              WHEN COALESCE(vp.status_contato, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
              WHEN vp.status_contato = 'Ainda Não' THEN 'Ainda Não'
              WHEN vp.status_contato = 'Retorno' THEN 'Retorno'
              WHEN vp.status_contato = 'Proposta' THEN 'Proposta'
              WHEN vp.status_contato = 'Aguardando Closer' THEN 'Aguardando Closer'
              WHEN vp.status_contato = 'Fechado' THEN 'Fechado'
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
            WHEN 'Não Contatado' THEN 1
            WHEN 'Ainda Não' THEN 2
            WHEN 'Retorno' THEN 3
            WHEN 'Proposta' THEN 4
            WHEN 'Aguardando Closer' THEN 5
            WHEN 'Fechado' THEN 6
            ELSE 7
          END
      `, vendedorParams),

      // 9. Chart: Commission by Vendedor (Fechado leads only, gestor excluded)
      query(`
        SELECT
          u.nome as vendedor_nome,
          COALESCE(SUM(vp.comissao_valor::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as total_comissao,
          COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)::numeric) FILTER (WHERE vp.status_contato = 'Fechado'), 0) as total_bonus
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
          AND u.role != 'gestor'
          ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
        GROUP BY u.nome
        HAVING COUNT(*) FILTER (WHERE vp.status_contato = 'Fechado') > 0
        ORDER BY total_comissao DESC
      `, vendedorParams),

      // 10. Chart: Leads by UF (top 15)
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

      // 11. Chart: Activity Trend (last 6 months from contact_notes)
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
    const ticketRow = kpiTicketRows[0] || {}
    const naoContatadoRow = kpiNaoContatadoRows[0] || {}
    const telefonesRow = kpiTelefonesRows[0] || {}

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
        ticket_medio: Number(ticketRow.ticket_medio) || 0,
        nao_contatado_count: Number(naoContatadoRow.nao_contatado_count) || 0,
        ainda_nao_count: Number(naoContatadoRow.ainda_nao_count) || 0,
        telefones_validos: Number(telefonesRow.telefones_validos) || 0,
        telefones_invalidos: Number(telefonesRow.telefones_invalidos) || 0,
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
