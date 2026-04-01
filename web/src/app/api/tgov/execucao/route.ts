import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGovTabResponse, TGovExecucaoTableRow, EXECUCAO_NR_PROPOSTAS, buildNrPropostaWhereClause } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * CTE that unions projetos_execucao (with financial data) and propostas
 * (without convenio yet). This ensures ALL 244 whitelist proposals appear,
 * even if they don't have a signed convenio in projetos_execucao.
 */
const ALL_EXEC_CTE = `
  all_exec AS (
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
      pe.dias_ate_vencimento
    FROM projetos_execucao pe
    WHERE pe.nr_proposta IS NOT NULL

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
      NULL AS dias_ate_vencimento
    FROM propostas p
    WHERE p.nr_proposta IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM projetos_execucao pe2
        WHERE pe2.nr_proposta = p.nr_proposta
      )
  )
`

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    // ---------------------------------------------------------------------------
    // Main filters — affect both aggregates (total, byStatus) and table
    // ---------------------------------------------------------------------------
    const ano = searchParams.get('ano') ?? ''
    const tipo = searchParams.get('tipo') ?? 'todos'
    const status = searchParams.get('status') ?? ''
    const uf = searchParams.get('uf') ?? ''

    // ---------------------------------------------------------------------------
    // Inline table-only filters — do NOT affect total / byStatus
    // ---------------------------------------------------------------------------
    const proponenteFilter = searchParams.get('proponente') ?? ''
    const numeroPropostaFilter = searchParams.get('numero_proposta') ?? ''

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const offset = (page - 1) * TGOV_PAGE_SIZE

    // ---------------------------------------------------------------------------
    // Build parameterized main filter clauses (pe = all_exec CTE alias)
    // ---------------------------------------------------------------------------
    const mainParams: unknown[] = []
    const mainConditions: string[] = []

    // Projetus whitelist (hardcoded) + dynamic whitelist from tgov_whitelist table
    const staticClause = buildNrPropostaWhereClause('pe.nr_proposta', mainParams, EXECUCAO_NR_PROPOSTAS)
    mainConditions.push(`(${staticClause} OR EXISTS (SELECT 1 FROM tgov_whitelist tw WHERE (tw.cnpj = pe.cnpj OR tw.nr_proposta = pe.nr_proposta) AND tw.tab IN ('ambos','execucao')))`)

    if (ano) {
      mainParams.push(parseInt(ano, 10))
      mainConditions.push(`EXTRACT(YEAR FROM pe.data_assinatura) = $${mainParams.length}`)
    }

    if (status) {
      mainParams.push(status)
      mainConditions.push(`pe.situacao = $${mainParams.length}`)
    }

    if (uf) {
      mainParams.push(uf)
      mainConditions.push(`pe.uf = $${mainParams.length}`)
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

    const mainWhereClause = mainConditions.length > 0
      ? `WHERE ${mainConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Build table-only filter clauses
    // ---------------------------------------------------------------------------
    const tableParams = [...mainParams]
    const tableConditions = [...mainConditions]

    if (proponenteFilter) {
      tableParams.push(`%${proponenteFilter}%`)
      tableConditions.push(`LOWER(pe.nome_proponente) LIKE LOWER($${tableParams.length})`)
    }

    if (numeroPropostaFilter) {
      tableParams.push(`%${numeroPropostaFilter}%`)
      tableConditions.push(`(
        pe.nr_convenio LIKE $${tableParams.length}
        OR (pe.id_proposta IS NOT NULL AND pe.id_proposta LIKE $${tableParams.length})
        OR (pe.nr_proposta IS NOT NULL AND pe.nr_proposta LIKE $${tableParams.length})
      )`)
    }

    const tableWhereClause = tableConditions.length > 0
      ? `WHERE ${tableConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Run queries — all use WITH all_exec CTE
    // ---------------------------------------------------------------------------
    const [totalRows, byStatusRows, byExecRangeRows, byYearRows, byDesembolsoYearRows, tableCountRows, tableDataRows] = await Promise.all([
      query<{ total: number }>(
        `WITH ${ALL_EXEC_CTE} SELECT COUNT(*)::int AS total FROM all_exec pe ${mainWhereClause}`,
        mainParams
      ),

      query<{ situacao: string; cnt: number }>(
        `WITH ${ALL_EXEC_CTE}
        SELECT COALESCE(pe.situacao, 'Sem Situação') AS situacao, COUNT(*)::int AS cnt
        FROM all_exec pe ${mainWhereClause}
        GROUP BY pe.situacao ORDER BY COUNT(*) DESC`,
        mainParams
      ),

      query<{ faixa: string; cnt: number }>(
        `WITH ${ALL_EXEC_CTE}
        SELECT
          CASE
            WHEN pe.pct_execucao IS NULL THEN 'Sem dados'
            WHEN pe.pct_execucao < 25 THEN '0–25%'
            WHEN pe.pct_execucao < 50 THEN '25–50%'
            WHEN pe.pct_execucao < 75 THEN '50–75%'
            WHEN pe.pct_execucao < 100 THEN '75–99%'
            ELSE '100%+'
          END AS faixa,
          COUNT(*)::int AS cnt
        FROM all_exec pe ${mainWhereClause}
        GROUP BY 1 ORDER BY MIN(COALESCE(pe.pct_execucao, 999))`,
        mainParams
      ),

      // BI: valor global by year (from nr_proposta year suffix)
      query<{ ano: string; valor_global: string; cnt: number }>(
        `WITH ${ALL_EXEC_CTE}
        SELECT
          COALESCE(SPLIT_PART(pe.nr_proposta, '/', 2), 'N/A') AS ano,
          COALESCE(SUM(pe.valor_global), 0)::text AS valor_global,
          COUNT(*)::int AS cnt
        FROM all_exec pe ${mainWhereClause}
        GROUP BY 1 ORDER BY 1`,
        mainParams
      ),

      // BI: com/sem desembolso by year
      query<{ ano: string; com_desembolso: number; sem_desembolso: number }>(
        `WITH ${ALL_EXEC_CTE}
        SELECT
          COALESCE(SPLIT_PART(pe.nr_proposta, '/', 2), 'N/A') AS ano,
          COUNT(*) FILTER (WHERE pe.valor_desembolsado > 0)::int AS com_desembolso,
          COUNT(*) FILTER (WHERE pe.valor_desembolsado IS NULL OR pe.valor_desembolsado <= 0)::int AS sem_desembolso
        FROM all_exec pe ${mainWhereClause}
        GROUP BY 1 ORDER BY 1`,
        mainParams
      ),

      query<{ total: number }>(
        `WITH ${ALL_EXEC_CTE} SELECT COUNT(*)::int AS total FROM all_exec pe ${tableWhereClause}`,
        tableParams
      ),

      query<{
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
      }>(
        `WITH ${ALL_EXEC_CTE}
        SELECT
          pe.nr_convenio,
          pe.id_proposta,
          pe.nr_proposta,
          EXTRACT(YEAR FROM pe.data_assinatura)::int AS ano_instrumento,
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
          pe.dias_ate_vencimento
        FROM all_exec pe
        ${tableWhereClause}
        ORDER BY
          pe.valor_global DESC NULLS LAST,
          pe.nr_convenio DESC NULLS LAST
        LIMIT ${TGOV_PAGE_SIZE} OFFSET ${offset}`,
        tableParams
      ),
    ])

    const total = Number(totalRows[0]?.total) || 0
    const totalTableRows = Number(tableCountRows[0]?.total) || 0
    const totalPages = Math.max(1, Math.ceil(totalTableRows / TGOV_PAGE_SIZE))

    const byStatus = byStatusRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.situacao ?? 'Sem Situação',
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const byExecRange = byExecRangeRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.faixa,
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const rows: TGovExecucaoTableRow[] = tableDataRows.map((r) => ({
      numeroProposta: r.nr_proposta || r.id_proposta || r.nr_convenio || '—',
      nrConvenio: r.nr_convenio || '',
      anoInstrumento: r.ano_instrumento,
      data: r.data_assinatura ? String(r.data_assinatura) : null,
      cnpj: r.cnpj,
      proponente: r.nome_proponente ?? '',
      situacao: r.situacao ?? 'Sem Situação',
      valorGlobal: r.valor_global ? parseFloat(r.valor_global) : null,
      valorRepasse: r.valor_repasse ? parseFloat(r.valor_repasse) : null,
      valorDesembolsado: r.valor_desembolsado ? parseFloat(r.valor_desembolsado) : null,
      saldoConta: r.saldo_conta ? parseFloat(r.saldo_conta) : null,
      rendimentoAplicacao: r.rendimento_aplicacao ? parseFloat(r.rendimento_aplicacao) : null,
      ingressoContrapartida: r.ingresso_contrapartida ? parseFloat(r.ingresso_contrapartida) : null,
      valorEmpenhado: r.valor_empenhado ? parseFloat(r.valor_empenhado) : null,
      pctExecucao: r.pct_execucao ? parseFloat(r.pct_execucao) : null,
      uf: r.uf,
      municipio: r.municipio,
      dataInicioVigencia: r.data_inicio_vigencia ? String(r.data_inicio_vigencia) : null,
      dataFimVigencia: r.data_fim_vigencia ? String(r.data_fim_vigencia) : null,
      diasEmExecucao: r.dias_em_execucao,
      diasAteVencimento: r.dias_ate_vencimento,
    }))

    const byYear = byYearRows.map(r => ({
      ano: r.ano,
      valorGlobal: parseFloat(r.valor_global) || 0,
      count: r.cnt,
    }))

    const byDesembolsoYear = byDesembolsoYearRows.map(r => ({
      ano: r.ano,
      comDesembolso: r.com_desembolso,
      semDesembolso: r.sem_desembolso,
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
