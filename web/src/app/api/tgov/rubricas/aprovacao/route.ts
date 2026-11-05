import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canAprovarRubricas } from '@/lib/dal'
import { totalRubricas } from '@/lib/rubricas'
import { loadAprovacao } from '@/lib/rubricas-aprovacao'

export const dynamic = 'force-dynamic'

// POST /api/tgov/rubricas/aprovacao  body: { nr_proposta } — aprova as rubricas
// atuais e libera para a Execução. Salvar as linhas de novo tira a aprovação.
export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canAprovarRubricas(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null) as { nr_proposta?: unknown; linhas?: unknown; total?: unknown } | null
    const nrProposta = typeof payload?.nr_proposta === 'string' ? payload.nr_proposta.trim() : ''
    if (!nrProposta) {
      return NextResponse.json({ error: 'nr_proposta obrigatório' }, { status: 400 })
    }

    // Aprova o que a pessoa está vendo: se alguém salvou no meio, recusa.
    const atuais = await query<{ meses: number; valor_unitario: string }>(
      `SELECT meses, valor_unitario FROM tgov_rubricas WHERE nr_proposta = $1`,
      [nrProposta],
    )
    if (atuais.length === 0) {
      return NextResponse.json({ error: 'Cadastre ao menos uma rubrica antes de aprovar' }, { status: 400 })
    }
    const total = totalRubricas(atuais.map(r => ({ meses: Number(r.meses), valorUnitario: Number(r.valor_unitario) })))
    if (payload?.linhas !== atuais.length || payload?.total !== total) {
      return NextResponse.json({ error: 'As rubricas mudaram. Recarregue o card antes de aprovar.' }, { status: 409 })
    }

    await query(
      `INSERT INTO tgov_rubricas_aprovacao (nr_proposta, aprovado_por)
       VALUES ($1, $2)
       ON CONFLICT (nr_proposta) DO UPDATE SET aprovado_por = EXCLUDED.aprovado_por, aprovado_em = now()`,
      [nrProposta, session.userId],
    )

    return NextResponse.json({ aprovacao: await loadAprovacao(nrProposta) })
  } catch (error) {
    console.error('[api/tgov/rubricas/aprovacao][POST] error:', error)
    return NextResponse.json({ error: 'Failed to aprovar rubricas' }, { status: 500 })
  }
}
