import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGovTabResponse, TGovExecucaoTableRow, buildProjetusProposalWhereClause } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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
    const tipo = searchParams.get('tipo') ?? 'todos' // 'todos' | 'meus_proponentes' | 'outros'
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
    // Build parameterized main filter clauses
    // ---------------------------------------------------------------------------
    const mainParams: unknown[] = []
    const mainConditions: string[] = []

    // Projetus whitelist: always applied as the first condition
    // Rows with NULL id_proposta are intentionally excluded (no matching proposal = not Projetus)
    mainConditions.push(buildProjetusProposalWhereClause('pe.id_proposta', mainParams))

    // ano filter: use data_assinatura year directly from projetos_execucao
    if (ano) {
      mainParams.push(parseInt(ano, 10))
      mainConditions.push(`EXTRACT(YEAR FROM pe.data_assinatura) = $${mainParams.length}`)
    }

    // status filter: pe.situacao exact match
    if (status) {
      mainParams.push(status)
      mainConditions.push(`pe.situacao = $${mainParams.length}`)
    }

    // uf filter: pe.uf
    if (uf) {
      mainParams.push(uf)
      mainConditions.push(`pe.uf = $${mainParams.length}`)
    }

    // tipo filter: EXISTS / NOT EXISTS against vendedor_projetos using CNPJ normalisation
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
    // Build table-only filter clauses (extend main params)
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
      )`)
    }

    const tableWhereClause = tableConditions.length > 0
      ? `WHERE ${tableConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Run queries in parallel
    // ---------------------------------------------------------------------------
    const [totalRows, byStatusRows, byExecRangeRows, tableCountRows, tableDataRows] = await Promise.all([
      // 1. Total matching main filters
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM projetos_execucao pe ${mainWhereClause}`,
        mainParams
      ),

      // 2. Status buckets (kept for reference / filtering)
      query<{ situacao: string; cnt: number }>(
        `SELECT
          COALESCE(pe.situacao, 'Sem Situação') AS situacao,
          COUNT(*)::int AS cnt
        FROM projetos_execucao pe
        ${mainWhereClause}
        GROUP BY pe.situacao
        ORDER BY COUNT(*) DESC`,
        mainParams
      ),

      // 2b. % Execução range buckets for donut chart
      query<{ faixa: string; cnt: number }>(
        `SELECT
          CASE
            WHEN pe.pct_execucao IS NULL THEN 'Sem dados'
            WHEN pe.pct_execucao < 25 THEN '0–25%'
            WHEN pe.pct_execucao < 50 THEN '25–50%'
            WHEN pe.pct_execucao < 75 THEN '50–75%'
            WHEN pe.pct_execucao < 100 THEN '75–99%'
            ELSE '100%+'
          END AS faixa,
          COUNT(*)::int AS cnt
        FROM projetos_execucao pe
        ${mainWhereClause}
        GROUP BY 1
        ORDER BY
          MIN(COALESCE(pe.pct_execucao, 999))`,
        mainParams
      ),

      // 3. Total rows matching main + table filters (for pagination metadata)
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM projetos_execucao pe ${tableWhereClause}`,
        tableParams
      ),

      // 4. Paginated table rows with expanded columns
      query<{
        nr_convenio: string
        id_proposta: string | null
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
        `SELECT
          pe.nr_convenio,
          pe.id_proposta,
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
        FROM projetos_execucao pe
        ${tableWhereClause}
        ORDER BY
          pe.valor_global DESC NULLS LAST,
          pe.nr_convenio DESC
        LIMIT ${TGOV_PAGE_SIZE} OFFSET ${offset}`,
        tableParams
      ),
    ])

    const total = Number(totalRows[0]?.total) || 0
    const totalTableRows = Number(tableCountRows[0]?.total) || 0
    const totalPages = Math.max(1, Math.ceil(totalTableRows / TGOV_PAGE_SIZE))

    // Build byStatus with percent
    const byStatus = byStatusRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.situacao ?? 'Sem Situação',
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    // Build byExecRange with percent (for execucao donut chart)
    const byExecRange = byExecRangeRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.faixa,
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const rows: TGovExecucaoTableRow[] = tableDataRows.map((r) => ({
      numeroProposta: r.id_proposta || r.nr_convenio,
      nrConvenio: r.nr_convenio,
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

    const response: TGovTabResponse & { byExecRange: typeof byExecRange } = {
      total,
      byStatus,
      byExecRange,
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
