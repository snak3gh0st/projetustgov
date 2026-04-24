import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'
import { APROVACAO_NR_PROPOSTAS, EXECUCAO_NR_PROPOSTAS } from '@/lib/tgov'
import { ensureTgovTables } from '@/lib/tgov-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Server-side cache — avoids rescanning propostas on every page load.
const _cache = new Map<string, { data: { byStatus: { status: string; count: number }[] }; expiresAt: number }>()
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

// Pre-compute static whitelist arrays (strip leading zeros, done once at module load)
const APROVACAO_WL = Array.from(APROVACAO_NR_PROPOSTAS).map(id => id.replace(/^0+/, ''))
const EXECUCAO_WL = Array.from(EXECUCAO_NR_PROPOSTAS).map(id => id.replace(/^0+/, ''))

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureTgovTables()

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') ?? 'aprovacao'

    const cacheKey = `${tab}:global`
    const cached = _cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data)
    }

    let byStatusRows: { situacao: string; cnt: number }[]

    if (tab === 'aprovacao') {
      // Step 1: Fetch dynamic whitelist (tiny table, ~ms)
      const wlRows = await query<{ nr_proposta: string | null; cnpj: string | null }>(
        `SELECT nr_proposta, cnpj FROM tgov_whitelist WHERE tab IN ('ambos', 'aprovacao')`
      )
      const wlNrPropostas = wlRows.map(r => r.nr_proposta).filter(Boolean) as string[]
      const wlCnpjs = wlRows.map(r => r.cnpj).filter(Boolean) as string[]

      // Merge static + dynamic whitelist into arrays
      const allNrPropostas = [...APROVACAO_WL, ...wlNrPropostas]
      const allCnpjs = wlCnpjs

      // Step 2: Use = ANY() arrays — Postgres can use bitmap index scans, no correlated EXISTS
      byStatusRows = await query<{ situacao: string; cnt: number }>(
        `SELECT COALESCE(situacao, 'Sem Situação') AS situacao, COUNT(*)::int AS cnt FROM (
          SELECT situacao FROM propostas
          WHERE nr_proposta = ANY($1::text[]) OR proponente_cnpj = ANY($2::text[])
          UNION ALL
          SELECT situacao FROM tgov_propostas p
          WHERE (nr_proposta = ANY($1::text[]) OR proponente_cnpj = ANY($2::text[]))
            AND NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.transfer_gov_id = p.transfer_gov_id)
        ) sub
        GROUP BY situacao ORDER BY cnt DESC`,
        [allNrPropostas, allCnpjs]
      )
    } else {
      // Step 1: dynamic whitelist
      const wlRows = await query<{ nr_proposta: string | null; cnpj: string | null }>(
        `SELECT nr_proposta, cnpj FROM tgov_whitelist WHERE tab IN ('ambos', 'execucao')`
      )
      const wlNrPropostas = wlRows.map(r => r.nr_proposta).filter(Boolean) as string[]
      const wlCnpjs = wlRows.map(r => r.cnpj).filter(Boolean) as string[]
      const allNrPropostas = [...EXECUCAO_WL, ...wlNrPropostas]
      const allCnpjs = wlCnpjs

      const modeFilter = tab === 'execucao'
        ? `LOWER(situacao) = 'em execução'`
        : `situacao ILIKE '%Prestação de Contas%'`

      const params: unknown[] = [allNrPropostas, allCnpjs]
      const tecnicoFilter = ''

      // Step 2: query with arrays
      byStatusRows = await query<{ situacao: string; cnt: number }>(
        `SELECT COALESCE(situacao, 'Sem Situação') AS situacao, COUNT(*)::int AS cnt FROM (
          SELECT situacao, tecnico_id FROM projetos_execucao
          WHERE nr_proposta IS NOT NULL
            AND (nr_proposta = ANY($1::text[]) OR cnpj = ANY($2::text[]))
          UNION ALL
          SELECT situacao, tecnico_id FROM tgov_projetos_execucao pe
          WHERE nr_proposta IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
          UNION ALL
          SELECT situacao, tecnico_id FROM propostas
          WHERE nr_proposta IS NOT NULL
            AND (nr_proposta = ANY($1::text[]) OR proponente_cnpj = ANY($2::text[]))
            AND NOT EXISTS (SELECT 1 FROM projetos_execucao pe2 WHERE pe2.nr_proposta = propostas.nr_proposta)
            AND NOT EXISTS (SELECT 1 FROM tgov_projetos_execucao pe3 WHERE pe3.nr_proposta = propostas.nr_proposta)
          UNION ALL
          SELECT situacao, tecnico_id FROM tgov_propostas p
          WHERE nr_proposta IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_proposta = p.nr_proposta)
            AND NOT EXISTS (SELECT 1 FROM tgov_projetos_execucao crm WHERE crm.nr_proposta = p.nr_proposta)
        ) sub
        WHERE ${modeFilter} ${tecnicoFilter}
        GROUP BY situacao ORDER BY cnt DESC`,
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
