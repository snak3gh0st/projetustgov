import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'
import { TGOV_PAGE_SIZE, TGOV_MAX_PAGE_SIZE, TGovTabResponse, APROVACAO_NR_PROPOSTAS, buildNrPropostaWhereClause } from '@/lib/tgov'
import { ensureTgovTables } from '@/lib/tgov-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * CTE que une `propostas` (CRM scope) com `tgov_propostas` (TGov-only scope).
 * Storage físico separado garante zero leak para o CRM. As branches incluem
 * apenas as colunas usadas pelas queries da rota — schemas das duas tabelas
 * são equivalentes para esses campos.
 *
 * tgov_propostas só contribui linhas cujo transfer_gov_id NÃO esteja em
 * propostas (evita duplicação caso um CNPJ migre de TGov-only para CRM).
 */
const ALL_PROPOSTAS_CTE = `
  WITH all_propostas AS NOT MATERIALIZED (
    SELECT
      p.transfer_gov_id, p.nr_proposta, p.titulo, p.situacao,
      p.valor_global, p.valor_repasse, p.valor_contrapartida,
      p.data_publicacao, p.data_inicio_vigencia, p.data_fim_vigencia,
      p.estado, p.municipio, p.proponente, p.proponente_cnpj,
      p.modalidade, p.orgao_superior, p.orgao_vinculado,
      p.tecnico_id
    FROM propostas p
    UNION ALL
    SELECT
      p.transfer_gov_id, p.nr_proposta, p.titulo, p.situacao,
      p.valor_global, p.valor_repasse, p.valor_contrapartida,
      p.data_publicacao, p.data_inicio_vigencia, p.data_fim_vigencia,
      p.estado, p.municipio, p.proponente, p.proponente_cnpj,
      p.modalidade, p.orgao_superior, p.orgao_vinculado,
      p.tecnico_id
    FROM tgov_propostas p
    WHERE NOT EXISTS (
      SELECT 1 FROM propostas crm WHERE crm.transfer_gov_id = p.transfer_gov_id
    )
  )
`

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Garante existência das tabelas TGov-only (defensivo, idempotente)
    await ensureTgovTables()

    const { searchParams } = new URL(request.url)

    const ano = searchParams.get('ano') ?? ''
    const tipo = searchParams.get('tipo') ?? 'todos'
    const status = searchParams.get('status') ?? ''
    const uf = searchParams.get('uf') ?? ''

    const proponenteFilter = searchParams.get('proponente') ?? ''
    const numeroPropostaFilter = searchParams.get('numero_proposta') ?? ''

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const pageSize = Math.min(TGOV_MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('page_size') ?? String(TGOV_PAGE_SIZE), 10)))
    const offset = (page - 1) * pageSize

    const mainParams: unknown[] = []
    const mainConditions: string[] = []

    // Projetus whitelist (hardcoded) + dynamic whitelist from tgov_whitelist table
    const staticClause = buildNrPropostaWhereClause('p.nr_proposta', mainParams, APROVACAO_NR_PROPOSTAS)
    mainConditions.push(`(${staticClause} OR EXISTS (SELECT 1 FROM tgov_whitelist tw WHERE (tw.cnpj = p.proponente_cnpj OR tw.nr_proposta = p.nr_proposta) AND tw.tab IN ('ambos','aprovacao')))`)

    if (ano) {
      mainParams.push(`${ano}-01-01`)
      mainParams.push(`${parseInt(ano, 10) + 1}-01-01`)
      mainConditions.push(`p.data_publicacao >= $${mainParams.length - 1}::date AND p.data_publicacao < $${mainParams.length}::date`)
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
      tableConditions.push(`(p.nr_proposta LIKE $${tableParams.length} OR p.transfer_gov_id LIKE $${tableParams.length})`)
    }

    const tableWhereClause = tableConditions.length > 0
      ? `WHERE ${tableConditions.join(' AND ')}`
      : ''

    const [totalRows, byStatusRows, byUfRows, byValorStatusRows, byAvgUfRows, avgTotalRows, tableCountRows, tableDataRows] = await Promise.all([
      query<{ total: number }>(
        `${ALL_PROPOSTAS_CTE} SELECT COUNT(*)::int AS total FROM all_propostas p ${mainWhereClause}`,
        mainParams
      ),

      query<{ situacao: string; cnt: number }>(
        `${ALL_PROPOSTAS_CTE} SELECT
          COALESCE(p.situacao, 'Sem Situação') AS situacao,
          COUNT(*)::int AS cnt
        FROM all_propostas p
        ${mainWhereClause}
        GROUP BY p.situacao
        ORDER BY COUNT(*) DESC`,
        mainParams
      ),

      // BI: valor global by UF
      query<{ uf: string; valor_global: string; cnt: number }>(
        `${ALL_PROPOSTAS_CTE} SELECT
          COALESCE(p.estado, 'N/A') AS uf,
          COALESCE(SUM(p.valor_global), 0)::text AS valor_global,
          COUNT(*)::int AS cnt
        FROM all_propostas p ${mainWhereClause}
        GROUP BY 1 ORDER BY SUM(p.valor_global) DESC NULLS LAST LIMIT 10`,
        mainParams
      ),

      // BI: valor global by situacao
      query<{ situacao: string; valor_global: string }>(
        `${ALL_PROPOSTAS_CTE} SELECT
          COALESCE(p.situacao, 'Sem Situação') AS situacao,
          COALESCE(SUM(p.valor_global), 0)::text AS valor_global
        FROM all_propostas p ${mainWhereClause}
        GROUP BY 1 ORDER BY SUM(p.valor_global) DESC NULLS LAST`,
        mainParams
      ),

      query<{ uf: string; avg_valor: string; cnt: number }>(
        `${ALL_PROPOSTAS_CTE} SELECT
          COALESCE(p.estado, 'N/A') AS uf,
          COALESCE(SUM(p.valor_global) / NULLIF(COUNT(*), 0), 0)::text AS avg_valor,
          COUNT(*)::int AS cnt
        FROM all_propostas p ${mainWhereClause}
        GROUP BY 1 ORDER BY SUM(p.valor_global) / NULLIF(COUNT(*), 0) DESC NULLS LAST`,
        mainParams
      ),

      query<{ avg_valor: string }>(
        `${ALL_PROPOSTAS_CTE} SELECT COALESCE(SUM(p.valor_global) / NULLIF(COUNT(*), 0), 0)::text AS avg_valor FROM all_propostas p ${mainWhereClause}`,
        mainParams
      ),

      query<{ total: number }>(
        `${ALL_PROPOSTAS_CTE} SELECT COUNT(*)::int AS total FROM all_propostas p ${tableWhereClause}`,
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
        internal_status: string | null
        tecnico_id: string | null
      }>(
        `${ALL_PROPOSTAS_CTE} SELECT
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
          p.data_fim_vigencia::text,
          ti.status AS internal_status,
          p.tecnico_id
        FROM all_propostas p
        LEFT JOIN tgov_interactions ti ON ti.item_key = p.nr_proposta AND ti.tab = 'aprovacao'
        ${tableWhereClause}
        ORDER BY p.data_publicacao DESC NULLS LAST, p.transfer_gov_id DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
        tableParams
      ),
    ])

    // Lookup técnico names for the paginated rows (avoids JOIN on 904k-row CTE)
    const tecnicoIds = Array.from(new Set(tableDataRows.map(r => r.tecnico_id).filter((x): x is string => !!x)))
    const tecnicoNameMap = new Map<string, string>()
    if (tecnicoIds.length > 0) {
      const nameRows = await query<{ id: string; nome: string }>(
        `SELECT id::text AS id, nome FROM users WHERE id = ANY($1::uuid[])`,
        [tecnicoIds]
      )
      for (const r of nameRows) tecnicoNameMap.set(r.id, r.nome)
    }

    const total = Number(totalRows[0]?.total) || 0
    const totalTableRows = Number(tableCountRows[0]?.total) || 0
    const totalPages = Math.max(1, Math.ceil(totalTableRows / pageSize))

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

    const byAvgUf = byAvgUfRows.map(r => ({
      uf: r.uf,
      avgValor: parseFloat(r.avg_valor) || 0,
      count: r.cnt,
    }))

    const avgValor = avgTotalRows[0]?.avg_valor ? parseFloat(avgTotalRows[0].avg_valor) : null

    const response: TGovTabResponse & { byUf: typeof byUf; byValorStatus: typeof byValorStatus; byAvgUf: typeof byAvgUf; avgValor: typeof avgValor } = {
      total,
      byStatus,
      byUf,
      byValorStatus,
      byAvgUf,
      avgValor,
      table: {
        rows: tableDataRows.map((r) => ({
          numeroProposta: r.nr_proposta || r.transfer_gov_id,
          transferGovId: r.transfer_gov_id,
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
          internalStatus: r.internal_status ?? null,
          tecnicoId: r.tecnico_id ?? null,
          tecnicoNome: r.tecnico_id ? (tecnicoNameMap.get(r.tecnico_id) ?? null) : null,
        })),
        page,
        pageSize,
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
