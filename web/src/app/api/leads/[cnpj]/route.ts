import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, verifyLeadAccess } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    // Auth check
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    // Verify lead access for vendedor role
    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query(
      `SELECT
        p.id, p.cnpj, p.nome, p.email, p.telefone,
        p.endereco, p.bairro, p.municipio, p.estado, p.cep,
        p.natureza_juridica,
        COALESCE(agg.total_propostas, 0)::int as total_propostas,
        COALESCE(agg.total_emendas, 0)::int as total_emendas,
        COALESCE(agg.valor_total_emendas, 0)::numeric as valor_total_emendas,
        COALESCE(agg.total_convenios, 0)::int as total_convenios,
        COALESCE(agg.valor_total_desembolsos, 0)::numeric as valor_total_desembolsos,
        p.is_existing_client, p.is_osc
      FROM proponentes p
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
      WHERE p.cnpj = $1`,
      [cnpj]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const r = rows[0] as Record<string, unknown>
    return NextResponse.json({
      ...r,
      valor_total_emendas: Number(r.valor_total_emendas) || 0,
      valor_total_desembolsos: Number(r.valor_total_desembolsos) || 0,
    })
  } catch (error) {
    console.error('Lead detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}
