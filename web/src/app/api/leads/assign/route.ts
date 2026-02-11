import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { lead_ids, vendedor_id } = body

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'lead_ids must be a non-empty array' }, { status: 400 })
    }

    if (!vendedor_id || typeof vendedor_id !== 'string') {
      return NextResponse.json({ error: 'vendedor_id is required' }, { status: 400 })
    }

    const result = await query(
      `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE id = ANY($2)`,
      [vendedor_id, lead_ids]
    )

    return NextResponse.json({ success: true, assigned_count: result.length ?? lead_ids.length })
  } catch (error) {
    console.error('Assign leads error:', error)
    return NextResponse.json({ error: 'Failed to assign leads' }, { status: 500 })
  }
}
