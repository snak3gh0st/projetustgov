import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { normalizeCrmStatus } from '@/lib/crm-catalog'

export const dynamic = 'force-dynamic'

interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  crm_status: string
  aprovacao_status: string
  total_projetos: number
  total_repasse: string        // pg returns NUMERIC as string
  total_desembolsado: string   // pg returns NUMERIC as string
  total_saldo: string          // pg returns NUMERIC as string
  total_valor_global: string   // pg returns NUMERIC as string
  valor_venda_fechado: string | null
  tipo_servico: string | null
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
  vendedor_id: string | null
  observacoes_execucao: string | null
  days_since_last_contact: number | null
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

const normalizedStatusSql = (columnRef: string) => `
  CASE
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado', 'Novo', 'Contactado') THEN 'Não Contatado'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Ainda Não', 'Sem Interesse') THEN 'Sem Interesse'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Retorno', 'Em Atendimento') THEN 'Em Atendimento'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Contatado') THEN 'Contatado'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Reunião Agendada', 'Reuniao Agendada') THEN 'Reunião Agendada'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Proposta', 'Proposta Enviada') THEN 'Proposta Enviada'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Aguardando Closer', 'Em Aprovação') THEN 'Em Aprovação'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Impedimento Técnico', 'Impedimento Tecnico') THEN 'Impedimento Técnico'
    WHEN COALESCE(${columnRef}, 'Não Contatado') = 'Cancelado' THEN 'Cancelado'
    ELSE COALESCE(${columnRef}, 'Não Contatado')
  END
`

const normalizedStatusOrderSql = (normalizedExpr: string) => `
  CASE ${normalizedExpr}
    WHEN 'Fechado' THEN 1
    WHEN 'Em Aprovação' THEN 2
    WHEN 'Proposta Enviada' THEN 3
    WHEN 'Reunião Agendada' THEN 4
    WHEN 'Contatado' THEN 5
    WHEN 'Em Atendimento' THEN 6
    WHEN 'Sem Interesse' THEN 7
    WHEN 'Impedimento Técnico' THEN 8
    WHEN 'Cancelado' THEN 9
    WHEN 'Quente' THEN 10
    WHEN 'Muito Quente' THEN 11
    WHEN 'Telefone Invalido' THEN 12
    WHEN 'Não Contatado' THEN 14
    ELSE 13
  END
`

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
    const vendedor_id = searchParams.get('vendedor_id')

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    // Vendedores only see CNPJs assigned to them in vendedor_projetos
    if (session.role === 'vendedor') {
      conditions.push(`EXISTS (
        SELECT 1 FROM vendedor_projetos vp_owner
        WHERE REGEXP_REPLACE(vp_owner.cnpj, '[^0-9]', '', 'g') = pe.cnpj
          AND vp_owner.vendedor_id = $${paramIndex++}
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
      conditions.push(`EXISTS (
        SELECT 1 FROM projetos_execucao pe2
        WHERE pe2.cnpj = pe.cnpj
          AND ${ALERT_ZERO_EXECUTION.replace('pe.', 'pe2.')}
        LIMIT 1
      )`)
    }

    if (vendedor_id) {
      if (vendedor_id === 'unassigned') {
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM vendedor_projetos vp_f
          WHERE REGEXP_REPLACE(vp_f.cnpj, '[^0-9]', '', 'g') = pe.cnpj
            AND vp_f.vendedor_id IS NOT NULL
          LIMIT 1
        )`)
      } else {
        conditions.push(`EXISTS (
          SELECT 1 FROM vendedor_projetos vp_f
          WHERE REGEXP_REPLACE(vp_f.cnpj, '[^0-9]', '', 'g') = pe.cnpj
            AND vp_f.vendedor_id = $${paramIndex++}
          LIMIT 1
        )`)
        params.push(vendedor_id)
      }
    }

    const rows = await query<ExecucaoAggRow>(`
      WITH agg AS (
        SELECT
          pe.cnpj,
          MAX(pe.nome_proponente)   AS nome_proponente,
          MAX(pe.uf)               AS uf,
          MAX(pe.municipio)        AS municipio,
          COUNT(*)::INT            AS total_projetos,
          SUM(pe.valor_repasse)    AS total_repasse,
          SUM(pe.valor_desembolsado) AS total_desembolsado,
          SUM(pe.saldo_conta)      AS total_saldo,
          SUM(pe.valor_global)     AS total_valor_global,
          CASE
            WHEN (SUM(pe.valor_desembolsado) + SUM(pe.ingresso_contrapartida) + SUM(pe.rendimento_aplicacao)) > 0 AND SUM(pe.valor_global) > 0
            THEN ROUND(GREATEST(0, SUM(pe.valor_desembolsado) + SUM(pe.ingresso_contrapartida) + SUM(pe.rendimento_aplicacao) - SUM(pe.saldo_conta)) / SUM(pe.valor_global) * 100, 1)
            ELSE NULL
          END AS pct_execucao_ponderado,
          BOOL_OR(pe.valor_desembolsado = 0) AS tem_alerta,
          SUM(CASE WHEN pe.valor_desembolsado = 0 THEN 1 ELSE 0 END)::INT AS qtd_alertas,
          BOOL_OR(pe.verificar_saldo) AS tem_verificar_saldo,
          MIN(pe.data_fim_vigencia) AS data_fim_vigencia_mais_proxima,
          MIN(EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT) AS dias_ate_vencimento_min,
          MAX(GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT)) AS dias_em_execucao_max,
          BOOL_OR(GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) < 100) AS tag_desembolso,
          BOOL_OR(GREATEST(0, EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT) >= 100 AND pe.valor_desembolsado = 0 AND pe.situacao = 'Em execução') AS tag_lobby,
          BOOL_OR(
            COALESCE(pe.rendimento_aplicacao, 0) > 5000
            AND COALESCE(pe.saldo_conta, 0) >= COALESCE(pe.rendimento_aplicacao, 0)
          ) AS tag_rendimento
        FROM projetos_execucao pe
        WHERE ${conditions.join(' AND ')}
        GROUP BY pe.cnpj
      ),
      contacts AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(lead_cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(lead_cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          nome_pessoa,
          NULLIF(TRIM(telefone), '') AS telefone,
          NULLIF(TRIM(email), '') AS email,
          telefone_status
        FROM lead_contacts
        WHERE NULLIF(TRIM(telefone), '') IS NOT NULL
           OR NULLIF(TRIM(email), '') IS NOT NULL
        ORDER BY
          REGEXP_REPLACE(lead_cnpj, '[^0-9]', '', 'g'),
          principal DESC NULLS LAST,
          (NULLIF(TRIM(telefone), '') IS NOT NULL) DESC,
          (NULLIF(TRIM(email), '') IS NOT NULL) DESC,
          created_at ASC
      ),
      vp_contacts AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          NULLIF(TRIM(telefone), '') AS telefone,
          NULLIF(TRIM(email), '') AS email
        FROM vendedor_projetos
        WHERE NULLIF(TRIM(telefone), '') IS NOT NULL
           OR NULLIF(TRIM(email), '') IS NOT NULL
        ORDER BY
          REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'),
          (NULLIF(TRIM(telefone), '') IS NOT NULL) DESC,
          (NULLIF(TRIM(email), '') IS NOT NULL) DESC
      ),
      proposta_counts AS (
        SELECT proponente_cnpj AS cnpj, COUNT(*)::INT AS cnt
        FROM propostas
        GROUP BY proponente_cnpj
      ),
      vendedor_owners AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp_v.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp_v.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          u.nome,
          vp_v.vendedor_id,
          vp_v.observacoes_execucao
        FROM vendedor_projetos vp_v
        JOIN users u ON u.id = vp_v.vendedor_id
        WHERE vp_v.vendedor_id IS NOT NULL
        GROUP BY REGEXP_REPLACE(vp_v.cnpj, '[^0-9]', '', 'g'), u.nome, vp_v.vendedor_id, vp_v.observacoes_execucao
        ORDER BY REGEXP_REPLACE(vp_v.cnpj, '[^0-9]', '', 'g'), COUNT(*) DESC
      ),
      last_contact AS (
        SELECT
          REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          EXTRACT(DAY FROM NOW() - MAX(cn.created_at))::INT AS days_since
        FROM contact_notes cn
        GROUP BY REGEXP_REPLACE(cn.lead_cnpj, '[^0-9]', '', 'g')
      ),
      crm_statuses AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          ${normalizedStatusSql('vp.status_contato_execucao')} AS crm_status
        FROM vendedor_projetos vp
        ORDER BY
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'),
          ${normalizedStatusOrderSql(normalizedStatusSql('vp.status_contato_execucao'))} ASC,
          vp.updated_at DESC NULLS LAST
      ),
      aprovacao_statuses AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          ${normalizedStatusSql('vp.status_contato')} AS aprovacao_status
        FROM vendedor_projetos vp
        ORDER BY
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'),
          ${normalizedStatusOrderSql(normalizedStatusSql('vp.status_contato'))} ASC,
          vp.updated_at DESC NULLS LAST
      ),
      closed_sales AS (
        SELECT
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
          SUM(vp.valor_venda) FILTER (
            WHERE vp.status_contato IN ('Fechado', 'Em Aprovação', 'Vendas Concluídas')
              AND vp.valor_venda IS NOT NULL
              AND vp.valor_venda > 0
          ) AS valor_venda_fechado,
          (
            ARRAY_AGG(vp.tipo_servico ORDER BY vp.updated_at DESC NULLS LAST)
            FILTER (WHERE vp.tipo_servico IS NOT NULL AND BTRIM(vp.tipo_servico) <> '')
          )[1] AS tipo_servico
        FROM vendedor_projetos vp
        GROUP BY REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
      )
      SELECT
        a.cnpj, a.nome_proponente, a.uf, a.municipio,
        COALESCE(cs.crm_status, 'Não Contatado') AS crm_status,
        COALESCE(aps.aprovacao_status, 'Não Contatado') AS aprovacao_status,
        a.total_projetos, a.total_repasse, a.total_desembolsado,
        a.total_saldo, a.total_valor_global, a.pct_execucao_ponderado,
        cls.valor_venda_fechado,
        cls.tipo_servico,
        a.tem_alerta, a.qtd_alertas, a.tem_verificar_saldo,
        a.data_fim_vigencia_mais_proxima, a.dias_ate_vencimento_min,
        a.dias_em_execucao_max,
        COALESCE(ct.telefone, vpc.telefone) AS contact_telefone,
        COALESCE(ct.email, vpc.email) AS contact_email,
        ct.nome_pessoa AS contact_nome,
        ct.telefone_status AS contact_telefone_status,
        COALESCE(pc.cnt, 0) AS total_propostas_db,
        vo.nome AS vendedor_nome,
        vo.vendedor_id,
        vo.observacoes_execucao,
        lc.days_since AS days_since_last_contact,
        COALESCE(pc.cnt, 0) >= 5 AS tag_autossuficiente,
        COALESCE(pc.cnt, 0) < 5 AS tag_iniciante,
        a.tag_desembolso,
        a.tag_lobby,
        a.tag_rendimento
      FROM agg a
      LEFT JOIN crm_statuses cs ON cs.cnpj_clean = a.cnpj
      LEFT JOIN aprovacao_statuses aps ON aps.cnpj_clean = a.cnpj
      LEFT JOIN closed_sales cls ON cls.cnpj_clean = a.cnpj
      LEFT JOIN contacts ct ON ct.cnpj_clean = a.cnpj
      LEFT JOIN vp_contacts vpc ON vpc.cnpj_clean = a.cnpj
      LEFT JOIN proposta_counts pc ON pc.cnpj = a.cnpj
      LEFT JOIN vendedor_owners vo ON vo.cnpj_clean = a.cnpj
      LEFT JOIN last_contact lc ON lc.cnpj_clean = a.cnpj
      ORDER BY a.pct_execucao_ponderado ASC NULLS LAST, a.tem_alerta DESC, a.cnpj
    `, params)

    // Freshness timestamp from cron_sync_log
    const syncLogResult = await query<{ ran_at: string }>(
      `SELECT ran_at FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`
    )
    const last_synced: string | null = syncLogResult[0]?.ran_at ?? null
    const normalizedRows = rows.map(row => ({
      ...row,
      crm_status: normalizeCrmStatus(String(row.crm_status || 'Não Contatado')),
      aprovacao_status: normalizeCrmStatus(String(row.aprovacao_status || 'Não Contatado')),
    }))

    return NextResponse.json({ rows: normalizedRows, last_synced })
  } catch (error) {
    console.error('[api/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao data' }, { status: 500 })
  }
}
