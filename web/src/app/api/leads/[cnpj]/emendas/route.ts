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
      `SELECT DISTINCT
        e.numero as numero_emenda,
        e.autor as parlamentar,
        e.valor as valor_emenda,
        e.tipo as tipo_emenda,
        a.nome as apoiador_nome,
        a.orgao as ministerio
      FROM propostas prop
      INNER JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      INNER JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
      LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
      WHERE prop.proponente_cnpj = $1
      ORDER BY e.valor DESC
      LIMIT 100`,
      [cnpj]
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Emendas query error:', error)
    return NextResponse.json({ error: 'Failed to fetch emendas' }, { status: 500 })
  }
}
