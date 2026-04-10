import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'
import { APROVACAO_NR_PROPOSTAS, EXECUCAO_NR_PROPOSTAS, buildNrPropostaWhereClause } from '@/lib/tgov'
import { ensureTgovTables } from '@/lib/tgov-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Server-side cache: avoids rescanning propostas on every request.
// Key: `${tab}:${userId|global}` — projetista_execucao is scoped to user.
const _cache = new Map<string, { data: { byStatus: { status: string; count: number }[] }; expiresAt: number }>()
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

/**
 * Lightweight pipeline stats endpoint.
 * Returns only byStatus counts — no table rows, no BI charts.
 * Used by /tgov/pipeline to avoid running the full aprovacao/execucao APIs.
 *
 * Query param: tab = 'aprovacao' | 'execucao' | 'prestacao_contas'
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureTgovTables()

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') ?? 'aprovacao'

    // Cache lookup — projetista_execucao scoped to userId, everyone else shares
    const cacheKey = `${tab}:${session.role === 'projetista_execucao' ? session.userId : 'global'}`
    const cached = _cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data)
    }

    const params: unknown[] = []
    let byStatusRows: { situacao: string; cnt: number }[] = []

    if (tab === 'aprovacao') {
      // ---- Aprovação: propostas whitelist ----
      // Materialize the whitelist first (small set), then join — avoids correlated EXISTS per row
      const staticClause = buildNrPropostaWhereClause('p.nr_proposta', params, APROVACAO_NR_PROPOSTAS)
      byStatusRows = await query<{ situacao: string; cnt: number }>(
        `WITH
          wl AS MATERIALIZED (
            SELECT cnpj, nr_proposta FROM tgov_whitelist
            WHERE tab IN ('ambos', 'aprovacao')
          ),
          matched AS MATERIALIZED (
            SELECT p.situacao
            FROM propostas p
            WHERE ${staticClause}
               OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = p.proponente_cnpj OR wl.nr_proposta = p.nr_proposta)
            UNION ALL
            SELECT p.situacao
            FROM tgov_propostas p
            WHERE (
              ${staticClause.replace(/p\.nr_proposta/g, 'p.nr_proposta')}
              OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = p.proponente_cnpj OR wl.nr_proposta = p.nr_proposta)
            )
            AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.transfer_gov_id = p.transfer_gov_id)
          )
        SELECT
          COALESCE(situacao, 'Sem Situação') AS situacao,
          COUNT(*)::int AS cnt
        FROM matched
        GROUP BY situacao
        ORDER BY COUNT(*) DESC`,
        params
      )
    } else {
      // ---- Execução / Prestação de Contas ----
      const nrPropostaClausePe = buildNrPropostaWhereClause('pe.nr_proposta', params, EXECUCAO_NR_PROPOSTAS)
      const nrPropostaClauseP = nrPropostaClausePe.replace(/^pe\.nr_proposta/, 'p.nr_proposta')

      const modeCondition = tab === 'execucao'
        ? `LOWER(pe.situacao) = 'em execução'`
        : `pe.situacao ILIKE '%Prestação de Contas%'`

      // projetista_execucao only sees records assigned to them
      let tecnicoFilter = ''
      if (session.role === 'projetista_execucao') {
        params.push(session.userId)
        tecnicoFilter = `AND pe.tecnico_id = $${params.length}::uuid`
      }

      byStatusRows = await query<{ situacao: string; cnt: number }>(
        `WITH wl AS MATERIALIZED (
          SELECT nr_proposta, cnpj FROM tgov_whitelist WHERE tab IN ('ambos', 'execucao')
        ),
        all_exec AS NOT MATERIALIZED (
          SELECT pe.nr_proposta, pe.situacao, pe.cnpj, pe.tecnico_id
          FROM projetos_execucao pe
          WHERE pe.nr_proposta IS NOT NULL
            AND (
              ${nrPropostaClausePe}
              OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = pe.cnpj OR wl.nr_proposta = pe.nr_proposta)
            )

          UNION ALL

          SELECT pe.nr_proposta, pe.situacao, pe.cnpj, pe.tecnico_id
          FROM tgov_projetos_execucao pe
          WHERE pe.nr_proposta IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio
            )

          UNION ALL

          SELECT p.nr_proposta, p.situacao, p.proponente_cnpj AS cnpj, p.tecnico_id
          FROM propostas p
          WHERE p.nr_proposta IS NOT NULL
            AND (
              ${nrPropostaClauseP}
              OR EXISTS (SELECT 1 FROM wl WHERE wl.cnpj = p.proponente_cnpj OR wl.nr_proposta = p.nr_proposta)
            )
            AND NOT EXISTS (SELECT 1 FROM projetos_execucao pe2 WHERE pe2.nr_proposta = p.nr_proposta)
            AND NOT EXISTS (SELECT 1 FROM tgov_projetos_execucao pe3 WHERE pe3.nr_proposta = p.nr_proposta)

          UNION ALL

          SELECT p.nr_proposta, p.situacao, p.proponente_cnpj AS cnpj, p.tecnico_id
          FROM tgov_propostas p
          WHERE p.nr_proposta IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_proposta = p.nr_proposta)
            AND NOT EXISTS (SELECT 1 FROM tgov_projetos_execucao crm WHERE crm.nr_proposta = p.nr_proposta)
        )
        SELECT
          COALESCE(pe.situacao, 'Sem Situação') AS situacao,
          COUNT(*)::int AS cnt
        FROM all_exec pe
        WHERE ${modeCondition} ${tecnicoFilter}
        GROUP BY pe.situacao
        ORDER BY COUNT(*) DESC`,
        params
      )
    }

    const byStatus = byStatusRows.map(r => ({
      status: r.situacao,
      count: Number(r.cnt),
    }))

    const responseData = { byStatus }
    _cache.set(cacheKey, { data: responseData, expiresAt: Date.now() + CACHE_TTL })

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Pipeline stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch pipeline stats' }, { status: 500 })
  }
}
