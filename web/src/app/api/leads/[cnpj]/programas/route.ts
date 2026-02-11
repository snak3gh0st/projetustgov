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
        prog.nome as programa_nome,
        prog.transfer_gov_id as programa_id,
        COUNT(DISTINCT p.transfer_gov_id) as count
      FROM propostas p
      INNER JOIN programas prog ON p.programa_id = prog.transfer_gov_id
      WHERE p.proponente_cnpj = $1
      GROUP BY prog.nome, prog.transfer_gov_id
      ORDER BY count DESC`,
      [cnpj]
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Programas query error:', error)
    return NextResponse.json({ error: 'Failed to fetch programas' }, { status: 500 })
  }
}
