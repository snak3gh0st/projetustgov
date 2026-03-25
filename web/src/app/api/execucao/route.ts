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
  total_valor_global: string   // pg returns NUMERIC as string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  qtd_alertas: number
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_telefone: string | null
  contact_email: string | null
  contact_nome: string | null
  contact_telefone_status: string | null
  total_propostas_db: number
  vendedor_nome: string | null
  tag_autossuficiente: boolean
  tag_iniciante: boolean
  tag_desembolso: boolean
  tag_lobby: boolean
  tag_rendimento: boolean
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
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const uf = searchParams.get('uf')
    const alert_only = searchParams.get('alert_only')

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    // Vendedores only see CNPJs assigned to them in vendedor_projetos
    if (session.role === 'vendedor') {
      conditions.push(`EXISTS (
        SELECT 1 FROM vendedor_projetos vp_owner
        WHERE vp_owner.cnpj = pe.cnpj AND vp_owner.vendedor_id = $${paramIndex++}
        LIMIT 1
      )`)
      params.push(session.userId)
    }

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
        SUM(pe.valor_global)                                     AS total_valor_global,
        CASE
          WHEN SUM(pe.valor_desembolsado) > 0 AND SUM(pe.valor_global) > 0
          THEN ROUND(GREATEST(0, SUM(pe.valor_desembolsado) - SUM(pe.saldo_conta)) / SUM(pe.valor_global) * 100, 1)
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
        COALESCE(
          (SELECT lc.telefone FROM lead_contacts lc
           WHERE lc.lead_cnpj = pe.cnpj
           ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1),
          (SELECT vp.telefone FROM vendedor_projetos vp
           WHERE vp.cnpj = pe.cnpj AND vp.telefone IS NOT NULL AND vp.telefone != ''
           LIMIT 1)
        )                                                        AS contact_telefone,
        COALESCE(
          (SELECT lc.email FROM lead_contacts lc
           WHERE lc.lead_cnpj = pe.cnpj
           ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1),
          (SELECT vp.email FROM vendedor_projetos vp
           WHERE vp.cnpj = pe.cnpj AND vp.email IS NOT NULL AND vp.email != ''
           LIMIT 1)
        )                                                        AS contact_email,
        (SELECT lc.nome_pessoa FROM lead_contacts lc
         WHERE lc.lead_cnpj = pe.cnpj
         ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1
        )                                                        AS contact_nome,
        (SELECT lc.telefone_status FROM lead_contacts lc
         WHERE lc.lead_cnpj = pe.cnpj
         ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1
        )                                                        AS contact_telefone_status,
        COALESCE((
          SELECT COUNT(*)::INT FROM propostas p
          WHERE p.proponente_cnpj = pe.cnpj
        ), 0)                                                    AS total_propostas_db,
        -- Vendedor owner (from vendedor_projetos, most frequent vendedor_id for this CNPJ)
        (SELECT u.nome FROM vendedor_projetos vp_v
         JOIN users u ON u.id = vp_v.vendedor_id
         WHERE vp_v.cnpj = pe.cnpj AND vp_v.vendedor_id IS NOT NULL
         GROUP BY u.nome, vp_v.vendedor_id
         ORDER BY COUNT(*) DESC LIMIT 1
        ) AS vendedor_nome,
        -- Tag: Autossuficiente (>5 propostas)
        COALESCE((SELECT COUNT(*)::INT FROM propostas p WHERE p.proponente_cnpj = pe.cnpj), 0) > 5 AS tag_autossuficiente,
        -- Tag: Iniciante (<5 propostas)
        COALESCE((SELECT COUNT(*)::INT FROM propostas p WHERE p.proponente_cnpj = pe.cnpj), 0) < 5 AS tag_iniciante,
        -- Tag: Desembolso (<100 dias execucao)
        BOOL_OR(GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) < 100) AS tag_desembolso,
        -- Tag: Lobby (100+ dias execucao AND desembolso = 0)
        BOOL_OR(GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) >= 100 AND pe.valor_desembolsado = 0) AS tag_lobby,
        -- Tag: Rendimento (has rendimento_aplicacao > 0 in convenios table)
        EXISTS(
          SELECT 1 FROM convenios c
          INNER JOIN propostas p ON c.proposta_id = p.transfer_gov_id
          WHERE p.proponente_cnpj = pe.cnpj AND c.rendimento_aplicacao > 0
          LIMIT 1
        ) AS tag_rendimento
      FROM projetos_execucao pe
      WHERE ${conditions.join(' AND ')}
      GROUP BY pe.cnpj
      ORDER BY pct_execucao_ponderado ASC NULLS LAST, tem_alerta DESC, pe.cnpj
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
