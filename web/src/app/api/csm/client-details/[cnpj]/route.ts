import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'
import { EXECUCAO_NR_PROPOSTAS } from '@/lib/tgov'

export const dynamic = 'force-dynamic'

/**
 * GET /api/csm/client-details/[cnpj]
 *
 * Aggregates contacts + projects + location for the CSM side card.
 *
 * Auth gate: canCsm() — 403 for non-csm/gestor/admin.
 * CNPJ gate: 14 digits required — 400 for invalid length.
 *
 * Returns:
 *   - cnpj: normalized 14-digit CNPJ
 *   - contacts: from lead_contacts (ordered by principal DESC)
 *   - projects: from execution projects (filtered by EXECUCAO_NR_PROPOSTAS whitelist)
 *   - location: { uf, municipio } from the most recent project
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Normalise CNPJ — incoming param may have punctuation
  const cnpjDigits = decodeURIComponent(params.cnpj || '').replace(/\D/g, '')
  if (cnpjDigits.length !== 14) {
    return NextResponse.json({ error: 'CNPJ must contain 14 digits' }, { status: 400 })
  }

  const execList = Array.from(EXECUCAO_NR_PROPOSTAS)

  try {
    // Fetch contacts
    const contacts = await query<{
      id: number
      lead_cnpj: string
      nome_pessoa: string | null
      cargo: string | null
      telefone: string | null
      email: string | null
      principal: boolean
      status_contato: string | null
      created_at: string
      created_by: number | null
      created_by_nome: string | null
    }>(`
      SELECT lc.*, u.nome as created_by_nome
      FROM lead_contacts lc
      LEFT JOIN users u ON lc.created_by = u.id
      WHERE lc.lead_cnpj = $1
      ORDER BY lc.principal DESC, lc.created_at ASC
    `, [cnpjDigits])

    // Fetch execution projects
    const projects = await query<{
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
      SELECT * FROM (
        SELECT
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
        FROM tgov_projetos_execucao pe
        WHERE pe.cnpj = $1 AND pe.nr_proposta = ANY($2::text[])
          AND NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = pe.nr_convenio)
      ) AS projects
      ORDER BY priority_level NULLS LAST, identifier
    `, [cnpjDigits, execList])

    // Get location from most recent project (or any project with location data)
    const location = (() => {
      const projectWithLocation = projects.find(p => p.uf && p.municipio)
      if (projectWithLocation) {
        return {
          uf: projectWithLocation.uf,
          municipio: projectWithLocation.municipio
        }
      }
      return { uf: null, municipio: null }
    })()

    return NextResponse.json({
      cnpj: cnpjDigits,
      contacts: contacts.map(c => ({
        id: c.id,
        nome_pessoa: c.nome_pessoa,
        cargo: c.cargo,
        telefone: c.telefone,
        email: c.email,
        principal: c.principal,
        status_contato: c.status_contato,
        created_at: c.created_at,
        created_by: c.created_by,
        created_by_nome: c.created_by_nome
      })),
      projects: projects.map(p => ({
        cnpj: p.cnpj,
        identifier: String(p.identifier ?? ''),
        nr_proposta: String(p.nr_proposta ?? ''),
        objeto: p.objeto,
        situacao: p.situacao,
        valor_global: p.valor_global == null ? null : Number(p.valor_global),
        valor_repasse: p.valor_repasse == null ? null : Number(p.valor_repasse),
        valor_desembolsado: p.valor_desembolsado == null ? null : Number(p.valor_desembolsado),
        saldo_conta: p.saldo_conta == null ? null : Number(p.saldo_conta),
        rendimento_aplicacao: p.rendimento_aplicacao == null ? null : Number(p.rendimento_aplicacao),
        data_inicio_vigencia: p.data_inicio_vigencia ? String(p.data_inicio_vigencia) : null,
        data_fim_vigencia: p.data_fim_vigencia ? String(p.data_fim_vigencia) : null,
        uf: p.uf,
        municipio: p.municipio,
        priority_level: p.priority_level == null ? null : Number(p.priority_level) as 1 | 2 | 3 | 5
      })),
      location
    })
  } catch (error) {
    console.error('[api/csm/client-details] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch client details' }, { status: 500 })
  }
}
