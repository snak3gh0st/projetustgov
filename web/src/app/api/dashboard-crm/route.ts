import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const EXECUCAO_PIPELINE_STATUSES = [
  'Não Contatado',
  'Ainda Não',
  'Retorno',
  'Quente',
  'Muito Quente',
  'Proposta',
  'Aguardando Closer',
  'Telefone Invalido',
  'Fechado',
] as const

const EXECUCAO_STATUS_NORMALIZED_SQL = `
  CASE
    WHEN COALESCE(vp.status_contato_execucao, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado') THEN 'Não Contatado'
    ELSE COALESCE(vp.status_contato_execucao, 'Não Contatado')
  END
`

const EXECUCAO_STATUS_PRIORITY_SQL = `
  CASE
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Fechado' THEN 1
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Aguardando Closer' THEN 2
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Proposta' THEN 3
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Retorno' THEN 4
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Ainda Não' THEN 5
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Quente' THEN 6
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Muito Quente' THEN 7
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Telefone Invalido' THEN 8
    WHEN ${EXECUCAO_STATUS_NORMALIZED_SQL} = 'Não Contatado' THEN 10
    ELSE 9
  END
`

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isVendedor = session.role === 'vendedor'
    const isCoordenador = session.role === 'coordenador'
    const isFiltered = isVendedor || isCoordenador
    // gestor sees all leads; coordenador sees leads where vendedor_id = id OR closer_id = id
    const vendedorFilter = isVendedor
      ? ' WHERE vendedor_id = $1'
      : isCoordenador
      ? ' WHERE (vendedor_id = $1 OR closer_id = $1)'
      : ''
    const vendedorParams = isFiltered ? [session.userId] : []

    // Run all queries in parallel to avoid sequential connection queuing
    const [globalRows, vendedorRows, todayRows, recentRows, commissionRows, contactHealthRows, staleLeadsRows, execucaoPipelineRows, execVendedorRows, execAlertRows] = await Promise.all([
      // 1. Global stats with status breakdown
      query(`
        SELECT
          COUNT(DISTINCT cnpj)::int as total_leads,
          COUNT(DISTINCT CASE WHEN vendedor_id IS NOT NULL THEN cnpj END)::int as total_assigned,
          COUNT(DISTINCT CASE WHEN vendedor_id IS NULL THEN cnpj END)::int as total_unassigned,
          COALESCE(SUM(valor_emenda::numeric), 0) as total_valor_emenda,
          COUNT(DISTINCT CASE WHEN COALESCE(status_contato, 'Não Contatado') = 'Não Contatado' THEN cnpj END)::int as status_nao_contatado,
          COUNT(DISTINCT CASE WHEN status_contato = 'Ainda Não' THEN cnpj END)::int as status_ainda_nao,
          COUNT(DISTINCT CASE WHEN status_contato = 'Retorno' THEN cnpj END)::int as status_retorno,
          COUNT(DISTINCT CASE WHEN status_contato = 'Proposta' THEN cnpj END)::int as status_proposta,
          COUNT(DISTINCT CASE WHEN status_contato = 'Aguardando Closer' THEN cnpj END)::int as status_aguardando_closer,
          COUNT(DISTINCT CASE WHEN status_contato = 'Fechado' THEN cnpj END)::int as status_fechado
        FROM vendedor_projetos${vendedorFilter}
      `, vendedorParams),

      // 2. Per-vendedor aggregations
      query(`
        SELECT
          vp.vendedor_id,
          u.nome as vendedor_nome,
          COUNT(DISTINCT vp.cnpj)::int as total_leads,
          COUNT(DISTINCT CASE WHEN COALESCE(vp.status_contato, 'Não Contatado') = 'Não Contatado' THEN vp.cnpj END)::int as nao_contatado,
          COUNT(DISTINCT CASE WHEN vp.status_contato = 'Retorno' THEN vp.cnpj END)::int as retorno,
          COUNT(DISTINCT CASE WHEN vp.status_contato = 'Proposta' THEN vp.cnpj END)::int as proposta,
          COUNT(DISTINCT CASE WHEN vp.status_contato = 'Aguardando Closer' THEN vp.cnpj END)::int as aguardando_closer,
          COUNT(DISTINCT CASE WHEN vp.status_contato = 'Fechado' THEN vp.cnpj END)::int as fechado,
          COALESCE(SUM(vp.valor_emenda::numeric), 0) as valor_total_emenda,
          COALESCE(SUM(CASE WHEN vp.status_contato = 'Fechado' AND u.role != 'gestor' THEN vp.comissao_valor::numeric ELSE 0 END), 0) as comissao_total,
          MAX(vp.updated_at) as last_activity
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
        GROUP BY vp.vendedor_id, u.nome
        ORDER BY total_leads DESC
      `, vendedorParams),

      // 3. Today's activity per vendedor
      query(`
        SELECT
          vp.vendedor_id,
          SUM(CASE WHEN vp.status_contato = 'Retorno' THEN 1 ELSE 0 END)::int as ligacoes_hoje,
          SUM(CASE WHEN vp.status_contato = 'Proposta' THEN 1 ELSE 0 END)::int as propostas_hoje,
          SUM(CASE WHEN vp.status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as fechados_hoje
        FROM vendedor_projetos vp
        WHERE vp.vendedor_id IS NOT NULL
          AND vp.updated_at >= CURRENT_DATE
          AND vp.status_contato IN ('Retorno', 'Proposta', 'Fechado')${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
        GROUP BY vp.vendedor_id
      `, vendedorParams),

      // 4. Recent activity (last 10 updates)
      query(`
        SELECT
          vp.cnpj,
          vp.nome,
          COALESCE(u.nome, 'Sem vendedor') as vendedor_nome,
          COALESCE(vp.status_contato, 'Não Contatado') as status_contato,
          vp.updated_at
        FROM vendedor_projetos vp
        LEFT JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.updated_at IS NOT NULL${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
        ORDER BY vp.updated_at DESC
        LIMIT 10
      `, vendedorParams),

      // 5. Commission breakdown — só Fechados ganham comissão (gestor rows zeroed out)
      query(`
        SELECT
          'Fechado' as status_contato,
          COUNT(*)::int as count,
          SUM(CASE WHEN u.role != 'gestor' THEN vp.comissao_valor ELSE 0 END)::numeric as total_comissao,
          COALESCE(SUM(vp.valor_venda), 0)::numeric as total_venda,
          SUM(CASE WHEN vp.comissao_locked = true THEN 1 ELSE 0 END)::int as locked_count
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
          AND vp.comissao_valor IS NOT NULL
          AND vp.comissao_valor > 0
          AND vp.status_contato = 'Fechado'
          ${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
      `, vendedorParams),

      // 6. Contact health: stale leads (no contact_notes in >7d or never), invalid phones
      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj
              AND cn.created_at >= NOW() - INTERVAL '7 days'
            )
            AND NOT EXISTS (
              SELECT 1 FROM vendedor_projetos vp2
              WHERE vp2.cnpj = vp.cnpj
              AND vp2.status_contato NOT IN ('Não Contatado')
              AND vp2.updated_at >= NOW() - INTERVAL '7 days'
            )
            AND vp.status_contato NOT IN ('Fechado')
          )::int as stale_count,
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj
            )
            AND COALESCE(vp.status_contato, 'Não Contatado') = 'Não Contatado'
          )::int as never_contacted_count,
          COUNT(DISTINCT vp.cnpj) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM lead_contacts lc
              WHERE lc.lead_cnpj = vp.cnpj AND lc.telefone_status = 'invalido'
              AND lc.principal = true
            )
          )::int as invalid_phone_count
        FROM vendedor_projetos vp
        WHERE vp.vendedor_id IS NOT NULL${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
      `, vendedorParams),

      // 7. Top stale leads needing follow-up (oldest contact or never contacted)
      query(`
        SELECT
          vp.cnpj,
          vp.nome,
          COALESCE(u.nome, 'Sem vendedor') as vendedor_nome,
          vp.status_contato,
          (
            SELECT GREATEST(
              (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
              (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
               WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
            )
          ) as last_contact_date,
          (
            SELECT EXTRACT(DAY FROM NOW() - GREATEST(
              (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
              (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
               WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
            ))::int
          ) as days_since_last_contact,
          (
            SELECT lc.telefone_status
            FROM lead_contacts lc
            WHERE lc.lead_cnpj = vp.cnpj
            ORDER BY lc.principal DESC, lc.created_at ASC
            LIMIT 1
          ) as principal_telefone_status
        FROM vendedor_projetos vp
        LEFT JOIN users u ON u.id = vp.vendedor_id
        WHERE vp.vendedor_id IS NOT NULL
          AND vp.status_contato NOT IN ('Fechado')
          ${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
        GROUP BY vp.cnpj, vp.nome, u.nome, vp.status_contato, vp.updated_at
        ORDER BY
          CASE WHEN NOT EXISTS (SELECT 1 FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj)
            THEN 0 ELSE 1 END,
          (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj) ASC NULLS FIRST
        LIMIT 8
      `, vendedorParams),

      // 8. Separate execution pipeline based only on projetos_execucao CNPJs
      query(`
        WITH execucao_agg AS (
          SELECT
            pe.cnpj,
            SUM(pe.valor_global) AS total_valor_global,
            SUM(pe.saldo_conta) AS total_saldo,
            BOOL_OR(pe.valor_desembolsado = 0) AS tem_alerta
          FROM projetos_execucao pe
          ${isFiltered ? `WHERE EXISTS (
            SELECT 1
            FROM vendedor_projetos vp_owner
            WHERE REGEXP_REPLACE(vp_owner.cnpj, '[^0-9]', '', 'g') = pe.cnpj
              AND (vp_owner.vendedor_id = $1 OR vp_owner.closer_id = $1)
          )` : ''}
          GROUP BY pe.cnpj
        ),
        vp_statuses AS (
          SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
            REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj_clean,
            ${EXECUCAO_STATUS_NORMALIZED_SQL} AS crm_status
          FROM vendedor_projetos vp
          ${isFiltered ? 'WHERE (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
          ORDER BY
            REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'),
            ${EXECUCAO_STATUS_PRIORITY_SQL} ASC,
            vp.updated_at DESC NULLS LAST
        ),
        execucao_status AS (
          SELECT
            ea.cnpj,
            COALESCE(vs.crm_status, 'Não Contatado') AS crm_status,
            ea.total_valor_global,
            ea.total_saldo,
            ea.tem_alerta
          FROM execucao_agg ea
          LEFT JOIN vp_statuses vs ON vs.cnpj_clean = ea.cnpj
        )
        SELECT
          COUNT(*)::int AS total_cnpjs,
          COALESCE(SUM(total_valor_global), 0) AS total_valor_global,
          COALESCE(SUM(total_saldo), 0) AS total_saldo,
          COUNT(*) FILTER (WHERE tem_alerta)::int AS total_alertas,
          COUNT(*) FILTER (WHERE crm_status = 'Não Contatado')::int AS status_nao_contatado,
          COUNT(*) FILTER (WHERE crm_status = 'Ainda Não')::int AS status_ainda_nao,
          COUNT(*) FILTER (WHERE crm_status = 'Retorno')::int AS status_retorno,
          COUNT(*) FILTER (WHERE crm_status = 'Quente')::int AS status_quente,
          COUNT(*) FILTER (WHERE crm_status = 'Muito Quente')::int AS status_muito_quente,
          COUNT(*) FILTER (WHERE crm_status = 'Proposta')::int AS status_proposta,
          COUNT(*) FILTER (WHERE crm_status = 'Aguardando Closer')::int AS status_aguardando_closer,
          COUNT(*) FILTER (WHERE crm_status = 'Telefone Invalido')::int AS status_telefone_invalido,
          COUNT(*) FILTER (WHERE crm_status = 'Fechado')::int AS status_fechado
        FROM execucao_status
      `, vendedorParams),

      // 9. Execution per-vendedor stats
      query(`
        WITH exec_cnpjs AS (
          SELECT DISTINCT pe.cnpj FROM projetos_execucao pe
        ),
        exec_owners AS (
          SELECT
            vp.vendedor_id,
            u.nome AS vendedor_nome,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))::int AS total_cnpjs,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')) FILTER (
              WHERE COALESCE(vp.status_contato_execucao, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado')
            )::int AS nao_contatado,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')) FILTER (
              WHERE vp.status_contato_execucao = 'Retorno'
            )::int AS retorno,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')) FILTER (
              WHERE vp.status_contato_execucao = 'Proposta'
            )::int AS proposta,
            COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')) FILTER (
              WHERE vp.status_contato_execucao = 'Fechado'
            )::int AS fechado
          FROM vendedor_projetos vp
          JOIN users u ON u.id = vp.vendedor_id
          WHERE vp.vendedor_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM exec_cnpjs ec
              WHERE ec.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
            )
            ${isFiltered ? 'AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
          GROUP BY vp.vendedor_id, u.nome
          ORDER BY total_cnpjs DESC
        )
        SELECT * FROM exec_owners
      `, vendedorParams),

      // 10. Top execution alert CNPJs (zero desembolso, most value at risk)
      query(`
        WITH alert_cnpjs AS (
          SELECT
            pe.cnpj,
            MAX(pe.nome_proponente) AS nome,
            SUM(pe.valor_global) AS valor_global,
            COUNT(*)::int AS total_convenios,
            SUM(CASE WHEN pe.valor_desembolsado = 0 THEN 1 ELSE 0 END)::int AS alert_count,
            MIN(pe.data_fim_vigencia) AS vigencia_proxima
          FROM projetos_execucao pe
          WHERE pe.valor_desembolsado = 0
          ${isFiltered ? `AND EXISTS (
            SELECT 1 FROM vendedor_projetos vp_o
            WHERE REGEXP_REPLACE(vp_o.cnpj, '[^0-9]', '', 'g') = pe.cnpj
              AND (vp_o.vendedor_id = $1 OR vp_o.closer_id = $1)
          )` : ''}
          GROUP BY pe.cnpj
          ORDER BY SUM(pe.valor_global) DESC
          LIMIT 8
        )
        SELECT
          ac.*,
          (SELECT u.nome FROM vendedor_projetos vp2 JOIN users u ON u.id = vp2.vendedor_id
           WHERE REGEXP_REPLACE(vp2.cnpj, '[^0-9]', '', 'g') = ac.cnpj AND vp2.vendedor_id IS NOT NULL
           LIMIT 1) AS vendedor_nome
        FROM alert_cnpjs ac
      `, vendedorParams),
    ])

    const g = globalRows[0] || {}
    const execucao = execucaoPipelineRows[0] || {}
    const todayByVendedor = new Map<string, { ligacoes: number; propostas: number; fechados: number }>()
    for (const t of todayRows) {
      todayByVendedor.set(t.vendedor_id as string, {
        ligacoes: Number(t.ligacoes_hoje),
        propostas: Number(t.propostas_hoje),
        fechados: Number(t.fechados_hoje),
      })
    }

    return NextResponse.json({
      role: session.role,
      global: {
        total_leads: Number(g.total_leads) || 0,
        total_assigned: Number(g.total_assigned) || 0,
        total_unassigned: Number(g.total_unassigned) || 0,
        total_valor_emenda: Number(g.total_valor_emenda) || 0,
        by_status: {
          'Não Contatado': Number(g.status_nao_contatado) || 0,
          'Ainda Não': Number(g.status_ainda_nao) || 0,
          'Retorno': Number(g.status_retorno) || 0,
          'Proposta': Number(g.status_proposta) || 0,
          'Aguardando Closer': Number(g.status_aguardando_closer) || 0,
          'Fechado': Number(g.status_fechado) || 0,
        },
      },
      execucao_pipeline: {
        total_cnpjs: Number(execucao.total_cnpjs) || 0,
        total_valor_global: Number(execucao.total_valor_global) || 0,
        total_saldo: Number(execucao.total_saldo) || 0,
        total_alertas: Number(execucao.total_alertas) || 0,
        by_status: {
          [EXECUCAO_PIPELINE_STATUSES[0]]: Number(execucao.status_nao_contatado) || 0,
          [EXECUCAO_PIPELINE_STATUSES[1]]: Number(execucao.status_ainda_nao) || 0,
          [EXECUCAO_PIPELINE_STATUSES[2]]: Number(execucao.status_retorno) || 0,
          [EXECUCAO_PIPELINE_STATUSES[3]]: Number(execucao.status_quente) || 0,
          [EXECUCAO_PIPELINE_STATUSES[4]]: Number(execucao.status_muito_quente) || 0,
          [EXECUCAO_PIPELINE_STATUSES[5]]: Number(execucao.status_proposta) || 0,
          [EXECUCAO_PIPELINE_STATUSES[6]]: Number(execucao.status_aguardando_closer) || 0,
          [EXECUCAO_PIPELINE_STATUSES[7]]: Number(execucao.status_telefone_invalido) || 0,
          [EXECUCAO_PIPELINE_STATUSES[8]]: Number(execucao.status_fechado) || 0,
        },
      },
      vendedores: vendedorRows.map((v: Record<string, unknown>) => {
        const today = todayByVendedor.get(v.vendedor_id as string)
        return {
          vendedor_id: v.vendedor_id,
          vendedor_nome: v.vendedor_nome,
          total_leads: Number(v.total_leads),
          nao_contatado: Number(v.nao_contatado),
          retorno: Number(v.retorno),
          proposta: Number(v.proposta),
          aguardando_closer: Number(v.aguardando_closer) || 0,
          fechado: Number(v.fechado),
          valor_total_emenda: Number(v.valor_total_emenda),
          comissao_total: Number(v.comissao_total),
          last_activity: v.last_activity,
          ligacoes_hoje: today?.ligacoes || 0,
          propostas_hoje: today?.propostas || 0,
          fechados_hoje: today?.fechados || 0,
        }
      }),
      recent_activity: recentRows.map((r: Record<string, unknown>) => ({
        cnpj: r.cnpj,
        nome: r.nome,
        vendedor_nome: r.vendedor_nome,
        status_contato: r.status_contato,
        updated_at: r.updated_at,
      })),
      commission_breakdown: commissionRows.map(r => ({
        status_contato: r.status_contato,
        count: Number(r.count),
        total_comissao: Number(r.total_comissao) || 0,
        total_venda: Number(r.total_venda) || 0,
        locked_count: Number(r.locked_count) || 0,
      })),
      contact_health: {
        stale_count: Number(contactHealthRows[0]?.stale_count) || 0,
        never_contacted_count: Number(contactHealthRows[0]?.never_contacted_count) || 0,
        invalid_phone_count: Number(contactHealthRows[0]?.invalid_phone_count) || 0,
      },
      execucao_vendedores: execVendedorRows.map((v: Record<string, unknown>) => ({
        vendedor_id: v.vendedor_id,
        vendedor_nome: v.vendedor_nome,
        total_cnpjs: Number(v.total_cnpjs) || 0,
        nao_contatado: Number(v.nao_contatado) || 0,
        retorno: Number(v.retorno) || 0,
        proposta: Number(v.proposta) || 0,
        fechado: Number(v.fechado) || 0,
      })),
      execucao_alerts: execAlertRows.map((r: Record<string, unknown>) => ({
        cnpj: r.cnpj,
        nome: r.nome,
        valor_global: Number(r.valor_global) || 0,
        total_convenios: Number(r.total_convenios) || 0,
        alert_count: Number(r.alert_count) || 0,
        vigencia_proxima: r.vigencia_proxima,
        vendedor_nome: r.vendedor_nome,
      })),
      stale_leads: staleLeadsRows.map(r => ({
        cnpj: r.cnpj,
        nome: r.nome,
        vendedor_nome: r.vendedor_nome,
        status_contato: r.status_contato,
        last_contact_date: r.last_contact_date,
        days_since_last_contact: r.days_since_last_contact != null ? Number(r.days_since_last_contact) : null,
        principal_telefone_status: r.principal_telefone_status,
      })),
    })
  } catch (error) {
    console.error('Dashboard CRM query error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
