import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { todaySP } from '@/lib/conta-azul/finance/dates'
import { montarRelatorio } from '@/lib/relatorio-semanal/build'
import { semanaDe } from '@/lib/relatorio-semanal/regras'
import { carregar, listar } from '@/lib/relatorio-semanal/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Retrato gravado da semana pedida; sem ?semana=, o da semana corrente (ou a prévia ao vivo, antes da sexta). */
export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'diretoria' && session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const pedida = new URL(request.url).searchParams.get('semana')
    if (pedida && !/^\d{4}-\d{2}-\d{2}$/.test(pedida)) return NextResponse.json({ error: 'Semana inválida' }, { status: 400 })
    const atual = semanaDe(todaySP()).ate
    const alvo = pedida ?? atual
    const [semanas, gravado] = await Promise.all([listar(), carregar(alvo)])
    if (gravado) return NextResponse.json({ relatorio: gravado.dados, gravado: true, enviadoEm: gravado.enviadoEm, semanas })
    if (alvo !== atual) return NextResponse.json({ error: 'Semana sem relatório gravado' }, { status: 404 })
    return NextResponse.json({ relatorio: await montarRelatorio(), gravado: false, enviadoEm: null, semanas })
  } catch (error) {
    console.error('[api/gestao/relatorio-semanal]', error)
    return NextResponse.json({ error: 'Não foi possível montar o relatório.' }, { status: 500 })
  }
}
