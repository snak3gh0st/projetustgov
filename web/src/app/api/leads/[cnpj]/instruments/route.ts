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
        c.transfer_gov_id as nr_instrumento,
        prop.modalidade,
        c.situacao,
        c.instrumento_ativo,
        CASE WHEN pe.emenda_transfer_gov_id IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_emenda,
        e.autor as parlamentar,
        c.valor_global,
        e.valor as valor_emenda,
        c.valor_empenhado,
        c.valor_desembolsado as valor_liberado,
        c.saldo_conta,
        c.valor_repasse,
        c.valor_contrapartida,
        c.valor_global_original,
        c.rendimento_aplicacao,
        c.ingresso_contrapartida,
        c.data_inicio_vigencia,
        c.data_fim_vigencia
      FROM convenios c
      INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
      LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      WHERE prop.proponente_cnpj = $1
      ORDER BY c.valor_global DESC NULLS LAST`,
      [cnpj]
    )

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Instruments query error:', error)
    return NextResponse.json({ error: 'Failed to fetch instruments' }, { status: 500 })
  }
}
