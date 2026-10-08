import { NextResponse } from 'next/server'
import { canReadBiFinanceiro, getApiSession } from '@/lib/dal'
import { getTitulo } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canReadBiFinanceiro(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const detail = await getTitulo(params.id)
    if (!detail) return NextResponse.json({ error: 'Título não encontrado' }, { status: 404 })
    return NextResponse.json(detail)
  } catch (error) {
    console.error('[api/financeiro/titulos/id]', error)
    return NextResponse.json({ error: 'Não foi possível carregar o título.' }, { status: 500 })
  }
}
