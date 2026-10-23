import { NextRequest, NextResponse } from 'next/server'
import { getPool, query } from '@/lib/db'
import { getApiSession, canReadTgov, canEditRubricas } from '@/lib/dal'
import { parseRubricas, totalRubricas, type Rubrica } from '@/lib/rubricas'

export const dynamic = 'force-dynamic'

async function loadRubricas(nrProposta: string): Promise<Rubrica[]> {
  const rows = await query<{ cargo: string; meses: number; data_inicio: string | null; valor_unitario: string }>(
    `SELECT cargo, meses, data_inicio::text AS data_inicio, valor_unitario
     FROM tgov_rubricas
     WHERE nr_proposta = $1
     ORDER BY ordem`,
    [nrProposta],
  )
  return rows.map(r => ({
    cargo: r.cargo,
    meses: Number(r.meses),
    dataInicio: r.data_inicio,
    valorUnitario: Number(r.valor_unitario),
  }))
}

// GET /api/tgov/rubricas?nr_proposta=...
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nrProposta = new URL(request.url).searchParams.get('nr_proposta')
    if (!nrProposta) {
      return NextResponse.json({ error: 'nr_proposta obrigatório' }, { status: 400 })
    }

    const linhas = await loadRubricas(nrProposta)
    return NextResponse.json({ linhas, total: totalRubricas(linhas), canEdit: canEditRubricas(session.role) })
  } catch (error) {
    console.error('[api/tgov/rubricas][GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch rubricas' }, { status: 500 })
  }
}

// PUT /api/tgov/rubricas  body: { nr_proposta, linhas: Rubrica[] } — substitui a lista inteira
export async function PUT(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canEditRubricas(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const payload = await request.json().catch(() => null) as { nr_proposta?: unknown; linhas?: unknown } | null
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const nrProposta = typeof payload.nr_proposta === 'string' ? payload.nr_proposta.trim() : ''
    if (!nrProposta) {
      return NextResponse.json({ error: 'nr_proposta obrigatório' }, { status: 400 })
    }
    const parsed = parseRubricas(payload.linhas)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM tgov_rubricas WHERE nr_proposta = $1`, [nrProposta])
      for (let i = 0; i < parsed.linhas.length; i++) {
        const r = parsed.linhas[i]
        await client.query(
          `INSERT INTO tgov_rubricas (nr_proposta, ordem, cargo, meses, data_inicio, valor_unitario, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [nrProposta, i, r.cargo, r.meses, r.dataInicio, r.valorUnitario, session.userId],
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({ linhas: parsed.linhas, total: totalRubricas(parsed.linhas), canEdit: true })
  } catch (error) {
    console.error('[api/tgov/rubricas][PUT] error:', error)
    return NextResponse.json({ error: 'Failed to save rubricas' }, { status: 500 })
  }
}
