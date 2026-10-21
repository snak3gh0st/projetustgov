import { NextRequest, NextResponse } from 'next/server'
import { getApiSession, verifyLeadAccess } from '@/lib/dal'
import { fetchLeadEvents, leadEventsReady } from '@/lib/lead-events'

export const dynamic = 'force-dynamic'

// GET /api/leads/[cnpj]/historico - Movimentação do lead (status e atribuição), com data e hora
export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cnpj = decodeURIComponent(params.cnpj)
    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!(await leadEventsReady())) {
      return NextResponse.json({ events: [] })
    }

    const events = await fetchLeadEvents(
      `REGEXP_REPLACE(e.cnpj, '[^0-9]', '', 'g') = $1`,
      [cnpj.replace(/\D/g, '')],
      100
    )
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Lead historico error:', error)
    return NextResponse.json({ error: 'Failed to load lead history' }, { status: 500 })
  }
}
