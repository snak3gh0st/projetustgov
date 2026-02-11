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
      SELECT DISTINCT estado
      FROM proponentes
      WHERE natureza_juridica NOT ILIKE '%Administra%'
      AND estado IS NOT NULL
      ORDER BY estado
    `)

    return NextResponse.json(rows.map((r: Record<string, unknown>) => r.estado))
  } catch (error) {
    console.error('Estados filter error:', error)
    return NextResponse.json({ error: 'Failed to fetch estados' }, { status: 500 })
  }
}
