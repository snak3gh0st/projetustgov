import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export type CsmClientRow = {
  cnpj: string
  nome_proponente: string
  total_saldo_conta: number
  total_a_desembolsar: number
  total_rendimento: number
  total_a_liberar: number
  count_execucao_saldo: number
  count_a_desembolsar: number
  count_aprovacao: number
  count_prestacao_contas: number
  priority_level: 1 | 2 | 3 | 4 | 5 | null
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const execList = Array.from(EXECUCAO_NR_PROPOSTAS)
    const aprList = Array.from(APROVACAO_NR_PROPOSTAS)

    /*
     * Three NOT MATERIALIZED CTEs union four data sources:
     *   1. exec_rows  — projetos_execucao (CRM) + tgov_projetos_execucao (TGov-only)
     *   2. apr_rows   — propostas (CRM) + tgov_propostas (TGov-only)
     *   3. csm_added  — vendedor_projetos rows owned by this CSM with no whitelist match
     *
     * Final SELECT groups by CNPJ, aggregates financials, and computes MIN(priority).
     *
     * Per-row priority CASE WHEN (order matters — first match wins per row):
     *   1  saldo_conta > 0
     *   2  a desembolsar (0 desembolso + em execução)
     *   3  rendimento > 0
     *   4  aprovação rows (literal)
     *   5  prestação de contas
     *   NULL  otherwise
     *
     * Client badge = MIN(row priority) → best opportunity surfaces first.
     */
    type PortfolioRow = {
      cnpj: string
      nome_proponente: string
      total_saldo_conta: string
      total_a_desembolsar: string
      total_rendimento: string
      total_a_liberar: string
      count_execucao_saldo: string
      count_a_desembolsar: string
      count_aprovacao: string
      count_prestacao_contas: string
      priority_level: string | null
    }

    const rows = await query<PortfolioRow>(
      `WITH
        exec_rows AS NOT MATERIALIZED (
          -- CRM execution projects in the Projetus whitelist
          SELECT
            pe.cnpj,
            pe.nome_proponente,
            pe.nr_convenio,
            pe.situacao,
            pe.saldo_conta,
            pe.valor_desembolsado,
            pe.valor_repasse,
            pe.rendimento_aplicacao
          FROM projetos_execucao pe
          WHERE pe.nr_proposta = ANY($1::text[])

          UNION ALL

          -- TGov-only execution projects (not in CRM projetos_execucao)
          SELECT
            pe.cnpj,
            pe.nome_proponente,
            pe.nr_convenio,
            pe.situacao,
            pe.saldo_conta,
            pe.valor_desembolsado,
            pe.valor_repasse,
            pe.rendimento_aplicacao
          FROM tgov_projetos_execucao pe
          WHERE pe.nr_proposta = ANY($1::text[])
            AND NOT EXISTS (
              SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio
            )
        ),
        apr_rows AS NOT MATERIALIZED (
          -- CRM approval proposals in the Projetus whitelist
          SELECT
            REGEXP_REPLACE(p.proponente_cnpj, '[^0-9]', '', 'g') AS cnpj,
            p.proponente AS nome_proponente,
            p.nr_proposta,
            p.situacao,
            p.valor_global,
            p.valor_repasse
          FROM propostas p
          WHERE p.nr_proposta = ANY($2::text[])

          UNION ALL

          -- TGov-only approval proposals (not in CRM propostas)
          SELECT
            REGEXP_REPLACE(tp.proponente_cnpj, '[^0-9]', '', 'g') AS cnpj,
            tp.proponente AS nome_proponente,
            tp.nr_proposta,
            tp.situacao,
            tp.valor_global,
            tp.valor_repasse
          FROM tgov_propostas tp
          WHERE tp.nr_proposta = ANY($2::text[])
            AND NOT EXISTS (
              SELECT 1 FROM propostas crm WHERE crm.nr_proposta = tp.nr_proposta
            )
        ),
        csm_added AS NOT MATERIALIZED (
          -- CSM manually-added clients with no whitelist match in exec or apr
          SELECT
            REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj,
            COALESCE(vp.nome, '') AS nome_proponente
          FROM vendedor_projetos vp
          WHERE vp.vendedor_id = $3
            AND NOT EXISTS (
              SELECT 1 FROM exec_rows e
              WHERE e.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
            )
            AND NOT EXISTS (
              SELECT 1 FROM apr_rows a
              WHERE a.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
            )
        ),
        -- Union all sources into one row-per-project set with priority per row
        all_rows AS NOT MATERIALIZED (
          SELECT
            e.cnpj,
            e.nome_proponente,
            -- exec financials
            COALESCE(e.saldo_conta, 0) AS saldo_conta,
            COALESCE(e.valor_desembolsado, 0) AS valor_desembolsado,
            COALESCE(e.valor_repasse, 0) AS valor_repasse,
            COALESCE(e.rendimento_aplicacao, 0) AS rendimento_aplicacao,
            e.situacao,
            -- approval financials (NULL for exec rows)
            NULL::numeric AS valor_global,
            -- per-row priority
            CASE
              WHEN e.saldo_conta > 0 THEN 1
              WHEN COALESCE(e.valor_desembolsado, 0) = 0 AND e.situacao ILIKE 'em execu%' THEN 2
              WHEN e.rendimento_aplicacao > 0 THEN 3
              WHEN e.situacao ILIKE '%presta%conta%' THEN 5
              ELSE NULL
            END AS row_priority
          FROM exec_rows e

          UNION ALL

          SELECT
            a.cnpj,
            a.nome_proponente,
            -- exec financials (NULL for apr rows)
            0 AS saldo_conta,
            0 AS valor_desembolsado,
            0 AS valor_repasse,
            0 AS rendimento_aplicacao,
            a.situacao,
            COALESCE(a.valor_global, 0) AS valor_global,
            -- approval rows get priority 4
            4 AS row_priority
          FROM apr_rows a

          UNION ALL

          SELECT
            c.cnpj,
            c.nome_proponente,
            0 AS saldo_conta,
            0 AS valor_desembolsado,
            0 AS valor_repasse,
            0 AS rendimento_aplicacao,
            NULL AS situacao,
            0 AS valor_global,
            NULL AS row_priority
          FROM csm_added c
        )
      SELECT
        cnpj,
        -- Use last non-null nome_proponente found (COALESCE via array_agg trick)
        (array_remove(array_agg(nome_proponente ORDER BY nome_proponente NULLS LAST), NULL))[1] AS nome_proponente,
        COALESCE(SUM(saldo_conta), 0) AS total_saldo_conta,
        COALESCE(SUM(
          CASE
            WHEN situacao ILIKE 'em execu%'
            THEN GREATEST(valor_repasse - valor_desembolsado, 0)
            ELSE 0
          END
        ), 0) AS total_a_desembolsar,
        COALESCE(SUM(rendimento_aplicacao), 0) AS total_rendimento,
        COALESCE(SUM(
          CASE
            WHEN situacao ILIKE 'em execu%'
            THEN GREATEST(valor_repasse - valor_desembolsado, 0)
            ELSE 0
          END
        ), 0) + COALESCE(SUM(valor_global), 0) AS total_a_liberar,
        COUNT(*) FILTER (WHERE situacao ILIKE 'em execu%' AND saldo_conta > 0) AS count_execucao_saldo,
        COUNT(*) FILTER (WHERE situacao ILIKE 'em execu%' AND valor_desembolsado = 0) AS count_a_desembolsar,
        COUNT(*) FILTER (WHERE valor_global > 0) AS count_aprovacao,
        COUNT(*) FILTER (WHERE situacao ILIKE '%presta%conta%') AS count_prestacao_contas,
        MIN(row_priority) AS priority_level
      FROM all_rows
      WHERE cnpj IS NOT NULL AND cnpj != ''
      GROUP BY cnpj
      ORDER BY priority_level ASC NULLS LAST, total_saldo_conta DESC NULLS LAST`,
      [execList, aprList, session.userId]
    )

    return NextResponse.json({
      clients: rows.map(r => ({
        cnpj: r.cnpj,
        nome_proponente: r.nome_proponente ?? '',
        total_saldo_conta: Number(r.total_saldo_conta) || 0,
        total_a_desembolsar: Number(r.total_a_desembolsar) || 0,
        total_rendimento: Number(r.total_rendimento) || 0,
        total_a_liberar: Number(r.total_a_liberar) || 0,
        count_execucao_saldo: Number(r.count_execucao_saldo) || 0,
        count_a_desembolsar: Number(r.count_a_desembolsar) || 0,
        count_aprovacao: Number(r.count_aprovacao) || 0,
        count_prestacao_contas: Number(r.count_prestacao_contas) || 0,
        priority_level: r.priority_level == null ? null : Number(r.priority_level) as 1 | 2 | 3 | 4 | 5,
      })),
    })
  } catch (error) {
    console.error('[api/csm/portfolio] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
  }
}
