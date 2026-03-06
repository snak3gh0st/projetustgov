import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

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
    const [globalRows, vendedorRows, todayRows, recentRows, commissionRows, contactHealthRows, staleLeadsRows] = await Promise.all([
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
    ])

    const g = globalRows[0] || {}
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
