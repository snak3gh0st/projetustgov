import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGovTabResponse, APROVACAO_NR_PROPOSTAS, buildNrPropostaWhereClause } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
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

    const mainParams: unknown[] = []
    const mainConditions: string[] = []

    // Projetus whitelist: only show approved 2026 proposals from the client list
    mainConditions.push(buildNrPropostaWhereClause('p.nr_proposta', mainParams, APROVACAO_NR_PROPOSTAS))

    if (ano) {
      mainParams.push(parseInt(ano, 10))
      mainConditions.push(`EXTRACT(YEAR FROM p.data_publicacao) = $${mainParams.length}`)
    }

    if (status) {
      mainParams.push(status)
      mainConditions.push(`p.situacao = $${mainParams.length}`)
    }

    if (uf) {
      mainParams.push(uf)
      mainConditions.push(`p.estado = $${mainParams.length}`)
    }

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

    const [totalRows, byStatusRows, byUfRows, byValorStatusRows, tableCountRows, tableDataRows] = await Promise.all([
      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM propostas p ${mainWhereClause}`,
        mainParams
      ),

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

      // BI: valor global by UF
      query<{ uf: string; valor_global: string; cnt: number }>(
        `SELECT
          COALESCE(p.estado, 'N/A') AS uf,
          COALESCE(SUM(p.valor_global), 0)::text AS valor_global,
          COUNT(*)::int AS cnt
        FROM propostas p ${mainWhereClause}
        GROUP BY 1 ORDER BY SUM(p.valor_global) DESC NULLS LAST LIMIT 10`,
        mainParams
      ),

      // BI: valor global by situacao
      query<{ situacao: string; valor_global: string }>(
        `SELECT
          COALESCE(p.situacao, 'Sem Situação') AS situacao,
          COALESCE(SUM(p.valor_global), 0)::text AS valor_global
        FROM propostas p ${mainWhereClause}
        GROUP BY 1 ORDER BY SUM(p.valor_global) DESC NULLS LAST`,
        mainParams
      ),

      query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM propostas p ${tableWhereClause}`,
        tableParams
      ),

      // Expanded columns for sidecard
      query<{
        transfer_gov_id: string
        nr_proposta: string | null
        data_publicacao: string | null
        proponente_cnpj: string
        proponente: string | null
        situacao: string | null
        titulo: string | null
        valor_global: string | null
        valor_repasse: string | null
        valor_contrapartida: string | null
        estado: string | null
        municipio: string | null
        modalidade: string | null
        orgao_superior: string | null
        orgao_vinculado: string | null
        data_inicio_vigencia: string | null
        data_fim_vigencia: string | null
      }>(
        `SELECT
          p.transfer_gov_id,
          p.nr_proposta,
          p.data_publicacao::text,
          COALESCE(p.proponente_cnpj, '') AS proponente_cnpj,
          COALESCE(p.proponente, '') AS proponente,
          COALESCE(p.situacao, 'Sem Situação') AS situacao,
          p.titulo,
          p.valor_global::text,
          p.valor_repasse::text,
          p.valor_contrapartida::text,
          p.estado,
          p.municipio,
          p.modalidade,
          p.orgao_superior,
          p.orgao_vinculado,
          p.data_inicio_vigencia::text,
          p.data_fim_vigencia::text
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

    const byStatus = byStatusRows.map((r) => {
      const count = Number(r.cnt)
      return {
        status: r.situacao ?? 'Sem Situação',
        count,
        percent: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }
    })

    const byUf = byUfRows.map(r => ({
      uf: r.uf,
      valorGlobal: parseFloat(r.valor_global) || 0,
      count: r.cnt,
    }))

    const byValorStatus = byValorStatusRows.map(r => ({
      situacao: r.situacao,
      valorGlobal: parseFloat(r.valor_global) || 0,
    }))

    const response: TGovTabResponse & { byUf: typeof byUf; byValorStatus: typeof byValorStatus } = {
      total,
      byStatus,
      byUf,
      byValorStatus,
      table: {
        rows: tableDataRows.map((r) => ({
          numeroProposta: r.nr_proposta || r.transfer_gov_id,
          data: r.data_publicacao ? String(r.data_publicacao) : null,
          cnpj: r.proponente_cnpj,
          proponente: r.proponente ?? '',
          situacao: r.situacao ?? 'Sem Situação',
          // Extended fields for sidecard
          titulo: r.titulo,
          valorGlobal: r.valor_global ? parseFloat(r.valor_global) : null,
          valorRepasse: r.valor_repasse ? parseFloat(r.valor_repasse) : null,
          valorContrapartida: r.valor_contrapartida ? parseFloat(r.valor_contrapartida) : null,
          uf: r.estado,
          municipio: r.municipio,
          modalidade: r.modalidade,
          orgaoSuperior: r.orgao_superior,
          orgaoVinculado: r.orgao_vinculado,
          dataInicioVigencia: r.data_inicio_vigencia ? String(r.data_inicio_vigencia) : null,
          dataFimVigencia: r.data_fim_vigencia ? String(r.data_fim_vigencia) : null,
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
