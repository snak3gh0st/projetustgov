import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGovTabResponse, TGovExecucaoTableRow, EXECUCAO_NR_PROPOSTAS, buildNrPropostaWhereClause } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * CTE that unions projetos_execucao (with financial data) and propostas
 * (without convenio yet). This ensures ALL whitelist proposals appear,
 * even if they don't have a signed convenio in projetos_execucao.
 *
 * The whitelist filter is applied INSIDE this CTE so Postgres only
 * materializes the relevant rows (~200 proposals) instead of all rows
 * from both tables. The wl CTE pre-computes all allowed cnpjs/nr_propostas
 * so the EXISTS check is efficient via hash join.
 */
const ALL_EXEC_CTE = `
  wl AS MATERIALIZED (
    SELECT nr_proposta, cnpj FROM tgov_whitelist WHERE tab IN ('ambos', 'execucao')
  ),
  all_exec AS MATERIALIZED (
    SELECT
      pe.nr_convenio,
      pe.id_proposta,
      pe.nr_proposta,
      pe.situacao,
      pe.cnpj,
      pe.nome_proponente,
      pe.valor_global,
      pe.valor_repasse,
      pe.valor_desembolsado,
      pe.saldo_conta,
      pe.valor_empenhado,
      pe.rendimento_aplicacao,
      pe.ingresso_contrapartida,
      pe.pct_execucao,
      pe.uf,
      pe.municipio,
      pe.data_assinatura,
      pe.data_inicio_vigencia,
      pe.data_fim_vigencia,
      pe.dias_em_execucao,
      pe.dias_ate_vencimento,
      pe.ano_referencia,
      pe.dia_limite_prest_contas,
      pe.dias_prest_contas
    FROM projetos_execucao pe
    WHERE pe.nr_proposta IS NOT NULL
      AND (
        {NR_PROPOSTA_CLAUSE}
        OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = pe.cnpj OR wl.nr_proposta = pe.nr_proposta)
      )

    UNION ALL

    SELECT
      NULL AS nr_convenio,
      p.transfer_gov_id AS id_proposta,
      p.nr_proposta,
      p.situacao,
      p.proponente_cnpj AS cnpj,
      p.proponente AS nome_proponente,
      p.valor_global::numeric AS valor_global,
      p.valor_repasse::numeric AS valor_repasse,
      NULL AS valor_desembolsado,
      NULL AS saldo_conta,
      NULL AS valor_empenhado,
      NULL AS rendimento_aplicacao,
      NULL AS ingresso_contrapartida,
      NULL AS pct_execucao,
      p.estado AS uf,
      p.municipio,
      NULL AS data_assinatura,
      p.data_inicio_vigencia,
      p.data_fim_vigencia,
      NULL AS dias_em_execucao,
      NULL AS dias_ate_vencimento,
      NULL::int AS ano_referencia,
      NULL::date AS dia_limite_prest_contas,
      NULL::int AS dias_prest_contas
    FROM propostas p
    WHERE p.nr_proposta IS NOT NULL
      AND (
        {NR_PROPOSTA_CLAUSE_PROPOSTAS}
        OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = p.proponente_cnpj OR wl.nr_proposta = p.nr_proposta)
      )
      AND NOT EXISTS (
        SELECT 1 FROM projetos_execucao pe2
        WHERE pe2.nr_proposta = p.nr_proposta
      )
  )
`

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin' && session.role !== 'adm_produto')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const ano = searchParams.get('ano') ?? ''
    const tipo = searchParams.get('tipo') ?? 'todos'
    const status = searchParams.get('status') ?? ''
    const uf = searchParams.get('uf') ?? ''
    const proponenteFilter = searchParams.get('proponente') ?? ''
    const numeroPropostaFilter = searchParams.get('numero_proposta') ?? ''

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const offset = (page - 1) * TGOV_PAGE_SIZE

    // ---------------------------------------------------------------------------
    // Build main filter conditions (affect totals + table)
    // ---------------------------------------------------------------------------
    const params: unknown[] = []
    const mainConditions: string[] = []

    // Build nr_proposta IN clause for both branches of all_exec CTE
    const nrPropostaClausePe = buildNrPropostaWhereClause('pe.nr_proposta', params, EXECUCAO_NR_PROPOSTAS)
    // For propostas branch, same params already pushed — build clause referencing same $N params
    const nrPropostaClauseP = nrPropostaClausePe.replace(/^pe\.nr_proposta/, 'p.nr_proposta')

    if (ano) {
      params.push(parseInt(ano, 10))
      mainConditions.push(`pe.ano_referencia = $${params.length}`)
    }

    if (status) {
      params.push(status)
      mainConditions.push(`pe.situacao = $${params.length}`)
    }

    if (uf) {
      params.push(uf)
      mainConditions.push(`pe.uf = $${params.length}`)
    }

    if (tipo === 'meus_proponentes') {
      mainConditions.push(`EXISTS (
        SELECT 1 FROM vendedor_projetos vp
        WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = pe.cnpj
      )`)
    } else if (tipo === 'outros') {
      mainConditions.push(`NOT EXISTS (
        SELECT 1 FROM vendedor_projetos vp
        WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = pe.cnpj
      )`)
    }

    const mainWhere = mainConditions.length > 0 ? `WHERE ${mainConditions.join(' AND ')}` : ''

    // ---------------------------------------------------------------------------
    // Table-only additional conditions (only affect table count + data)
    // ---------------------------------------------------------------------------
    const tableAdditionalConditions: string[] = []

    if (proponenteFilter) {
      params.push(`%${proponenteFilter}%`)
      tableAdditionalConditions.push(`LOWER(pe.nome_proponente) LIKE LOWER($${params.length})`)
    }

    if (numeroPropostaFilter) {
      params.push(`%${numeroPropostaFilter}%`)
      tableAdditionalConditions.push(`(
        pe.nr_convenio LIKE $${params.length}
        OR (pe.id_proposta IS NOT NULL AND pe.id_proposta LIKE $${params.length})
        OR (pe.nr_proposta IS NOT NULL AND pe.nr_proposta LIKE $${params.length})
      )`)
    }

    const tableExtraWhere = tableAdditionalConditions.length > 0
      ? `WHERE ${tableAdditionalConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Single query — all_exec materialized once, all aggregations share it
    // ---------------------------------------------------------------------------
    type AggResult = {
      total: number
      by_status: { situacao: string; cnt: number }[] | null
      by_exec_range: { faixa: string; cnt: number }[] | null
      by_year: { ano: string; valor_global: string; cnt: number }[] | null
      by_desembolso_year: { ano: string; com_desembolso: number; sem_desembolso: number }[] | null
      table_total: number
      table_data: {
        nr_convenio: string | null
        id_proposta: string | null
        nr_proposta: string | null
        ano_instrumento: number | null
        cnpj: string
        nome_proponente: string | null
        situacao: string | null
        valor_global: string | null
        valor_repasse: string | null
        valor_desembolsado: string | null
        saldo_conta: string | null
        rendimento_aplicacao: string | null
        ingresso_contrapartida: string | null
        valor_empenhado: string | null
        pct_execucao: string | null
        uf: string | null
        municipio: string | null
        data_assinatura: string | null
        data_inicio_vigencia: string | null
        data_fim_vigencia: string | null
        dias_em_execucao: number | null
        dias_ate_vencimento: number | null
        ano_referencia: number | null
        dia_limite_prest_contas: string | null
        dias_prest_contas: number | null
        internal_status: string | null
      }[] | null
    }

    // Inject nr_proposta IN clauses into the CTE template
    const resolvedCte = ALL_EXEC_CTE
      .replace('{NR_PROPOSTA_CLAUSE}', nrPropostaClausePe)
      .replace('{NR_PROPOSTA_CLAUSE_PROPOSTAS}', nrPropostaClauseP)

    // Stats (charts) are expensive GROUP BYs — only compute on page 1.
    // On subsequent pages the charts don't change, so skip them entirely.
    const includeStats = page === 1

    const statsCtesAndSelect = includeStats
      ? `
      agg_status AS (
        SELECT json_agg(s ORDER BY s.cnt DESC) AS v FROM (
          SELECT COALESCE(situacao, 'Sem Situação') AS situacao, COUNT(*)::int AS cnt
          FROM filtered_main GROUP BY 1
        ) s
      ),
      agg_exec_range AS (
        SELECT json_agg(r ORDER BY r.ord) AS v FROM (
          SELECT
            CASE
              WHEN pct_execucao IS NULL THEN 'Sem dados'
              WHEN pct_execucao < 25 THEN '0–25%'
              WHEN pct_execucao < 50 THEN '25–50%'
              WHEN pct_execucao < 75 THEN '50–75%'
              WHEN pct_execucao < 100 THEN '75–99%'
              ELSE '100%+'
            END AS faixa,
            COUNT(*)::int AS cnt,
            MIN(COALESCE(pct_execucao, 999)) AS ord
          FROM filtered_main GROUP BY 1
        ) r
      ),
      agg_year AS (
        SELECT json_agg(y ORDER BY y.ano) AS v FROM (
          SELECT
            COALESCE(ano_referencia::text, 'N/A') AS ano,
            COALESCE(SUM(valor_global), 0)::text AS valor_global,
            COUNT(*)::int AS cnt
          FROM filtered_main GROUP BY 1
        ) y
      ),
      agg_desembolso_year AS (
        SELECT json_agg(d ORDER BY d.ano) AS v FROM (
          SELECT
            COALESCE(ano_referencia::text, 'N/A') AS ano,
            COUNT(*) FILTER (WHERE valor_desembolsado > 0)::int AS com_desembolso,
            COUNT(*) FILTER (WHERE valor_desembolsado IS NULL OR valor_desembolsado <= 0)::int AS sem_desembolso
          FROM filtered_main GROUP BY 1
        ) d
      ),`
      : ''

    const statsSelect = includeStats
      ? `(SELECT v FROM agg_status)         AS by_status,
        (SELECT v FROM agg_exec_range)      AS by_exec_range,
        (SELECT v FROM agg_year)            AS by_year,
        (SELECT v FROM agg_desembolso_year) AS by_desembolso_year,`
      : `NULL::json AS by_status,
        NULL::json AS by_exec_range,
        NULL::json AS by_year,
        NULL::json AS by_desembolso_year,`

    const result = await query<AggResult>(
      `WITH
      ${resolvedCte},
      filtered_main AS MATERIALIZED (
        SELECT pe.* FROM all_exec pe ${mainWhere}
      ),
      filtered_table AS (
        SELECT pe.* FROM filtered_main pe ${tableExtraWhere}
      ),
      agg_total AS (
        SELECT COUNT(*)::int AS v FROM filtered_main
      ),
      ${statsCtesAndSelect}
      agg_table_count AS (
        SELECT COUNT(*)::int AS v FROM filtered_table
      ),
      agg_table_data AS (
        SELECT json_agg(t) AS v FROM (
          SELECT
            pe.nr_convenio,
            pe.id_proposta,
            pe.nr_proposta,
            COALESCE(pe.ano_referencia, EXTRACT(YEAR FROM pe.data_assinatura)::int) AS ano_instrumento,
            pe.cnpj,
            COALESCE(pe.nome_proponente, '') AS nome_proponente,
            COALESCE(pe.situacao, 'Sem Situação') AS situacao,
            pe.valor_global::text,
            pe.valor_repasse::text,
            pe.valor_desembolsado::text,
            pe.saldo_conta::text,
            pe.rendimento_aplicacao::text,
            pe.ingresso_contrapartida::text,
            pe.valor_empenhado::text,
            pe.pct_execucao::text,
            pe.uf,
            pe.municipio,
            pe.data_assinatura::text,
            pe.data_inicio_vigencia::text,
            pe.data_fim_vigencia::text,
            pe.dias_em_execucao,
            pe.dias_ate_vencimento,
            pe.ano_referencia,
            pe.dia_limite_prest_contas::text,
            pe.dias_prest_contas,
            ti.status AS internal_status
          FROM filtered_table pe
          LEFT JOIN tgov_interactions ti ON ti.item_key = pe.nr_convenio AND ti.tab = 'execucao'
          ORDER BY pe.valor_global DESC NULLS LAST, pe.nr_convenio DESC NULLS LAST
          LIMIT ${TGOV_PAGE_SIZE} OFFSET ${offset}
        ) t
      )
      SELECT
        (SELECT v FROM agg_total)  AS total,
        ${statsSelect}
        (SELECT v FROM agg_table_count) AS table_total,
        (SELECT v FROM agg_table_data)  AS table_data`,
      params
    )

    const r = result[0]
    const total = Number(r?.total) || 0
    const totalTableRows = Number(r?.table_total) || 0
    const totalPages = Math.max(1, Math.ceil(totalTableRows / TGOV_PAGE_SIZE))

    const byStatusRaw = r?.by_status ?? []
    const byStatus = byStatusRaw.map((s) => {
      const count = Number(s.cnt)
      return {
        status: s.situacao ?? 'Sem Situação',
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const byExecRangeRaw = r?.by_exec_range ?? []
    const byExecRange = byExecRangeRaw.map((s) => {
      const count = Number(s.cnt)
      return {
        status: s.faixa,
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const byYear = (r?.by_year ?? []).map((y) => ({
      ano: y.ano,
      valorGlobal: parseFloat(y.valor_global) || 0,
      count: y.cnt,
    }))

    const byDesembolsoYear = (r?.by_desembolso_year ?? []).map((d) => ({
      ano: d.ano,
      comDesembolso: d.com_desembolso,
      semDesembolso: d.sem_desembolso,
    }))

    const rows: TGovExecucaoTableRow[] = (r?.table_data ?? []).map((row) => ({
      numeroProposta: row.nr_proposta || row.id_proposta || row.nr_convenio || '—',
      nrConvenio: row.nr_convenio || '',
      anoInstrumento: row.ano_instrumento,
      data: row.data_assinatura ? String(row.data_assinatura) : null,
      cnpj: row.cnpj,
      proponente: row.nome_proponente ?? '',
      situacao: row.situacao ?? 'Sem Situação',
      valorGlobal: row.valor_global ? parseFloat(row.valor_global) : null,
      valorRepasse: row.valor_repasse ? parseFloat(row.valor_repasse) : null,
      valorDesembolsado: row.valor_desembolsado ? parseFloat(row.valor_desembolsado) : null,
      saldoConta: row.saldo_conta ? parseFloat(row.saldo_conta) : null,
      rendimentoAplicacao: row.rendimento_aplicacao ? parseFloat(row.rendimento_aplicacao) : null,
      ingressoContrapartida: row.ingresso_contrapartida ? parseFloat(row.ingresso_contrapartida) : null,
      valorEmpenhado: row.valor_empenhado ? parseFloat(row.valor_empenhado) : null,
      pctExecucao: row.pct_execucao ? parseFloat(row.pct_execucao) : null,
      uf: row.uf,
      municipio: row.municipio,
      dataInicioVigencia: row.data_inicio_vigencia ? String(row.data_inicio_vigencia) : null,
      dataFimVigencia: row.data_fim_vigencia ? String(row.data_fim_vigencia) : null,
      diasEmExecucao: row.dias_em_execucao,
      diasAteVencimento: row.dias_ate_vencimento,
      anoReferencia: row.ano_referencia,
      diaLimitePrestContas: row.dia_limite_prest_contas ? String(row.dia_limite_prest_contas) : null,
      diasPrestContas: row.dias_prest_contas,
      internalStatus: row.internal_status ?? null,
    }))

    const response: TGovTabResponse & { byExecRange: typeof byExecRange; byYear: typeof byYear; byDesembolsoYear: typeof byDesembolsoYear } = {
      total,
      byStatus,
      byExecRange,
      byYear,
      byDesembolsoYear,
      table: {
        rows,
        page,
        pageSize: TGOV_PAGE_SIZE,
        totalRows: totalTableRows,
        totalPages,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[api/tgov/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch TGov execution data' }, { status: 500 })
  }
}
