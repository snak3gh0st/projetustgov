import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    // Auth check
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Run all queries sequentially on one connection to avoid pool contention
    // Use CTE to avoid repeating expensive subquery calculation
    const statsRows = await query(`
      WITH proponente_agg AS (
        SELECT
          prop.proponente_cnpj,
          COUNT(DISTINCT prop.id) as total_propostas,
          COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
          COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
          COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
          COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
        FROM propostas prop
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
        GROUP BY prop.proponente_cnpj
      )
      SELECT
        COUNT(*)::int as total_leads,
        COUNT(CASE WHEN p.is_existing_client = true THEN 1 END)::int as existing_clients,
        COUNT(CASE WHEN p.is_existing_client = false THEN 1 END)::int as new_leads,
        SUM(COALESCE(agg.total_emendas, 0))::int as total_emendas,
        SUM(COALESCE(agg.valor_total_emendas, 0))::float as total_valor_emendas,
        AVG(COALESCE(agg.total_propostas, 0))::float as avg_propostas,
        COUNT(CASE WHEN COALESCE(agg.total_propostas, 0) <= 3 THEN 1 END)::int as high_value_leads,
        SUM(COALESCE(agg.total_convenios, 0))::int as total_convenios,
        SUM(COALESCE(agg.valor_total_desembolsos, 0))::float as total_valor_desembolsos
      FROM proponentes p
      LEFT JOIN proponente_agg agg ON p.cnpj = agg.proponente_cnpj
      WHERE p.natureza_juridica NOT ILIKE '%Administra%'
    `)

    const leadsRows = await query(
      `WITH proponente_agg AS (
        SELECT
          prop.proponente_cnpj,
          COUNT(DISTINCT prop.id) as total_propostas,
          COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
          COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
          COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
          COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
        FROM propostas prop
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
        GROUP BY prop.proponente_cnpj
      )
      SELECT
        p.id, p.cnpj, p.nome, p.natureza_juridica, p.estado, p.municipio,
        COALESCE(agg.total_propostas, 0)::int as total_propostas,
        COALESCE(agg.total_emendas, 0)::int as total_emendas,
        COALESCE(agg.valor_total_emendas, 0)::float as valor_total_emendas,
        COALESCE(agg.total_convenios, 0)::int as total_convenios,
        COALESCE(agg.valor_total_desembolsos, 0)::float as valor_total_desembolsos,
        p.email, p.telefone, p.is_osc, p.is_existing_client
      FROM proponentes p
      LEFT JOIN proponente_agg agg ON p.cnpj = agg.proponente_cnpj
      WHERE p.natureza_juridica NOT ILIKE '%Administra%'
      ORDER BY p.is_existing_client DESC, COALESCE(agg.total_propostas, 0) ASC, COALESCE(agg.total_emendas, 0) DESC
      LIMIT 10`
    )

    const estadosRows = await query(`
      WITH estado_agg AS (
        SELECT
          prop.proponente_cnpj,
          COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
          COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas
        FROM propostas prop
        LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
        LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
        GROUP BY prop.proponente_cnpj
      )
      SELECT
        p.estado,
        COUNT(*)::int as total_proponentes,
        SUM(COALESCE(agg.total_emendas, 0))::int as total_emendas,
        SUM(COALESCE(agg.valor_total_emendas, 0))::float as total_valor_emendas
      FROM proponentes p
      LEFT JOIN estado_agg agg ON p.cnpj = agg.proponente_cnpj
      WHERE p.natureza_juridica NOT ILIKE '%Administra%' AND p.estado IS NOT NULL
      GROUP BY p.estado ORDER BY total_proponentes DESC
    `)

    const distRows = await query(`
      SELECT faixa, quantidade::int FROM (
        SELECT
          CASE
            WHEN COALESCE(agg.total_propostas, 0) = 1 THEN '1 proposta (Alto Valor)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN '2-3 propostas (Bom Valor)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN '4-5 propostas (Medio)'
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN '6-10 propostas (Baixo)'
            ELSE '10+ propostas (Muito Baixo)'
          END as faixa,
          CASE
            WHEN COALESCE(agg.total_propostas, 0) = 1 THEN 1
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN 2
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN 3
            WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN 4
            ELSE 5
          END as sort_order,
          COUNT(*)::int as quantidade
        FROM proponentes p
        LEFT JOIN (
          SELECT proponente_cnpj, COUNT(*) as total_propostas FROM propostas GROUP BY proponente_cnpj
        ) agg ON p.cnpj = agg.proponente_cnpj
        WHERE p.natureza_juridica NOT ILIKE '%Administra%'
        GROUP BY faixa, sort_order
      ) sub ORDER BY sort_order
    `)

    const r = statsRows[0] as Record<string, unknown>

    return NextResponse.json({
      stats: {
        total_leads: Number(r.total_leads) || 0,
        existing_clients: Number(r.existing_clients) || 0,
        new_leads: Number(r.new_leads) || 0,
        total_emendas: Number(r.total_emendas) || 0,
        total_valor_emendas: Number(r.total_valor_emendas) || 0,
        avg_propostas: Number(r.avg_propostas) || 0,
        high_value_leads: Number(r.high_value_leads) || 0,
        total_convenios: Number(r.total_convenios) || 0,
        total_valor_desembolsos: Number(r.total_valor_desembolsos) || 0,
      },
      leads: leadsRows,
      estados: estadosRows,
      distribution: distRows,
    })
  } catch (error) {
    console.error('Dashboard query error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
