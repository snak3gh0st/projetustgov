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
    //
    // `ano` semantics: join projetos_execucao -> propostas via id_proposta -> transfer_gov_id
    // so "Ano" means proposal publication year on both tabs (same as aprovacao tab).
    //
    // `tipo` semantics: EXISTS / NOT EXISTS against vendedor_projetos using
    // pe.cnpj (digits-only VARCHAR(14)) vs REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g').
    // ---------------------------------------------------------------------------
    const mainParams: unknown[] = []
    const mainConditions: string[] = []

    // Projetus whitelist: always applied as the first condition
    // Rows with NULL id_proposta are intentionally excluded (no matching proposal = not Projetus)
    mainConditions.push(buildProjetusProposalWhereClause('pe.id_proposta', mainParams))

    // ano filter: derived from propostas.data_publicacao via id_proposta join
    if (ano) {
      mainParams.push(parseInt(ano, 10))
      mainConditions.push(`EXISTS (
        SELECT 1 FROM propostas p
        WHERE p.transfer_gov_id = pe.id_proposta
          AND EXTRACT(YEAR FROM p.data_publicacao) = $${mainParams.length}
      )`)
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
      // numeroProposta is id_proposta (preferred) or nr_convenio (fallback)
      tableConditions.push(`(
        (pe.id_proposta IS NOT NULL AND pe.id_proposta LIKE $${tableParams.length})
        OR (pe.id_proposta IS NULL AND pe.nr_convenio LIKE $${tableParams.length})
      )`)
    }

    const tableWhereClause = tableConditions.length > 0
      ? `WHERE ${tableConditions.join(' AND ')}`
      : ''

    // ---------------------------------------------------------------------------
    // Data column expression:
    //   COALESCE(propostas.data_publicacao, projetos_execucao.data_assinatura,
    //            projetos_execucao.data_inicio_vigencia)
    // Table sort: newest-first by this expression, deterministic tie-breaker:
    //   id_proposta DESC, nr_convenio DESC
    // ---------------------------------------------------------------------------

    const [totalRows, byStatusRows, tableCountRows, tableDataRows] = await Promise.all([
      // 1. Total matching main filters
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM projetos_execucao pe ${mainWhereClause}`,
        mainParams
      ),

      // 2. Status buckets for donut chart (main filters only)
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

      // 3. Total rows matching main + table filters (for pagination metadata)
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM projetos_execucao pe ${tableWhereClause}`,
        tableParams
      ),

      // 4. Paginated table rows (main + table filters)
      //    - numeroProposta: id_proposta preferred, nr_convenio as fallback
      //    - data: COALESCE(p.data_publicacao, pe.data_assinatura, pe.data_inicio_vigencia)
      //    - sort: newest-first by data expression, then id_proposta DESC, nr_convenio DESC
      query<{
        numero_proposta: string
        data_col: string | null
        cnpj: string
        nome_proponente: string | null
        situacao: string | null
      }>(
        `SELECT
          COALESCE(pe.id_proposta, pe.nr_convenio) AS numero_proposta,
          COALESCE(
            p.data_publicacao::text,
            pe.data_assinatura::text,
            pe.data_inicio_vigencia::text
          ) AS data_col,
          pe.cnpj,
          COALESCE(pe.nome_proponente, '') AS nome_proponente,
          COALESCE(pe.situacao, 'Sem Situação') AS situacao
        FROM projetos_execucao pe
        LEFT JOIN propostas p ON p.transfer_gov_id = pe.id_proposta
        ${tableWhereClause}
        ORDER BY
          COALESCE(
            p.data_publicacao,
            pe.data_assinatura,
            pe.data_inicio_vigencia
          ) DESC NULLS LAST,
          pe.id_proposta DESC NULLS LAST,
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

    const response: TGovTabResponse = {
      total,
      byStatus,
      table: {
        rows: tableDataRows.map((r) => ({
          numeroProposta: r.numero_proposta,
          data: r.data_col ? String(r.data_col) : null,
          cnpj: r.cnpj,
          proponente: r.nome_proponente ?? '',
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
    console.error('[api/tgov/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch TGov execution data' }, { status: 500 })
  }
}
