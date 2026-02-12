import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // All queries in parallel
    const [
      totalRow,
      byUfRows,
      byVendedorRows,
      byCategoriaRows,
      topClientsRows,
      execDistRows,
    ] = await Promise.all([
      // Total stats
      query(`
        SELECT
          COUNT(*) as total_projetos,
          COUNT(DISTINCT cnpj) as total_clientes,
          COALESCE(SUM(COALESCE(valor_global, 0)), 0) as volume_total
        FROM vendedor_projetos
      `),
      // By UF
      query(`
        SELECT
          uf,
          COUNT(*) as count,
          COALESCE(SUM(COALESCE(valor_global, 0)), 0) as valor_global
        FROM vendedor_projetos
        WHERE uf IS NOT NULL AND uf != ''
        GROUP BY uf
        ORDER BY count DESC
      `),
      // By vendedor
      query(`
        SELECT
          u.nome,
          u.id as vendedor_id,
          COUNT(*) as projetos,
          COUNT(DISTINCT vp.cnpj) as clientes,
          COALESCE(SUM(COALESCE(vp.valor_global, 0)), 0) as valor_global,
          COUNT(*) FILTER (WHERE vp.status_contato = 'Proposta') as propostas
        FROM vendedor_projetos vp
        JOIN users u ON vp.vendedor_id = u.id
        GROUP BY u.id, u.nome
        ORDER BY valor_global DESC
      `),
      // By categoria (status_contato)
      query(`
        SELECT
          COALESCE(status_contato, 'Ainda Não') as categoria,
          COUNT(*) as count
        FROM vendedor_projetos
        GROUP BY COALESCE(status_contato, 'Ainda Não')
      `),
      // Top 10 clients by valor_global
      query(`
        SELECT
          cnpj,
          nome,
          uf,
          COUNT(*) as projetos,
          COALESCE(SUM(COALESCE(valor_global, 0)), 0) as valor_global_total,
          CASE WHEN SUM(COALESCE(valor_global, 0)) > 0
            THEN (SUM(COALESCE(valor_liberado, 0)) / SUM(COALESCE(valor_global, 0)) * 100)
            ELSE 0
          END as perc_liberado
        FROM vendedor_projetos
        GROUP BY cnpj, nome, uf
        ORDER BY valor_global_total DESC
        LIMIT 10
      `),
      // Liberacao distribution (buckets based on valor_liberado/valor_global)
      query(`
        SELECT
          CASE
            WHEN valor_global IS NULL OR valor_global = 0 THEN 'N/A'
            WHEN (COALESCE(valor_liberado, 0) / valor_global * 100) < 10 THEN '0-10%'
            WHEN (COALESCE(valor_liberado, 0) / valor_global * 100) < 25 THEN '10-25%'
            WHEN (COALESCE(valor_liberado, 0) / valor_global * 100) < 50 THEN '25-50%'
            WHEN (COALESCE(valor_liberado, 0) / valor_global * 100) < 75 THEN '50-75%'
            ELSE '75-100%'
          END as range,
          COUNT(*) as count,
          COALESCE(SUM(COALESCE(valor_global, 0)), 0) as valor_global
        FROM vendedor_projetos
        GROUP BY range
        ORDER BY range
      `),
    ])

    const totals = (totalRow as Record<string, unknown>[])[0] || {}

    return NextResponse.json({
      totals: {
        projetos: Number(totals.total_projetos) || 0,
        clientes: Number(totals.total_clientes) || 0,
        volume: Number(totals.volume_total) || 0,
      },
      byUf: byUfRows,
      byVendedor: byVendedorRows,
      byCategoria: byCategoriaRows,
      topClients: topClientsRows,
      execDist: execDistRows,
    })
  } catch (error) {
    console.error('Enhanced dashboard error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
