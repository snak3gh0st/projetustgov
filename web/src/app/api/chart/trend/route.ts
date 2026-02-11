import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const granularity = searchParams.get('granularity') || 'monthly'

    const periodExpr = granularity === 'monthly'
      ? "DATE_TRUNC('month', data_publicacao)"
      : "EXTRACT(YEAR FROM data_publicacao)"

    const rows = await query(`
      SELECT
        ${periodExpr} as periodo,
        COUNT(*) as total_propostas,
        SUM(valor_global) as valor_total
      FROM propostas
      WHERE data_publicacao IS NOT NULL
      GROUP BY periodo
      ORDER BY periodo ASC
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Trend chart error:', error)
    return NextResponse.json({ error: 'Failed to fetch trend data' }, { status: 500 })
  }
}
