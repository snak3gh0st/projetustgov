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
  qtd_alertas: number
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_present: boolean
}

// Alert business rule — Confirmed with client on 2026-03-18
// Client decision: projects where valor_desembolsado = 0 trigger the alert.
// These are projects where government repasse was approved/allocated but the beneficiary
// never received any disbursement — money was never moved.
//
// Data context: 1,941 projects (22%) have pct_execucao < 10%, many with zero desembolso.
// The previous ETL placeholder (alerta_desembolso = valor_desembolsado < 0) never fired
// for real government data (Pitfall 7). The verified condition uses valor_desembolsado = 0.
//
// tem_alerta is TRUE when the CNPJ has ANY convenio with valor_desembolsado = 0.
// The ALERT_ZERO_EXECUTION SQL fragment is used consistently in both:
//   1. The GROUP BY SELECT (BOOL_OR) — computes tem_alerta per CNPJ
//   2. The alert_only filter — restricts rows to those with tem_alerta = true
const ALERT_ZERO_EXECUTION = 'pe.valor_desembolsado = 0'

export async function GET(request: NextRequest) {
  void ALERT_ZERO_EXECUTION
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
      // Filter to CNPJs that have at least one convenio matching the confirmed alert condition.
      // Uses a correlated subquery so the GROUP BY result is consistent with tem_alerta.
      conditions.push(`EXISTS (
        SELECT 1 FROM projetos_execucao pe2
        WHERE pe2.cnpj = pe.cnpj
          AND ${ALERT_ZERO_EXECUTION.replace('pe.', 'pe2.')}
        LIMIT 1
      )`)
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
          WHEN SUM(pe.valor_desembolsado) > 0 AND SUM(pe.valor_global) > 0
          THEN ROUND((SUM(pe.valor_desembolsado) - SUM(pe.saldo_conta)) / SUM(pe.valor_global) * 100, 1)
          ELSE NULL
        END                                                      AS pct_execucao_ponderado,
        BOOL_OR(pe.valor_desembolsado = 0)                       AS tem_alerta,
        SUM(CASE WHEN pe.valor_desembolsado = 0 THEN 1 ELSE 0 END)::INT AS qtd_alertas,
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

    // Freshness timestamp from cron_sync_log
    const syncLogResult = await query<{ ran_at: string }>(
      `SELECT ran_at FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`
    )
    const last_synced: string | null = syncLogResult[0]?.ran_at ?? null

    return NextResponse.json({ rows, last_synced })
  } catch (error) {
    console.error('[api/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao data' }, { status: 500 })
  }
}
