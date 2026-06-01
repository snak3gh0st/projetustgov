import { NextResponse } from 'next/server'
import { buildStructuredLeadScopeSql } from '@/lib/crm-scope'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: Request) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gestor can filter by vendedor_id param; vendedor always sees own data
    const { searchParams } = new URL(request.url)
    const vendedorIdParam = searchParams.get('vendedor_id')
    const isVendedor = session.role === 'vendedor' || session.role === 'coordenador'
    const filterByVendedor = isVendedor ? session.userId : vendedorIdParam
    const vendedorParams = filterByVendedor ? [filterByVendedor] : []
    const approvalScopeSql = buildStructuredLeadScopeSql('vp')
    const approvalFilter = filterByVendedor
      ? `WHERE ${approvalScopeSql} AND vp.vendedor_id = $1`
      : `WHERE ${approvalScopeSql}`
    const approvalExistsForNotes = filterByVendedor
      ? `AND EXISTS (
          SELECT 1 FROM vendedor_projetos vp
          WHERE vp.cnpj = cn.lead_cnpj
            AND ${approvalScopeSql}
            AND vp.vendedor_id = $1
        )`
      : `AND EXISTS (
          SELECT 1 FROM vendedor_projetos vp
          WHERE vp.cnpj = cn.lead_cnpj
            AND ${approvalScopeSql}
        )`

    // Run all queries in parallel to avoid sequential connection queuing
    const [
      kpiMainRows,
      kpiDaysRows,
      kpiTicketRows,
      kpiActivityRows,
      kpiStaleRows,
      pipelineFunnelRows,
      commissionByVendedorRows,
      leadsByUfRows,
      activityTrendRows,
    ] = await Promise.all([

      // 1. KPI: Main metrics (conversion, pipeline, commission, contact rate) — single query
      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.status_contato = 'Fechado')::int as fechado_count,
          COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.vendedor_id IS NOT NULL)::int as assigned_count,
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE COALESCE(vp.status_contato, 'Não Contatado') IN ('Não Contatado', 'Nao Contatado')
              AND vp.vendedor_id IS NOT NULL
          )::int as nao_contatado_count,
          COALESCE(SUM(CASE WHEN vp.status_contato != 'Fechado' AND vp.vendedor_id IS NOT NULL THEN vp.valor_emenda::numeric ELSE 0 END), 0) as pipeline_value,
          COALESCE(SUM(CASE WHEN vp.status_contato = 'Fechado' THEN vp.valor_venda::numeric ELSE 0 END), 0) as closed_value,
          COALESCE(SUM(CASE WHEN vp.status_contato = 'Fechado' AND u.role != 'gestor' THEN vp.comissao_valor::numeric ELSE 0 END), 0) as commission_earned,
          COALESCE(SUM(CASE WHEN vp.status_contato = 'Fechado' AND u.role != 'gestor' THEN COALESCE(vp.comissao_bonus, 0)::numeric ELSE 0 END), 0) as commission_bonus
        FROM vendedor_projetos vp
        LEFT JOIN users u ON u.id = vp.vendedor_id
        ${approvalFilter}
      `, vendedorParams),

      // 2. KPI: Avg Days to Close
      query(`
        SELECT
          COALESCE(AVG(EXTRACT(DAY FROM (vp.updated_at - vp.created_at)))::int, NULL) as avg_days_to_close
        FROM vendedor_projetos vp
        ${approvalFilter}
          AND vp.status_contato = 'Fechado'
      `, vendedorParams),

      // 3. KPI: Ticket Medio
      query(`
        SELECT COALESCE(AVG(cnpj_avg), 0) as ticket_medio
        FROM (
          SELECT vp.cnpj, AVG(vp.valor_venda::numeric) as cnpj_avg
          FROM vendedor_projetos vp
          ${approvalFilter}
            AND vp.vendedor_id IS NOT NULL
            AND vp.status_contato = 'Fechado'
            AND vp.valor_venda > 0
          GROUP BY vp.cnpj
        ) t
      `, vendedorParams),

      // 4. KPI: Activity last 7 days (contact notes)
      query(`
        SELECT
          COUNT(*)::int as notes_7d,
          COUNT(DISTINCT cn.lead_cnpj)::int as leads_touched_7d
        FROM contact_notes cn
        WHERE cn.created_at >= NOW() - INTERVAL '7 days'
        ${approvalExistsForNotes}
      `, vendedorParams),

      // 5. KPI: Stale leads (assigned, not Fechado, no activity in 7+ days)
      query(`
        SELECT COUNT(DISTINCT vp.cnpj)::int as stale_count
        FROM vendedor_projetos vp
        ${approvalFilter}
          AND vp.vendedor_id IS NOT NULL
          AND vp.status_contato NOT IN ('Fechado', 'Telefone Invalido')
          AND NOT EXISTS (
            SELECT 1 FROM contact_notes cn
            WHERE cn.lead_cnpj = vp.cnpj AND cn.created_at >= NOW() - INTERVAL '7 days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM vendedor_projetos vp2
            WHERE vp2.cnpj = vp.cnpj
              AND ${buildStructuredLeadScopeSql('vp2')}
              AND vp2.status_contato NOT IN ('Não Contatado', 'Nao Contatado')
              AND vp2.updated_at >= NOW() - INTERVAL '7 days'
          )
      `, vendedorParams),

      // 8. Chart: Pipeline Funnel — all 6 statuses in correct funnel order
      query(`
        SELECT * FROM (
          SELECT
            CASE
              WHEN COALESCE(vp.status_contato, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
              WHEN vp.status_contato IN ('Ainda Não', 'Sem Interesse') THEN 'Sem Interesse'
              WHEN vp.status_contato IN ('Retorno', 'Em Atendimento') THEN 'Em Atendimento'
              WHEN vp.status_contato = 'Quente' THEN 'Quente'
              WHEN vp.status_contato = 'Muito Quente' THEN 'Muito Quente'
              WHEN vp.status_contato IN ('Proposta', 'Proposta Enviada') THEN 'Proposta Enviada'
              WHEN vp.status_contato IN ('Aguardando Closer', 'Em Aprovação') THEN 'Em Aprovação'
              WHEN vp.status_contato = 'Fechado' THEN 'Fechado'
              ELSE vp.status_contato
            END as status,
            COUNT(DISTINCT vp.cnpj)::int as count
          FROM vendedor_projetos vp
          ${approvalFilter}
            AND vp.vendedor_id IS NOT NULL
          GROUP BY 1
        ) funnel
        ORDER BY
          CASE status
            WHEN 'Não Contatado' THEN 1
            WHEN 'Sem Interesse' THEN 2
            WHEN 'Em Atendimento' THEN 3
            WHEN 'Quente' THEN 4
            WHEN 'Muito Quente' THEN 5
            WHEN 'Proposta Enviada' THEN 6
            WHEN 'Em Aprovação' THEN 7
            WHEN 'Fechado' THEN 8
            ELSE 9
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
        ${approvalFilter}
          AND vp.vendedor_id IS NOT NULL
          AND u.role != 'gestor'
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
        ${approvalFilter}
          AND vp.uf IS NOT NULL AND vp.uf != ''
        GROUP BY vp.uf
        ORDER BY count DESC
        LIMIT 15
      `, vendedorParams),

      // 11. Chart: Activity Trend (last 6 months from contact_notes)
      // Use EXISTS subquery instead of JOIN to avoid multiplying rows when a CNPJ
      // has multiple entries in vendedor_projetos (one per emenda/programa)
      filterByVendedor
        ? query(`
          SELECT
            DATE_TRUNC('month', cn.created_at)::date as month,
            COUNT(*)::int as total_notes,
            COUNT(DISTINCT cn.lead_cnpj)::int as unique_leads
          FROM contact_notes cn
          WHERE cn.created_at >= NOW() - INTERVAL '6 months'
            ${approvalExistsForNotes}
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

    const m = kpiMainRows[0] || {}
    const fechadoCount = Number(m.fechado_count) || 0
    const assignedCount = Number(m.assigned_count) || 0
    const naoContatadoCount = Number(m.nao_contatado_count) || 0
    const contatadoCount = assignedCount - naoContatadoCount
    const conversionRate = assignedCount > 0 ? Number(((fechadoCount / assignedCount) * 100).toFixed(1)) : 0
    const contactRate = assignedCount > 0 ? Number(((contatadoCount / assignedCount) * 100).toFixed(1)) : 0

    const daysRow = kpiDaysRows[0] || {}
    const ticketRow = kpiTicketRows[0] || {}
    const actRow = kpiActivityRows[0] || {}
    const staleRow = kpiStaleRows[0] || {}

    return NextResponse.json({
      role: session.role,
      kpis: {
        closed_value: Number(m.closed_value) || 0,
        conversion_rate: conversionRate,
        fechado_count: fechadoCount,
        assigned_count: assignedCount,
        contact_rate: contactRate,
        nao_contatado_count: naoContatadoCount,
        ticket_medio: Number(ticketRow.ticket_medio) || 0,
        avg_days_to_close: daysRow.avg_days_to_close != null ? Number(daysRow.avg_days_to_close) : null,
        pipeline_value: Number(m.pipeline_value) || 0,
        commission_earned: Number(m.commission_earned) || 0,
        commission_bonus: Number(m.commission_bonus) || 0,
        notes_7d: Number(actRow.notes_7d) || 0,
        leads_touched_7d: Number(actRow.leads_touched_7d) || 0,
        stale_count: Number(staleRow.stale_count) || 0,
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
