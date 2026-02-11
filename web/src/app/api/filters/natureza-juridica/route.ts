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
      SELECT DISTINCT natureza_juridica
      FROM proponentes
      WHERE natureza_juridica NOT ILIKE '%Administra%'
      AND natureza_juridica IS NOT NULL
      ORDER BY natureza_juridica
    `)

    return NextResponse.json(rows.map((r: Record<string, unknown>) => r.natureza_juridica))
  } catch (error) {
    console.error('Natureza juridica filter error:', error)
    return NextResponse.json({ error: 'Failed to fetch natureza juridica' }, { status: 500 })
  }
}
