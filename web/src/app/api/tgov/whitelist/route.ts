import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

/** GET: list all dynamic whitelist entries */
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query<{
      id: number; cnpj: string | null; nr_proposta: string | null
      tab: string; added_by: string | null; added_at: string
    }>('SELECT id, cnpj, nr_proposta, tab, added_by, added_at::text FROM tgov_whitelist ORDER BY added_at DESC')

    return NextResponse.json({ entries: rows })
  } catch (error) {
    console.error('[api/tgov/whitelist] GET error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

/** POST: add CNPJ or NR Proposta to whitelist */
export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const cnpj = body.cnpj ? String(body.cnpj).replace(/\D/g, '') : null
    const nrProposta = body.nr_proposta ? String(body.nr_proposta).replace(/^0+/, '') : null

    if (!cnpj && !nrProposta) {
      return NextResponse.json({ error: 'Informe cnpj ou nr_proposta' }, { status: 400 })
    }

    const result = await query<{ id: number }>(
      `INSERT INTO tgov_whitelist (cnpj, nr_proposta, tab, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cnpj, nr_proposta) DO NOTHING
       RETURNING id`,
      [cnpj, nrProposta, body.tab || 'ambos', session.name || session.email || null]
    )

    if (result.length === 0) {
      return NextResponse.json({ message: 'Já existe na whitelist' })
    }

    return NextResponse.json({ message: 'Adicionado', id: result[0].id })
  } catch (error) {
    console.error('[api/tgov/whitelist] POST error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

/** DELETE: remove entry by id */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    await query('DELETE FROM tgov_whitelist WHERE id = $1', [parseInt(id)])
    return NextResponse.json({ message: 'Removido' })
  } catch (error) {
    console.error('[api/tgov/whitelist] DELETE error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
