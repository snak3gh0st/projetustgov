import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  total_projetos: number
  total_repasse: string        // pg returns NUMERIC as string
  total_desembolsado: string   // pg returns NUMERIC as string
  total_saldo: string          // pg returns NUMERIC as string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_present: boolean
}

// Alert condition placeholder — to be replaced in Plan 16-02 after client confirmation.
// See: .planning/STATE.md "Alert business rule (Phase 16 blocker)"
// The alerta_desembolso column was computed in ETL as valor_desembolsado < 0 which may never
// fire for real government data (Pitfall 7). Plan 16-02 replaces with confirmed business rule.
// The verificar_saldo column uses: valor_desembolsado > 0 && saldo_conta <= 0
const ALERT_PLACEHOLDER_NOTE = 'Using existing ETL-computed boolean columns as placeholder'

export async function GET(request: NextRequest) {
  void ALERT_PLACEHOLDER_NOTE
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor' && session.role !== 'coordenador') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const uf = searchParams.get('uf')
    const alert_only = searchParams.get('alert_only')

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    if (search) {
      const searchClean = search.replace(/[.\-\/]/g, '')
      conditions.push(`(pe.nome_proponente ILIKE $${paramIndex} OR pe.cnpj LIKE $${paramIndex + 1})`)
      params.push(`%${search}%`, `%${searchClean}%`)
      paramIndex += 2
    }

    if (uf) {
      conditions.push(`pe.uf = $${paramIndex++}`)
      params.push(uf.toUpperCase())
    }

    if (alert_only === 'true') {
      conditions.push(`(pe.alerta_desembolso = TRUE OR pe.verificar_saldo = TRUE)`)
    }

    const rows = await query<ExecucaoAggRow>(`
      SELECT
        pe.cnpj,
        MAX(pe.nome_proponente)                                  AS nome_proponente,
        MAX(pe.uf)                                               AS uf,
        MAX(pe.municipio)                                        AS municipio,
        COUNT(*)::INT                                            AS total_projetos,
        SUM(pe.valor_repasse)                                    AS total_repasse,
        SUM(pe.valor_desembolsado)                               AS total_desembolsado,
        SUM(pe.saldo_conta)                                      AS total_saldo,
        CASE
          WHEN SUM(pe.valor_repasse) > 0
          THEN ROUND(SUM(pe.valor_desembolsado) / SUM(pe.valor_repasse) * 100, 1)
          ELSE NULL
        END                                                      AS pct_execucao_ponderado,
        BOOL_OR(pe.alerta_desembolso)                            AS tem_alerta,
        BOOL_OR(pe.verificar_saldo)                              AS tem_verificar_saldo,
        MIN(pe.data_fim_vigencia)                                AS data_fim_vigencia_mais_proxima,
        MIN(
          EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT
        )                                                        AS dias_ate_vencimento_min,
        MAX(
          GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT)
        )                                                        AS dias_em_execucao_max,
        EXISTS(
          SELECT 1 FROM lead_contacts lc
          WHERE lc.lead_cnpj = pe.cnpj
          LIMIT 1
        )                                                        AS contact_present
      FROM projetos_execucao pe
      WHERE ${conditions.join(' AND ')}
      GROUP BY pe.cnpj
      ORDER BY tem_alerta DESC, total_projetos DESC, pe.cnpj
    `, params)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('[api/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao data' }, { status: 500 })
  }
}
