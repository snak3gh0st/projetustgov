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
        COUNT(*) as total_leads,
        COUNT(CASE WHEN p.is_existing_client = true THEN 1 END) as existing_clients,
        COUNT(CASE WHEN p.is_existing_client = false THEN 1 END) as new_leads,
        SUM(COALESCE(agg.total_emendas, 0)) as total_emendas,
        SUM(COALESCE(agg.valor_total_emendas, 0)) as total_valor_emendas,
        AVG(COALESCE(agg.total_propostas, 0)) as avg_propostas,
        COUNT(CASE WHEN COALESCE(agg.total_propostas, 0) <= 3 THEN 1 END) as high_value_leads,
        SUM(COALESCE(agg.total_convenios, 0)) as total_convenios,
        SUM(COALESCE(agg.valor_total_desembolsos, 0)) as total_valor_desembolsos
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
      WHERE p.natureza_juridica NOT ILIKE '%Administra%'
    `)

    const row = rows[0]
    return NextResponse.json({
      total_leads: Number(row.total_leads) || 0,
      existing_clients: Number(row.existing_clients) || 0,
      new_leads: Number(row.new_leads) || 0,
      total_emendas: Number(row.total_emendas) || 0,
      total_valor_emendas: Number(row.total_valor_emendas) || 0,
      avg_propostas: Number(row.avg_propostas) || 0,
      high_value_leads: Number(row.high_value_leads) || 0,
      total_convenios: Number(row.total_convenios) || 0,
      total_valor_desembolsos: Number(row.total_valor_desembolsos) || 0,
    })
  } catch (error) {
    console.error('Stats query error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
