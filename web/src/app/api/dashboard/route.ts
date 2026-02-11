import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vendedorId = searchParams.get('vendedor_id')

    // If vendedor role, force their own ID
    const filterVendedorId = session.role === 'vendedor' ? session.userId : vendedorId

    const vendedorFilter = filterVendedorId ? 'AND vp.vendedor_id = $1' : ''
    const params = filterVendedorId ? [filterVendedorId] : []

    // Get all projects for this vendedor to compute stats
    const rows = await query(`
      SELECT vp.*, u.nome as vendedor_nome
      FROM vendedor_projetos vp
      LEFT JOIN users u ON vp.vendedor_id = u.id
      WHERE 1=1 ${vendedorFilter}
    `, params)

    // Compute stats
    const projetos = rows as Record<string, unknown>[]
    const uniqueCnpjs = new Set(projetos.map(p => p.cnpj))

    const volumeFinanceiro = projetos.reduce((sum, p) => sum + (Number(p.valor_global) || 0), 0)

    const porCategoria = {
      'Novo': projetos.filter(p => p.status_contato === 'Novo' || !p.status_contato).length,
      'Contactado': projetos.filter(p => p.status_contato === 'Contactado').length,
      'Proposta': projetos.filter(p => p.status_contato === 'Proposta').length,
      'Retorno': projetos.filter(p => p.status_contato === 'Retorno').length,
    }

    return NextResponse.json({
      stats: {
        total_clientes: uniqueCnpjs.size,
        total_projetos: projetos.length,
        volume_financeiro: volumeFinanceiro,
        por_categoria: porCategoria,
      },
      projetos,
    })
  } catch (error) {
    console.error('Dashboard query error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
