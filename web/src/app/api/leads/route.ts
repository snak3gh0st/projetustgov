import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, buildVendedorFilter } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')
    const search = searchParams.get('search')
    const maxPropostas = searchParams.get('max_propostas')
    const minEmendas = searchParams.get('min_emendas')
    const isNewLead = searchParams.get('is_new_lead')
    const semContato = searchParams.get('sem_contato')
    const naturezaJuridica = searchParams.get('natureza_juridica')
    const limit = searchParams.get('limit') || '500'

    const conditions: string[] = ["p.natureza_juridica NOT ILIKE '%Administra%'"]
    const params: unknown[] = []
    let paramIndex = 1

    if (isNewLead === 'true') {
      conditions.push('p.is_existing_client = false')
    }

    if (estado) {
      conditions.push(`p.estado = $${paramIndex++}`)
      params.push(estado)
    }

    if (maxPropostas) {
      conditions.push(`COALESCE(agg.total_propostas, 0) <= $${paramIndex++}`)
      params.push(Number(maxPropostas))
    }

    if (minEmendas) {
      conditions.push(`COALESCE(agg.total_emendas, 0) >= $${paramIndex++}`)
      params.push(Number(minEmendas))
    }

    if (search) {
      conditions.push(`(p.nome ILIKE $${paramIndex} OR p.cnpj LIKE $${paramIndex})`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (naturezaJuridica) {
      conditions.push(`p.natureza_juridica = $${paramIndex++}`)
      params.push(naturezaJuridica)
    }

    if (semContato === 'true') {
      conditions.push("(p.email IS NULL OR p.email = '') AND (p.telefone IS NULL OR p.telefone = '')")
    }

    // Add vendedor filter if role is vendedor
    const vendedorFilter = buildVendedorFilter(session.role, session.userId, paramIndex)
    if (vendedorFilter.clause) {
      conditions.push(vendedorFilter.clause)
      params.push(...vendedorFilter.params)
      paramIndex = vendedorFilter.nextIndex
    }

    params.push(Number(limit))

    const rows = await query(
      `SELECT
        p.id, p.cnpj, p.nome, p.natureza_juridica, p.estado, p.municipio,
        COALESCE(agg.total_propostas, 0)::int as total_propostas,
        COALESCE(agg.total_emendas, 0)::int as total_emendas,
        COALESCE(agg.valor_total_emendas, 0)::numeric as valor_total_emendas,
        COALESCE(agg.total_convenios, 0)::int as total_convenios,
        COALESCE(agg.valor_total_desembolsos, 0)::numeric as valor_total_desembolsos,
        p.email, p.telefone, p.is_osc, p.is_existing_client
      FROM proponentes p
      ${session.role === 'vendedor' ? 'LEFT JOIN lead_assignments la ON p.cnpj = la.lead_cnpj' : ''}
      LEFT JOIN (
        SELECT
          prop.proponente_cnpj,
          COUNT(DISTINCT prop.id) as total_propostas,
          COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
          COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
          COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
          COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
        FROM propostas prop
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
        GROUP BY prop.proponente_cnpj
      ) agg ON p.cnpj = agg.proponente_cnpj
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        p.is_existing_client DESC,
        COALESCE(agg.total_propostas, 0) ASC,
        COALESCE(agg.total_emendas, 0) DESC,
        p.nome ASC
      LIMIT $${paramIndex}`,
      params
    )

    const parsed = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      valor_total_emendas: Number(r.valor_total_emendas) || 0,
      valor_total_desembolsos: Number(r.valor_total_desembolsos) || 0,
    }))
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Leads query error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}
