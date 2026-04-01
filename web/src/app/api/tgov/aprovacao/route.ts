import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGovTabResponse, buildProjetusProposalWhereClause } from '@/lib/tgov'

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
    mainConditions.push(buildProjetusProposalWhereClause('p.transfer_gov_id', mainParams))

    // ano filter: EXTRACT(YEAR FROM data_publicacao) = $n
    if (ano) {
      mainParams.push(parseInt(ano, 10))
      mainConditions.push(`EXTRACT(YEAR FROM p.data_publicacao) = $${mainParams.length}`)
    }

    // status filter: exact match on situacao (DB stores accented form)
    if (status) {
      mainParams.push(status)
      mainConditions.push(`p.situacao = $${mainParams.length}`)
    }

    // uf filter: p.estado
    if (uf) {
      mainParams.push(uf)
      mainConditions.push(`p.estado = $${mainParams.length}`)
    }

    // tipo filter: EXISTS / NOT EXISTS against vendedor_projetos using normalised CNPJ
    if (tipo === 'meus_proponentes') {
      mainConditions.push(`EXISTS (
        SELECT 1 FROM vendedor_projetos vp
        WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = p.proponente_cnpj
      )`)
    } else if (tipo === 'outros') {
      mainConditions.push(`NOT EXISTS (
        SELECT 1 FROM vendedor_projetos vp
        WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = p.proponente_cnpj
      )`)
    }

    const mainWhereClause = mainConditions.length > 0
      ? `WHERE ${mainConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Build table-only filter clauses (extend main params)
    // ---------------------------------------------------------------------------
    // We must snapshot mainParams length before adding table-only params
    const tableParams = [...mainParams]
    const tableConditions = [...mainConditions]

    if (proponenteFilter) {
      tableParams.push(`%${proponenteFilter}%`)
      tableConditions.push(`LOWER(p.proponente) LIKE LOWER($${tableParams.length})`)
    }

    if (numeroPropostaFilter) {
      tableParams.push(`%${numeroPropostaFilter}%`)
      tableConditions.push(`p.transfer_gov_id LIKE $${tableParams.length}`)
    }

    const tableWhereClause = tableConditions.length > 0
      ? `WHERE ${tableConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Run queries in parallel: aggregate (total + byStatus) and table
    // ---------------------------------------------------------------------------
    const [totalRows, byStatusRows, tableCountRows, tableDataRows] = await Promise.all([
      // 1. Total matching main filters
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM propostas p ${mainWhereClause}`,
        mainParams
      ),

      // 2. Status buckets for donut chart (main filters only)
      query<{ situacao: string; cnt: number }>(
        `SELECT
          COALESCE(p.situacao, 'Sem Situação') AS situacao,
          COUNT(*)::int AS cnt
        FROM propostas p
        ${mainWhereClause}
        GROUP BY p.situacao
        ORDER BY COUNT(*) DESC`,
        mainParams
      ),

      // 3. Total rows matching main + table filters (for pagination metadata)
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM propostas p ${tableWhereClause}`,
        tableParams
      ),

      // 4. Paginated table rows (main + table filters, sorted newest first)
      query<{
        transfer_gov_id: string
        data_publicacao: string | null
        proponente_cnpj: string
        proponente: string | null
        situacao: string | null
      }>(
        `SELECT
          p.transfer_gov_id,
          p.data_publicacao,
          COALESCE(p.proponente_cnpj, '') AS proponente_cnpj,
          COALESCE(p.proponente, '') AS proponente,
          COALESCE(p.situacao, 'Sem Situação') AS situacao
        FROM propostas p
        ${tableWhereClause}
        ORDER BY p.data_publicacao DESC NULLS LAST, p.transfer_gov_id DESC
        LIMIT ${TGOV_PAGE_SIZE} OFFSET ${offset}`,
        tableParams
      ),
    ])

    const total = Number(totalRows[0]?.total) || 0
    const totalTableRows = Number(tableCountRows[0]?.total) || 0
    const totalPages = Math.max(1, Math.ceil(totalTableRows / TGOV_PAGE_SIZE))

    // Build byStatus with percent, sorted by count desc (UI can re-sort by TGOV_STATUS_ORDER)
    const byStatus = byStatusRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.situacao ?? 'Sem Situação',
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const response: TGovTabResponse = {
      total,
      byStatus,
      table: {
        rows: tableDataRows.map((r) => ({
          numeroProposta: r.transfer_gov_id,
          data: r.data_publicacao ? String(r.data_publicacao) : null,
          cnpj: r.proponente_cnpj,
          proponente: r.proponente ?? '',
          situacao: r.situacao ?? 'Sem Situação',
        })),
        page,
        pageSize: TGOV_PAGE_SIZE,
        totalRows: totalTableRows,
        totalPages,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[api/tgov/aprovacao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch TGov approval data' }, { status: 500 })
  }
}
