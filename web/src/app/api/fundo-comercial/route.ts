import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// Fundo Comercial: 2% de toda venda fechada, com débitos manuais (gestor) para incentivos ao time.
// Saldo = soma de créditos - soma de débitos, calculado on-the-fly.

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'gestor_financeiro')) {
      return NextResponse.json({ error: 'Forbidden: financeiro only' }, { status: 403 })
    }

    const [lancamentos, saldoRows] = await Promise.all([
      query(`
        SELECT l.id, l.tipo, l.valor, l.descricao, l.lead_id, l.criado_em, u.nome as criado_por_nome
        FROM fundo_comercial_lancamentos l
        JOIN users u ON u.id = l.criado_por
        ORDER BY l.criado_em DESC
        LIMIT 500
      `),
      query<{ saldo: string }>(`
        SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END), 0)::numeric as saldo
        FROM fundo_comercial_lancamentos
      `),
    ])

    return NextResponse.json({
      saldo: Number(saldoRows[0]?.saldo) || 0,
      lancamentos,
    })
  } catch (error) {
    console.error('Fundo comercial GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch fundo comercial' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'gestor_financeiro')) {
      return NextResponse.json({ error: 'Forbidden: financeiro only' }, { status: 403 })
    }

    const body = await request.json()
    const valor = Number(body.valor)
    const descricao = String(body.descricao || '').trim()

    if (!valor || valor <= 0) {
      return NextResponse.json({ error: 'valor must be > 0' }, { status: 400 })
    }
    if (!descricao) {
      return NextResponse.json({ error: 'descricao is required' }, { status: 400 })
    }

    await query(`
      INSERT INTO fundo_comercial_lancamentos (tipo, valor, descricao, criado_por)
      VALUES ('debito', $1, $2, $3)
    `, [valor, descricao, session.userId])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Fundo comercial POST error:', error)
    return NextResponse.json({ error: 'Failed to create lancamento' }, { status: 500 })
  }
}
