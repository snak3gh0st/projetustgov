import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

interface ExecucaoDetailRow {
  nr_convenio: string
  id_proposta: string | null
  situacao: string | null
  modalidade: string | null
  objeto: string | null
  valor_global: string | null       // NUMERIC as string
  valor_repasse: string | null
  valor_desembolsado: string | null
  saldo_conta: string | null
  valor_empenhado: string | null
  pct_execucao: string | null
  dias_em_execucao: number | null
  dias_ate_vencimento: number | null
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  alerta_desembolso: boolean
  verificar_saldo: boolean
  tag_desembolso: boolean
  tag_lobby: boolean
}

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

    // Vendedores only see CNPJs assigned to them
    if (session.role === 'vendedor') {
      const ownership = await query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM vendedor_projetos WHERE cnpj = $1 AND vendedor_id = $2) AS exists`,
        [cnpj, session.userId]
      )
      if (!ownership[0]?.exists) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const rows = await query<ExecucaoDetailRow>(`
      SELECT
        pe.nr_convenio,
        pe.id_proposta,
        pe.situacao,
        pe.modalidade,
        pe.objeto,
        pe.valor_global,
        pe.valor_repasse,
        pe.valor_desembolsado,
        pe.saldo_conta,
        pe.valor_empenhado,
        pe.pct_execucao,
        GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT)  AS dias_em_execucao,
        EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT                  AS dias_ate_vencimento,
        pe.data_assinatura,
        pe.data_inicio_vigencia,
        pe.data_fim_vigencia,
        pe.alerta_desembolso,
        pe.verificar_saldo,
        GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) < 100 AS tag_desembolso,
        (GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) >= 100 AND pe.valor_desembolsado = 0) AS tag_lobby
      FROM projetos_execucao pe
      WHERE pe.cnpj = $1
      ORDER BY pe.valor_global DESC NULLS LAST
    `, [cnpj])

    return NextResponse.json(rows)
  } catch (error) {
    console.error('[api/execucao/[cnpj]] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao detail' }, { status: 500 })
  }
}
