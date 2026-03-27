import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vendedorIdParam = searchParams.get('vendedor_id')

    // Determine effective vendedor filter:
    // - vendedor role: always filtered to own CNPJs
    // - gestor/coordenador/visualizador: optionally filter by vendedor_id param
    const isVendedor = session.role === 'vendedor'
    const effectiveVendedorId = isVendedor
      ? session.userId
      : vendedorIdParam || null

    // Build reusable filter fragments
    // pe.cnpj is VARCHAR(14) digits-only; vp.cnpj may have punctuation
    const vendedorExistsClause = effectiveVendedorId
      ? `EXISTS (
          SELECT 1 FROM vendedor_projetos vp_f
          WHERE REGEXP_REPLACE(vp_f.cnpj, '[^0-9]', '', 'g') = pe.cnpj
            AND vp_f.vendedor_id = $1
        )`
      : null

    const vendedorExistsClauseVp = effectiveVendedorId
      ? 'AND vp.vendedor_id = $1'
      : ''

    const baseParams: unknown[] = effectiveVendedorId ? [effectiveVendedorId] : []

    const [
      kpiTotalsRows,
      kpiNaoContatadoRows,
      kpiTelefonesRows,
      pipelineFunnelRows,
      cnpjsByVendedorRows,
      cnpjsByUfRows,
      activityTrendRows,
    ] = await Promise.all([

      // 1. KPI: totals from projetos_execucao
      query(`
        SELECT
          COUNT(DISTINCT pe.cnpj)::int AS total_cnpjs,
          COALESCE(SUM(pe.valor_global), 0) AS total_valor_global,
          COALESCE(SUM(pe.saldo_conta), 0) AS total_saldo,
          COALESCE(SUM(pe.valor_desembolsado), 0) AS total_desembolsado,
          CASE
            WHEN SUM(pe.valor_global) > 0
            THEN ROUND(
              SUM(pe.pct_execucao * pe.valor_global) / NULLIF(SUM(CASE WHEN pe.pct_execucao IS NOT NULL THEN pe.valor_global ELSE 0 END), 0),
              2
            )
            ELSE NULL
          END AS pct_execucao_medio,
          COUNT(*) FILTER (WHERE pe.valor_desembolsado = 0)::int AS total_alertas
        FROM projetos_execucao pe
        ${vendedorExistsClause ? `WHERE ${vendedorExistsClause}` : ''}
      `, baseParams),

      // 2. KPI: nao contatados (status_contato_execucao from vendedor_projetos, only CNPJs in projetos_execucao)
      query(`
        SELECT
          COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')) FILTER (
            WHERE COALESCE(vp.status_contato_execucao, 'Não Contatado') IN ('Não Contatado', 'Nao Contatado')
          )::int AS nao_contatado_count
        FROM vendedor_projetos vp
        WHERE EXISTS (
          SELECT 1 FROM projetos_execucao pe
          WHERE pe.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
        )
        ${vendedorExistsClauseVp}
      `, baseParams),

      // 3. KPI: telefones (from lead_contacts where CNPJ exists in projetos_execucao)
      query(`
        SELECT
          COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'valido')::int AS telefones_validos,
          COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'invalido')::int AS telefones_invalidos
        FROM lead_contacts lc
        WHERE EXISTS (
          SELECT 1 FROM projetos_execucao pe
          WHERE pe.cnpj = REGEXP_REPLACE(lc.lead_cnpj, '[^0-9]', '', 'g')
        )
        ${effectiveVendedorId ? `AND EXISTS (
          SELECT 1 FROM vendedor_projetos vp
          WHERE vp.cnpj = lc.lead_cnpj
            AND vp.vendedor_id = $1
        )` : ''}
      `, baseParams),

      // 4. Pipeline funnel: group by status_contato_execucao, only CNPJs in projetos_execucao
      query(`
        SELECT * FROM (
          SELECT
            CASE
              WHEN COALESCE(vp.status_contato_execucao, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
              ELSE COALESCE(vp.status_contato_execucao, 'Não Contatado')
            END AS status,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))::int AS count
          FROM vendedor_projetos vp
          WHERE EXISTS (
            SELECT 1 FROM projetos_execucao pe
            WHERE pe.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
          )
          ${vendedorExistsClauseVp}
          GROUP BY 1
        ) funnel
        ORDER BY
          CASE status
            WHEN 'Não Contatado' THEN 1
            WHEN 'Ainda Não' THEN 2
            WHEN 'Retorno' THEN 3
            WHEN 'Quente' THEN 4
            WHEN 'Muito Quente' THEN 5
            WHEN 'Proposta' THEN 6
            WHEN 'Aguardando Closer' THEN 7
            WHEN 'Telefone Invalido' THEN 8
            WHEN 'Fechado' THEN 9
            ELSE 10
          END
      `, baseParams),

      // 5. CNPJs by vendedor: join vendedor_projetos with projetos_execucao
      query(`
        SELECT
          u.nome AS vendedor_nome,
          COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))::int AS total_cnpjs,
          COALESCE(SUM(pe_agg.valor_global), 0) AS total_valor
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        LEFT JOIN LATERAL (
          SELECT SUM(pe.valor_global) AS valor_global
          FROM projetos_execucao pe
          WHERE pe.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
        ) pe_agg ON true
        WHERE vp.vendedor_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM projetos_execucao pe
            WHERE pe.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
          )
          ${vendedorExistsClauseVp}
        GROUP BY u.nome
        ORDER BY total_cnpjs DESC
      `, baseParams),

      // 6. CNPJs by UF: from projetos_execucao, top 15
      query(`
        SELECT
          pe.uf,
          COUNT(DISTINCT pe.cnpj)::int AS count,
          COALESCE(SUM(pe.valor_global), 0) AS valor_global
        FROM projetos_execucao pe
        WHERE pe.uf IS NOT NULL AND pe.uf != ''
        ${vendedorExistsClause ? `AND ${vendedorExistsClause}` : ''}
        GROUP BY pe.uf
        ORDER BY count DESC
        LIMIT 15
      `, baseParams),

      // 7. Activity trend: from contact_notes where lead_cnpj exists in projetos_execucao, last 6 months
      effectiveVendedorId
        ? query(`
          SELECT
            DATE_TRUNC('month', cn.created_at)::date AS month,
            COUNT(*)::int AS total_notes,
            COUNT(DISTINCT cn.lead_cnpj)::int AS unique_leads
          FROM contact_notes cn
          WHERE cn.created_at >= NOW() - INTERVAL '6 months'
            AND EXISTS (
              SELECT 1 FROM projetos_execucao pe
              WHERE pe.cnpj = REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g')
            )
            AND EXISTS (
              SELECT 1 FROM vendedor_projetos vp
              WHERE vp.cnpj = cn.lead_cnpj
                AND vp.vendedor_id = $1
            )
          GROUP BY 1
          ORDER BY 1 ASC
        `, baseParams)
        : query(`
          SELECT
            DATE_TRUNC('month', cn.created_at)::date AS month,
            COUNT(*)::int AS total_notes,
            COUNT(DISTINCT cn.lead_cnpj)::int AS unique_leads
          FROM contact_notes cn
          WHERE cn.created_at >= NOW() - INTERVAL '6 months'
            AND EXISTS (
              SELECT 1 FROM projetos_execucao pe
              WHERE pe.cnpj = REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g')
            )
          GROUP BY 1
          ORDER BY 1 ASC
        `, []),
    ])

    const totals = kpiTotalsRows[0] || {}
    const naoContatadoRow = kpiNaoContatadoRows[0] || {}
    const telefonesRow = kpiTelefonesRows[0] || {}

    return NextResponse.json({
      role: session.role,
      kpis: {
        total_cnpjs: Number(totals.total_cnpjs) || 0,
        total_valor_global: Number(totals.total_valor_global) || 0,
        total_saldo: Number(totals.total_saldo) || 0,
        total_desembolsado: Number(totals.total_desembolsado) || 0,
        pct_execucao_medio: totals.pct_execucao_medio != null
          ? Number(totals.pct_execucao_medio)
          : null,
        total_alertas: Number(totals.total_alertas) || 0,
        nao_contatado_count: Number(naoContatadoRow.nao_contatado_count) || 0,
        telefones_validos: Number(telefonesRow.telefones_validos) || 0,
        telefones_invalidos: Number(telefonesRow.telefones_invalidos) || 0,
      },
      pipeline_funnel: pipelineFunnelRows.map((r: Record<string, unknown>) => ({
        status: r.status as string,
        count: Number(r.count),
      })),
      cnpjs_by_vendedor: cnpjsByVendedorRows.map((r: Record<string, unknown>) => ({
        vendedor_nome: r.vendedor_nome as string,
        total_cnpjs: Number(r.total_cnpjs),
        total_valor: Number(r.total_valor),
      })),
      cnpjs_by_uf: cnpjsByUfRows.map((r: Record<string, unknown>) => ({
        uf: r.uf as string,
        count: Number(r.count),
        valor_global: Number(r.valor_global),
      })),
      activity_trend: activityTrendRows.map((r: Record<string, unknown>) => ({
        month: r.month,
        total_notes: Number(r.total_notes),
        unique_leads: Number(r.unique_leads),
      })),
    })
  } catch (error) {
    console.error('[api/bi/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao BI data' }, { status: 500 })
  }
}
