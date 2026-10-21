import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { AUTOMATIC_ORIGINS, fetchLeadEvents, leadEventsReady } from '@/lib/lead-events'

export const dynamic = 'force-dynamic'

const CRM_ROLES = ['gestor', 'admin', 'visualizador', 'vendedor', 'coordenador']

// Atividade Recente da tela inicial: movimentações feitas por pessoas
// (status e atribuição), lidas do histórico lead_events. A tela consulta a cada 60s.
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!CRM_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!(await leadEventsReady())) {
      return NextResponse.json({ events: [] })
    }

    const params: unknown[] = [AUTOMATIC_ORIGINS]
    let scope = ''
    if (session.role === 'vendedor') {
      params.push(session.userId)
      scope = `AND vp.vendedor_id = $2`
    } else if (session.role === 'coordenador') {
      params.push(session.userId)
      scope = `AND (vp.vendedor_id = $2 OR vp.closer_id = $2)`
    }

    const events = await fetchLeadEvents(`e.origem <> ALL($1) ${scope}`, params, 15, {
      includeCommission: session.role === 'gestor',
    })
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Atividade recente error:', error)
    return NextResponse.json({ error: 'Failed to load recent activity' }, { status: 500 })
  }
}
