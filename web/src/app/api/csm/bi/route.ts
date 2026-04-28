import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Six status buckets used across by_status and funnel responses.
 * Bucket priority order for funnel (1 = highest):
 *   Saldo em Conta → A Desembolsar → Em Execução → Em Aprovação → Prestação de Contas → Outros
 *
 * BI does NOT include vendedor_projetos csm_added rows:
 *   manual-added clients have zero financials by definition;
 *   including them adds only zero-value rows to totals.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const execList = Array.from(EXECUCAO_NR_PROPOSTAS)
    const aprList = Array.from(APROVACAO_NR_PROPOSTAS)

    type TotalsRow = {
      total_saldo_conta: string
      total_rendimento: string
      total_a_liberar: string
      total_projetos: string
    }

    type ByStatusRow = {
      bucket: string
      count: string
      value: string
    }

    // Three queries fired in parallel — each uses NOT MATERIALIZED CTEs
    const [totalsRows, byStatusRows, funnelRows] = await Promise.all([

      // Query A — portfolio totals (BI-01, BI-03, BI-04)
      query<TotalsRow>(
        `WITH
          exec_rows AS NOT MATERIALIZED (
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
            UNION ALL
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM tgov_projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
              AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
          ),
          apr_rows AS NOT MATERIALIZED (
            SELECT p.valor_global FROM propostas p WHERE p.nr_proposta = ANY($2::text[])
            UNION ALL
            SELECT tp.valor_global FROM tgov_propostas tp WHERE tp.nr_proposta = ANY($2::text[])
              AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.nr_proposta = tp.nr_proposta)
          )
        SELECT
          COALESCE(SUM(e.saldo_conta), 0)::text AS total_saldo_conta,
          COALESCE(SUM(e.rendimento_aplicacao), 0)::text AS total_rendimento,
          (
            COALESCE(SUM(GREATEST(COALESCE(e.valor_repasse, 0) - COALESCE(e.valor_desembolsado, 0), 0))
              FILTER (WHERE e.situacao ILIKE 'em execu%'), 0)
            + COALESCE((SELECT SUM(valor_global) FROM apr_rows), 0)
          )::text AS total_a_liberar,
          (
            (SELECT COUNT(*) FROM exec_rows) + (SELECT COUNT(*) FROM apr_rows)
          )::text AS total_projetos
        FROM exec_rows e`,
        [execList, aprList]
      ),

      // Query B — by_status breakdown (BI-02)
      // Returns non-empty buckets only; funnel emits all six
      query<ByStatusRow>(
        `WITH
          exec_rows AS NOT MATERIALIZED (
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
            UNION ALL
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM tgov_projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
              AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
          ),
          apr_rows AS NOT MATERIALIZED (
            SELECT p.valor_global FROM propostas p WHERE p.nr_proposta = ANY($2::text[])
            UNION ALL
            SELECT tp.valor_global FROM tgov_propostas tp WHERE tp.nr_proposta = ANY($2::text[])
              AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.nr_proposta = tp.nr_proposta)
          ),
          bucketed AS NOT MATERIALIZED (
            SELECT
              CASE
                WHEN saldo_conta > 0 THEN 'Saldo em Conta'
                WHEN COALESCE(valor_desembolsado, 0) = 0 AND situacao ILIKE 'em execu%' THEN 'A Desembolsar'
                WHEN situacao ILIKE 'em execu%' THEN 'Em Execução'
                WHEN situacao ILIKE '%presta%conta%' THEN 'Prestação de Contas'
                ELSE 'Outros'
              END AS bucket,
              saldo_conta AS value
            FROM exec_rows
            UNION ALL
            SELECT 'Em Aprovação' AS bucket, valor_global AS value
            FROM apr_rows
          )
        SELECT
          bucket,
          COUNT(*)::text AS count,
          COALESCE(SUM(value), 0)::text AS value
        FROM bucketed
        GROUP BY bucket
        ORDER BY bucket`,
        [execList, aprList]
      ),

      // Query C — funnel (BI-05): same buckets ordered by priority, all six rows emitted
      query<ByStatusRow>(
        `WITH
          exec_rows AS NOT MATERIALIZED (
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
            UNION ALL
            SELECT pe.saldo_conta, pe.valor_desembolsado, pe.valor_repasse, pe.rendimento_aplicacao, pe.situacao
            FROM tgov_projetos_execucao pe WHERE pe.nr_proposta = ANY($1::text[])
              AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
          ),
          apr_rows AS NOT MATERIALIZED (
            SELECT p.valor_global FROM propostas p WHERE p.nr_proposta = ANY($2::text[])
            UNION ALL
            SELECT tp.valor_global FROM tgov_propostas tp WHERE tp.nr_proposta = ANY($2::text[])
              AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.nr_proposta = tp.nr_proposta)
          ),
          bucketed AS NOT MATERIALIZED (
            SELECT
              CASE
                WHEN saldo_conta > 0 THEN 'Saldo em Conta'
                WHEN COALESCE(valor_desembolsado, 0) = 0 AND situacao ILIKE 'em execu%' THEN 'A Desembolsar'
                WHEN situacao ILIKE 'em execu%' THEN 'Em Execução'
                WHEN situacao ILIKE '%presta%conta%' THEN 'Prestação de Contas'
                ELSE 'Outros'
              END AS bucket,
              saldo_conta AS value
            FROM exec_rows
            UNION ALL
            SELECT 'Em Aprovação' AS bucket, valor_global AS value
            FROM apr_rows
          ),
          all_buckets (bucket) AS (
            VALUES
              ('Saldo em Conta'),
              ('A Desembolsar'),
              ('Em Execução'),
              ('Em Aprovação'),
              ('Prestação de Contas'),
              ('Outros')
          )
        SELECT
          ab.bucket,
          COALESCE(b.cnt, 0)::text AS count,
          COALESCE(b.val, 0)::text AS value
        FROM all_buckets ab
        LEFT JOIN (
          SELECT bucket, COUNT(*)::bigint AS cnt, COALESCE(SUM(value), 0) AS val
          FROM bucketed GROUP BY bucket
        ) b USING (bucket)
        ORDER BY
          CASE ab.bucket
            WHEN 'Saldo em Conta' THEN 1
            WHEN 'A Desembolsar' THEN 2
            WHEN 'Em Execução' THEN 3
            WHEN 'Em Aprovação' THEN 4
            WHEN 'Prestação de Contas' THEN 5
            ELSE 6
          END`,
        [execList, aprList]
      ),
    ])

    const t = totalsRows[0] ?? {
      total_saldo_conta: '0',
      total_rendimento: '0',
      total_a_liberar: '0',
      total_projetos: '0',
    }

    return NextResponse.json({
      totals: {
        total_saldo_conta: Number(t.total_saldo_conta) || 0,
        total_rendimento: Number(t.total_rendimento) || 0,
        total_a_liberar: Number(t.total_a_liberar) || 0,
        total_projetos: Number(t.total_projetos) || 0,
      },
      by_status: byStatusRows.map(r => ({
        bucket: r.bucket as string,
        count: Number(r.count) || 0,
        value: Number(r.value) || 0,
      })),
      funnel: funnelRows.map(r => ({
        stage: r.bucket as string,
        count: Number(r.count) || 0,
        value: Number(r.value) || 0,
      })),
    })
  } catch (error) {
    console.error('[api/csm/bi] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch BI data' }, { status: 500 })
  }
}

