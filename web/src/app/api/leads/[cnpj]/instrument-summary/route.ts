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
        COUNT(DISTINCT c.transfer_gov_id) as total_instrumentos,
        SUM(c.valor_global) as total_valor_global,
        SUM(c.valor_empenhado) as total_empenhado,
        SUM(c.valor_desembolsado) as total_liberado,
        SUM(c.saldo_conta) as total_saldo_conta,
        COUNT(DISTINCT CASE WHEN c.instrumento_ativo = 'SIM' THEN c.transfer_gov_id END) as instrumentos_ativos
      FROM convenios c
      INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
      WHERE prop.proponente_cnpj = $1`,
      [cnpj]
    )

    if (rows.length === 0) {
      return NextResponse.json({})
    }

    const row = rows[0]
    return NextResponse.json({
      total_instrumentos: Number(row.total_instrumentos) || 0,
      total_valor_global: Number(row.total_valor_global) || 0,
      total_empenhado: Number(row.total_empenhado) || 0,
      total_liberado: Number(row.total_liberado) || 0,
      total_saldo_conta: Number(row.total_saldo_conta) || 0,
      instrumentos_ativos: Number(row.instrumentos_ativos) || 0,
    })
  } catch (error) {
    console.error('Instrument summary error:', error)
    return NextResponse.json({ error: 'Failed to fetch instrument summary' }, { status: 500 })
  }
}
