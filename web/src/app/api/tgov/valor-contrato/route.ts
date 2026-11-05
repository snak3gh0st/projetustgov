import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov, canEditRubricas } from '@/lib/dal'

export const dynamic = 'force-dynamic'

interface ValorManual {
  valor: number
  por: string | null
  em: string
}

async function loadManual(nrProposta: string): Promise<ValorManual | null> {
  const rows = await query<{ valor: string; por: string | null; em: string }>(
    `SELECT v.valor, u.nome AS por, v.updated_at AS em
     FROM tgov_valor_contrato v
     LEFT JOIN users u ON u.id = v.updated_by
     WHERE v.nr_proposta = $1`,
    [nrProposta],
  )
  const r = rows[0]
  return r ? { valor: Number(r.valor), por: r.por, em: r.em } : null
}

// GET /api/tgov/valor-contrato?cnpj=...&nr_proposta=...
// Valor do contrato fechado pelo Comercial para o CNPJ: mesma regra do
// valor_venda_fechado de /api/execucao (soma das vendas fechadas com valor).
// Quando o Comercial não tem valor, a Aprovação informa à mão por proposta.
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = new URL(request.url).searchParams
    const cnpj = (params.get('cnpj') ?? '').replace(/\D/g, '')
    const nrProposta = (params.get('nr_proposta') ?? '').trim()
    if (cnpj.length !== 14 && !nrProposta) {
      return NextResponse.json({ error: 'cnpj ou nr_proposta obrigatório' }, { status: 400 })
    }

    let valor: number | null = null
    let vendas = 0
    let semValor = 0
    if (cnpj.length === 14) {
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
      valor = r?.valor != null ? Number(r.valor) : null
      vendas = Number(r?.vendas ?? 0)
      semValor = Number(r?.sem_valor ?? 0)
    }

    return NextResponse.json({
      valor,
      vendas,
      semValor,
      manual: nrProposta ? await loadManual(nrProposta) : null,
      canEditManual: canEditRubricas(session.role),
    })
  } catch (error) {
    console.error('[api/tgov/valor-contrato][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch valor do contrato' }, { status: 500 })
  }
}

// PUT /api/tgov/valor-contrato  body: { nr_proposta, valor } — valor informado à mão
export async function PUT(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canEditRubricas(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null) as { nr_proposta?: unknown; valor?: unknown } | null
    const nrProposta = typeof payload?.nr_proposta === 'string' ? payload.nr_proposta.trim() : ''
    if (!nrProposta) {
      return NextResponse.json({ error: 'nr_proposta obrigatório' }, { status: 400 })
    }
    const valor = payload?.valor
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 1e12) {
      return NextResponse.json({ error: 'Informe um valor maior que zero' }, { status: 400 })
    }

    await query(
      `INSERT INTO tgov_valor_contrato (nr_proposta, valor, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (nr_proposta) DO UPDATE
         SET valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [nrProposta, Math.round(valor * 100) / 100, session.userId],
    )

    return NextResponse.json({ manual: await loadManual(nrProposta) })
  } catch (error) {
    console.error('[api/tgov/valor-contrato][PUT] error:', error)
    return NextResponse.json({ error: 'Failed to save valor do contrato' }, { status: 500 })
  }
}
