import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const vendedorId = searchParams.get('vendedor_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const fechadoOnly = searchParams.get('fechado_only')

    // Build dynamic WHERE clause — comissão só para Fechados
    const filters: string[] = ['vp.vendedor_id IS NOT NULL', 'vp.comissao_valor IS NOT NULL', 'vp.comissao_valor > 0', "vp.status_contato = 'Fechado'"]
    const params: unknown[] = []
    let paramIndex = 1

    // Role-based filtering: vendedor always sees only their own
    // coordenador sees their own + leads where they are closer
    if (session.role === 'vendedor') {
      filters.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(session.userId)
    } else if (session.role === 'coordenador' && !vendedorId) {
      // Paulo sees leads where he is vendedor OR closer
      filters.push(`(vp.vendedor_id = $${paramIndex} OR vp.closer_id = $${paramIndex})`)
      params.push(session.userId)
      paramIndex++
    } else if (vendedorId) {
      // Gestor can filter by specific vendedor
      filters.push(`vp.vendedor_id = $${paramIndex++}`)
      params.push(vendedorId)
    }

    if (startDate) {
      filters.push(`vp.updated_at >= $${paramIndex++}::timestamp`)
      params.push(`${startDate} 00:00:00`)
    }

    if (endDate) {
      filters.push(`vp.updated_at <= $${paramIndex++}::timestamp`)
      params.push(`${endDate} 23:59:59`)
    }

    const whereClause = filters.join(' AND ')

    // Show Paulo's 3-type breakdown for coordenador (Paulo himself) and gestor (admins)
    const isPauloView = session.role === 'coordenador' || session.role === 'gestor'

    // Run all queries in parallel
    const showPerVendedor = (session.role !== 'vendedor') && !vendedorId

    const [leadsRows, summaryRows, perVendedorRows, vendedoresRows] = await Promise.all([
      // Main query: Individual leads with commission details
      query(`
        SELECT
          vp.id,
          vp.cnpj,
          vp.nome,
          vp.valor_emenda,
          COALESCE(vp.valor_venda, 0) as valor_venda,
          vp.tipo_vendedor,
          vp.comissao_percentual,
          vp.comissao_valor,
          COALESCE(vp.comissao_bonus, 0) as comissao_bonus,
          vp.comissao_locked,
          COALESCE(vp.status_contato, 'Nao Contatado') as status_contato,
          u.nome as vendedor_nome,
          u.role as vendedor_role,
          vp.vendedor_id,
          vp.closer_id,
          uc.nome as closer_nome,
          vp.closer_comissao_percentual,
          COALESCE(vp.closer_comissao_valor, 0) as closer_comissao_valor,
          vp.updated_at,
          CASE WHEN co.id IS NOT NULL THEN true ELSE false END as has_override,
          co.motivo as override_motivo
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        LEFT JOIN users uc ON uc.id = vp.closer_id
        LEFT JOIN commission_overrides co ON co.lead_id = vp.id AND co.active = true
        WHERE ${whereClause}
        ORDER BY vp.updated_at DESC
      `, params),

      // Summary query
      query(`
        SELECT
          COUNT(DISTINCT vp.cnpj)::int as total_leads,
          SUM(vp.comissao_valor)::numeric as total_comissao,
          SUM(COALESCE(vp.comissao_bonus, 0))::numeric as total_bonus,
          SUM(COALESCE(vp.closer_comissao_valor, 0))::numeric as total_closer_comissao,
          COALESCE(SUM(vp.valor_venda), 0)::numeric as total_valor_venda,
          SUM(vp.valor_emenda)::numeric as total_valor_emenda
        FROM vendedor_projetos vp
        WHERE ${whereClause}
      `, params),

      // Per-vendedor summary (gestor only)
      showPerVendedor ? query(`
        SELECT
          vp.vendedor_id,
          u.nome as vendedor_nome,
          u.role as vendedor_role,
          COUNT(DISTINCT vp.cnpj)::int as lead_count,
          SUM(vp.comissao_valor)::numeric as total_comissao,
          SUM(COALESCE(vp.comissao_bonus, 0))::numeric as total_bonus,
          SUM(CASE WHEN vp.status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as fechados_count
        FROM vendedor_projetos vp
        JOIN users u ON u.id = vp.vendedor_id
        WHERE ${whereClause}
        GROUP BY vp.vendedor_id, u.nome, u.role
        ORDER BY total_comissao DESC
      `, params) : Promise.resolve([]),

      // Vendedores list (for filter dropdown)
      query(`
        SELECT DISTINCT u.id, u.nome
        FROM users u
        JOIN vendedor_projetos vp ON vp.vendedor_id = u.id
        WHERE u.role IN ('vendedor', 'coordenador') AND u.active = true
        ORDER BY u.nome
      `),
    ])

    const summary = summaryRows[0] || {}
    const perVendedor = perVendedorRows.map(v => {
      const isGestor = v.vendedor_role === 'gestor'
      return {
        vendedor_id: v.vendedor_id,
        vendedor_nome: v.vendedor_nome,
        lead_count: Number(v.lead_count),
        total_comissao: isGestor ? 0 : (Number(v.total_comissao) || 0),
        total_bonus: isGestor ? 0 : (Number(v.total_bonus) || 0),
        fechados_count: Number(v.fechados_count) || 0,
      }
    })

    // Paulo's 3-type commission breakdown (visible to Paulo and gestors)
    let pauloBreakdown = null
    if (isPauloView) {
      // Resolve Paulo's ID: if gestor is viewing, look up Paulo; if Paulo himself, use session
      let pauloUserId = session.userId
      if (session.role === 'gestor') {
        const pauloLookup = await query(
          "SELECT id FROM users WHERE email = 'paulo@projetus.org' AND active = true LIMIT 1"
        )
        pauloUserId = pauloLookup[0]?.id as string ?? null
      }

      if (!pauloUserId) {
        // Paulo not found — skip breakdown
      } else {
      // Build date filters for Paulo queries
      const pauloFilters: string[] = ["vp.status_contato = 'Fechado'"]
      const pauloParams: unknown[] = []
      let pIdx = 1
      if (startDate) { pauloFilters.push(`vp.updated_at >= $${pIdx++}::timestamp`); pauloParams.push(`${startDate} 00:00:00`) }
      if (endDate) { pauloFilters.push(`vp.updated_at <= $${pIdx++}::timestamp`); pauloParams.push(`${endDate} 23:59:59`) }
      const pauloWhere = pauloFilters.join(' AND ')

      const [exclusivoRows, closerRows, coordenadorRows] = await Promise.all([
        // Exclusivo: Paulo's own clients (tipo_vendedor = 'Exclusivo', vendedor_id = Paulo)
        query(`
          SELECT
            COALESCE(SUM(vp.comissao_valor), 0)::numeric as total,
            COUNT(DISTINCT vp.cnpj)::int as count,
            COALESCE(SUM(vp.valor_venda), 0)::numeric as valor_venda
          FROM vendedor_projetos vp
          WHERE ${pauloWhere}
            AND vp.tipo_vendedor = 'Exclusivo'
            AND vp.vendedor_id = $${pIdx}
        `, [...pauloParams, pauloUserId]),

        // Closer: leads where Paulo is closer_id + Fechado
        query(`
          SELECT
            COALESCE(SUM(vp.closer_comissao_valor), 0)::numeric as total,
            COUNT(DISTINCT vp.cnpj)::int as count,
            COALESCE(SUM(vp.valor_venda), 0)::numeric as valor_venda
          FROM vendedor_projetos vp
          WHERE ${pauloWhere}
            AND vp.closer_id = $${pIdx}
            AND vp.closer_comissao_valor IS NOT NULL
            AND vp.closer_comissao_valor > 0
        `, [...pauloParams, pauloUserId]),

        // Coordenador: 1% of regular vendedores' Fechado sales
        // Excludes Tito (gestor role) and Paulo's own leads (coordenador role)
        query(`
          SELECT
            COALESCE(SUM(vp.valor_venda) * 0.01, 0)::numeric as total,
            COUNT(DISTINCT vp.cnpj)::int as count,
            COALESCE(SUM(vp.valor_venda), 0)::numeric as valor_venda
          FROM vendedor_projetos vp
          JOIN users u ON u.id = vp.vendedor_id
          WHERE ${pauloWhere}
            AND vp.vendedor_id IS NOT NULL
            AND vp.valor_venda > 0
            AND u.role = 'vendedor'
            AND vp.vendedor_id != $${pIdx}
        `, [...pauloParams, pauloUserId]),
      ])

      const exclusivoTotal = Number(exclusivoRows[0]?.total) || 0
      const closerTotal = Number(closerRows[0]?.total) || 0
      const coordenadorTotal = Number(coordenadorRows[0]?.total) || 0

      pauloBreakdown = {
        exclusivo: {
          total: exclusivoTotal,
          count: Number(exclusivoRows[0]?.count) || 0,
          valor_venda: Number(exclusivoRows[0]?.valor_venda) || 0,
        },
        closer: {
          total: closerTotal,
          count: Number(closerRows[0]?.count) || 0,
          valor_venda: Number(closerRows[0]?.valor_venda) || 0,
        },
        coordenador: {
          total: coordenadorTotal,
          count: Number(coordenadorRows[0]?.count) || 0,
          valor_venda: Number(coordenadorRows[0]?.valor_venda) || 0,
        },
        total_geral: exclusivoTotal + closerTotal + coordenadorTotal,
      }
    } // else pauloUserId found
    } // isPauloView

    // Map leads, zeroing out comissao_bonus for coordenador on split leads
    // where they are the closer but not the vendedor (bonus belongs to the SDR).
    // Also zero out all commission fields for gestor-role vendedores (Tito) — gestors
    // are socio/owners and never earn commission.
    const mappedLeads = leadsRows.map(lead => {
      const isCloserNotVendedor =
        session.role === 'coordenador' &&
        lead.closer_id === session.userId &&
        lead.vendedor_id !== session.userId
      const isGestorLead = lead.vendedor_role === 'gestor'
      return {
        id: lead.id,
        cnpj: lead.cnpj,
        nome: lead.nome,
        valor_emenda: Number(lead.valor_emenda) || 0,
        valor_venda: Number(lead.valor_venda) || 0,
        tipo_vendedor: lead.tipo_vendedor,
        comissao_percentual: Number(lead.comissao_percentual) || 0,
        comissao_valor: isGestorLead ? 0 : (Number(lead.comissao_valor) || 0),
        comissao_bonus: (isCloserNotVendedor || isGestorLead) ? 0 : (Number(lead.comissao_bonus) || 0),
        comissao_locked: Boolean(lead.comissao_locked),
        status_contato: lead.status_contato,
        vendedor_nome: lead.vendedor_nome,
        vendedor_id: lead.vendedor_id,
        closer_id: lead.closer_id || null,
        closer_nome: lead.closer_nome || null,
        closer_comissao_percentual: Number(lead.closer_comissao_percentual) || 0,
        closer_comissao_valor: isGestorLead ? 0 : (Number(lead.closer_comissao_valor) || 0),
        updated_at: lead.updated_at,
        has_override: Boolean(lead.has_override),
        override_motivo: lead.override_motivo,
      }
    })

    // Recompute summary totals from mapped leads so they match the corrected per-lead values
    // (e.g. gestor-role leads have comissao zeroed in mappedLeads but would still appear in raw SQL sums)
    const total_bonus_corrected = mappedLeads.reduce((sum, l) => sum + (l.comissao_bonus || 0), 0)
    const total_comissao_corrected = mappedLeads.reduce((sum, l) => sum + (l.comissao_valor || 0), 0)
    const total_closer_comissao_corrected = mappedLeads.reduce((sum, l) => sum + (l.closer_comissao_valor || 0), 0)

    return NextResponse.json({
      role: session.role,
      summary: {
        total_leads: Number(summary.total_leads) || 0,
        total_comissao: total_comissao_corrected,
        total_bonus: total_bonus_corrected,
        total_closer_comissao: total_closer_comissao_corrected,
        total_valor_venda: Number(summary.total_valor_venda) || 0,
        total_valor_emenda: Number(summary.total_valor_emenda) || 0,
      },
      per_vendedor: perVendedor,
      paulo_breakdown: pauloBreakdown,
      leads: mappedLeads,
      vendedores_list: vendedoresRows.map(v => ({
        id: v.id,
        nome: v.nome,
      })),
      filters_applied: {
        vendedor_id: vendedorId,
        start_date: startDate,
        end_date: endDate,
        fechado_only: fechadoOnly === 'true',
      },
    })
  } catch (error) {
    console.error('Comissoes query error:', error)
    return NextResponse.json({ error: 'Failed to fetch commission data' }, { status: 500 })
  }
}
