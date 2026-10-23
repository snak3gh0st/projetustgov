import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET /api/tgov/valor-contrato?cnpj=...
// Valor do contrato fechado pelo Comercial para o CNPJ: mesma regra do
// valor_venda_fechado de /api/execucao (soma das vendas fechadas com valor).
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cnpj = (new URL(request.url).searchParams.get('cnpj') ?? '').replace(/\D/g, '')
    if (cnpj.length !== 14) {
      return NextResponse.json({ error: 'cnpj inválido' }, { status: 400 })
    }

    const rows = await query<{ valor: string | null; vendas: string; sem_valor: string }>(
      `SELECT
         SUM(valor_venda) FILTER (WHERE valor_venda > 0) AS valor,
         COUNT(*) AS vendas,
         COUNT(*) FILTER (WHERE COALESCE(valor_venda, 0) <= 0) AS sem_valor
       FROM vendedor_projetos
       WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1
         AND status_contato IN ('Fechado', 'Em Aprovação', 'Vendas Concluídas')`,
      [cnpj],
    )
    const r = rows[0]
    return NextResponse.json({
      valor: r?.valor != null ? Number(r.valor) : null,
      vendas: Number(r?.vendas ?? 0),
      semValor: Number(r?.sem_valor ?? 0),
    })
  } catch (error) {
    console.error('[api/tgov/valor-contrato][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch valor do contrato' }, { status: 500 })
  }
}
