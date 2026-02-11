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
      SELECT faixa, quantidade FROM (
        SELECT
          CASE
            WHEN COALESCE(agg.total_propostas, 0) = 1 THEN '1 proposta (Alto Valor)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN '2-3 propostas (Bom Valor)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN '4-5 propostas (Medio)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN '6-10 propostas (Baixo)'
            ELSE '10+ propostas (Muito Baixo)'
          END as faixa,
          CASE
            WHEN COALESCE(agg.total_propostas, 0) = 1 THEN 1
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN 2
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN 3
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN 4
            ELSE 5
          END as sort_order,
          COUNT(*) as quantidade
        FROM proponentes p
        LEFT JOIN (
          SELECT proponente_cnpj, COUNT(*) as total_propostas
          FROM propostas
          GROUP BY proponente_cnpj
        ) agg ON p.cnpj = agg.proponente_cnpj
        WHERE p.natureza_juridica NOT ILIKE '%Administra%'
        GROUP BY faixa, sort_order
      ) sub
      ORDER BY sort_order
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Distribution chart error:', error)
    return NextResponse.json({ error: 'Failed to fetch distribution' }, { status: 500 })
  }
}
