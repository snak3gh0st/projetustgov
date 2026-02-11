import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, verifyLeadAccess } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cnpj = decodeURIComponent(params.cnpj)

    const hasAccess = await verifyLeadAccess(cnpj, session.userId, session.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await query(
      `SELECT
        p.transfer_gov_id,
        p.titulo,
        p.situacao,
        p.valor_global,
        p.valor_repasse,
        p.data_publicacao,
        prog.nome as programa_nome
      FROM propostas p
      LEFT JOIN programas prog ON p.programa_id = prog.transfer_gov_id
      WHERE p.proponente_cnpj = $1
      ORDER BY p.data_publicacao DESC
      LIMIT 100`,
      [cnpj]
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Propostas query error:', error)
    return NextResponse.json({ error: 'Failed to fetch propostas' }, { status: 500 })
  }
}
