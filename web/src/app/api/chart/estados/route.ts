import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await query(`
      SELECT
        p.estado,
        COUNT(*)::int as total_proponentes,
        SUM(COALESCE(agg.total_emendas, 0))::int as total_emendas,
        SUM(COALESCE(agg.valor_total_emendas, 0))::float as total_valor_emendas
      FROM proponentes p
      LEFT JOIN (
        SELECT
          prop.proponente_cnpj,
          COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
          COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas
        FROM propostas prop
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        GROUP BY prop.proponente_cnpj
      ) agg ON p.cnpj = agg.proponente_cnpj
      WHERE p.natureza_juridica NOT ILIKE '%Administra%'
      AND p.estado IS NOT NULL
      GROUP BY p.estado
      ORDER BY total_proponentes DESC
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Estados chart error:', error)
    return NextResponse.json({ error: 'Failed to fetch estados data' }, { status: 500 })
  }
}
