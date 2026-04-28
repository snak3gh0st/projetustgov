import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/csm/clients/[cnpj]/projects
 *
 * Returns all aprovacao + execucao + PC projects for a single CNPJ.
 * Each project row includes priority_level computed from base financial columns
 * using the same CASE WHEN as Plan 23-01 (csm/portfolio).
 *
 * Auth gate: canCsm() — 403 for non-csm/gestor/admin.
 * CNPJ gate: 14 digits required — 400 for invalid length.
 *
 * Prestação-de-Contas rows are tagged phase='execucao' (they live in
 * projetos_execucao tables) and the UI distinguishes them via priority_level=5
 * OR situacao ILIKE '%presta%conta%'. This avoids a third phase value.
 *
 * DO NOT MODIFY siblings: contacts/route.ts remains untouched (exports GET + PATCH).
 */

export type CsmProjectRow = {
  phase: 'aprovacao' | 'execucao'
  cnpj: string
  identifier: string               // nr_convenio for execucao, nr_proposta for aprovacao
  nr_proposta: string
  objeto: string | null
  situacao: string | null
  valor_global: number | null
  valor_repasse: number | null
  valor_desembolsado: number | null
  saldo_conta: number | null
  rendimento_aplicacao: number | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  uf: string | null
  municipio: string | null
  priority_level: 1 | 2 | 3 | 4 | 5 | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Normalise CNPJ — incoming param may have punctuation
  const cnpjDigits = (params.cnpj || '').replace(/\D/g, '')
  if (cnpjDigits.length !== 14) {
    return NextResponse.json({ error: 'CNPJ must contain 14 digits' }, { status: 400 })
  }

  const execList = Array.from(EXECUCAO_NR_PROPOSTAS)
  const aprList = Array.from(APROVACAO_NR_PROPOSTAS)

  try {
    const result = await query<{
      phase: string
      cnpj: string
      identifier: string
      nr_proposta: string
      objeto: string | null
      situacao: string | null
      valor_global: string | null
      valor_repasse: string | null
      valor_desembolsado: string | null
      saldo_conta: string | null
      rendimento_aplicacao: string | null
      data_inicio_vigencia: string | null
      data_fim_vigencia: string | null
      uf: string | null
      municipio: string | null
      priority_level: string | null
    }>(`
      WITH exec_rows AS NOT MATERIALIZED (
        SELECT
          'execucao'::text AS phase,
          pe.cnpj,
          pe.nr_convenio AS identifier,
          pe.nr_proposta,
          pe.objeto,
          pe.situacao,
          pe.valor_global,
          pe.valor_repasse,
          pe.valor_desembolsado,
          pe.saldo_conta,
          pe.rendimento_aplicacao,
          pe.data_inicio_vigencia,
          pe.data_fim_vigencia,
          pe.uf,
          pe.municipio,
          CASE
            WHEN pe.saldo_conta > 0 THEN 1
            WHEN COALESCE(pe.valor_desembolsado, 0) = 0 AND pe.situacao ILIKE 'em execu%' THEN 2
            WHEN pe.rendimento_aplicacao > 0 THEN 3
            WHEN pe.situacao ILIKE '%presta%conta%' THEN 5
            ELSE NULL
          END AS priority_level
        FROM projetos_execucao pe
        WHERE pe.cnpj = $1 AND pe.nr_proposta = ANY($2::text[])
        UNION ALL
        SELECT
          'execucao'::text,
          pe.cnpj,
          pe.nr_convenio,
          pe.nr_proposta,
          pe.objeto,
          pe.situacao,
          pe.valor_global,
          pe.valor_repasse,
          pe.valor_desembolsado,
          pe.saldo_conta,
          pe.rendimento_aplicacao,
          pe.data_inicio_vigencia,
          pe.data_fim_vigencia,
          pe.uf,
          pe.municipio,
          CASE
            WHEN pe.saldo_conta > 0 THEN 1
            WHEN COALESCE(pe.valor_desembolsado, 0) = 0 AND pe.situacao ILIKE 'em execu%' THEN 2
            WHEN pe.rendimento_aplicacao > 0 THEN 3
            WHEN pe.situacao ILIKE '%presta%conta%' THEN 5
            ELSE NULL
          END
        FROM tgov_projetos_execucao pe
        WHERE pe.cnpj = $1 AND pe.nr_proposta = ANY($2::text[])
          AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
      ),
      apr_rows AS NOT MATERIALIZED (
        SELECT
          'aprovacao'::text AS phase,
          REGEXP_REPLACE(p.proponente_cnpj, '[^0-9]', '', 'g') AS cnpj,
          p.nr_proposta AS identifier,
          p.nr_proposta,
          p.objeto,
          p.situacao,
          p.valor_global::numeric,
          p.valor_repasse::numeric,
          NULL::numeric AS valor_desembolsado,
          NULL::numeric AS saldo_conta,
          NULL::numeric AS rendimento_aplicacao,
          p.data_inicio_vigencia,
          p.data_fim_vigencia,
          p.estado AS uf,
          p.municipio,
          4 AS priority_level
        FROM propostas p
        WHERE REGEXP_REPLACE(p.proponente_cnpj, '[^0-9]', '', 'g') = $1
          AND p.nr_proposta = ANY($3::text[])
        UNION ALL
        SELECT
          'aprovacao'::text,
          REGEXP_REPLACE(tp.proponente_cnpj, '[^0-9]', '', 'g'),
          tp.nr_proposta,
          tp.nr_proposta,
          tp.objeto,
          tp.situacao,
          tp.valor_global::numeric,
          tp.valor_repasse::numeric,
          NULL::numeric,
          NULL::numeric,
          NULL::numeric,
          tp.data_inicio_vigencia,
          tp.data_fim_vigencia,
          tp.estado,
          tp.municipio,
          4
        FROM tgov_propostas tp
        WHERE REGEXP_REPLACE(tp.proponente_cnpj, '[^0-9]', '', 'g') = $1
          AND tp.nr_proposta = ANY($3::text[])
          AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.nr_proposta = tp.nr_proposta)
      )
      SELECT * FROM exec_rows
      UNION ALL
      SELECT * FROM apr_rows
      ORDER BY priority_level NULLS LAST, identifier
    `, [cnpjDigits, execList, aprList])

    return NextResponse.json({
      cnpj: cnpjDigits,
      projects: result.map(r => ({
        phase: r.phase as 'aprovacao' | 'execucao',
        cnpj: r.cnpj,
        identifier: String(r.identifier ?? ''),
        nr_proposta: String(r.nr_proposta ?? ''),
        objeto: r.objeto as string | null,
        situacao: r.situacao as string | null,
        valor_global: r.valor_global == null ? null : Number(r.valor_global),
        valor_repasse: r.valor_repasse == null ? null : Number(r.valor_repasse),
        valor_desembolsado: r.valor_desembolsado == null ? null : Number(r.valor_desembolsado),
        saldo_conta: r.saldo_conta == null ? null : Number(r.saldo_conta),
        rendimento_aplicacao: r.rendimento_aplicacao == null ? null : Number(r.rendimento_aplicacao),
        data_inicio_vigencia: r.data_inicio_vigencia ? String(r.data_inicio_vigencia) : null,
        data_fim_vigencia: r.data_fim_vigencia ? String(r.data_fim_vigencia) : null,
        uf: r.uf as string | null,
        municipio: r.municipio as string | null,
        priority_level: r.priority_level == null ? null : Number(r.priority_level) as 1 | 2 | 3 | 4 | 5,
      })),
    })
  } catch (error) {
    console.error('[api/csm/clients/[cnpj]/projects] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
