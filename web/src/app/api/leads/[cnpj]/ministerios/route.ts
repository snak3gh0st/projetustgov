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
        a.orgao,
        COUNT(DISTINCT prop.transfer_gov_id) as count
      FROM propostas prop
      LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
      LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
      WHERE prop.proponente_cnpj = $1
        AND a.orgao IS NOT NULL
        AND a.orgao != ''
        AND a.orgao != 'nan'
      GROUP BY a.orgao
      ORDER BY count DESC`,
      [cnpj]
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Ministerios query error:', error)
    return NextResponse.json({ error: 'Failed to fetch ministerios' }, { status: 500 })
  }
}
