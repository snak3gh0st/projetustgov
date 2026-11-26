import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { commercialActivity, validActivityDate } from '@/lib/commercial-activity'
import { todaySP } from '@/lib/conta-azul/finance/dates'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const manager = ['gestor', 'diretoria', 'admin'].includes(session.role)
  if (!manager && !['vendedor', 'coordenador'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const sp = new URL(request.url).searchParams
  const day = sp.get('data') ?? todaySP()
  const seller = manager ? sp.get('vendedor_id') || null : session.userId
  if (!validActivityDate(day) || (seller && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seller))) {
    return NextResponse.json({ error: 'Data ou consultor inválido.' }, { status: 400 })
  }
  try { return NextResponse.json(await commercialActivity(day, seller), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (error) {
    console.error('[atividade-diaria]', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Não foi possível carregar a atividade diária.' }, { status: 500 })
  }
}
