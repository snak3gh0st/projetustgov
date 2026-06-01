import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { normalizeCrmStatus } from '@/lib/crm-catalog'

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
    const filterVendedorId = (session.role === 'vendedor' || session.role === 'coordenador') ? session.userId : vendedorId

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
    const projetos = rows as Array<{ cnpj?: string | null; valor_global?: string | number | null; status_contato?: string | null }>
    const uniqueCnpjs = new Set(projetos.map(p => p.cnpj))

    const volumeFinanceiro = projetos.reduce((sum, p) => sum + (Number(p.valor_global) || 0), 0)

    const porCategoria = projetos.reduce((acc, projeto) => {
      const status = normalizeCrmStatus(projeto.status_contato || 'Não Contatado')
      if (status === 'Não Contatado') acc['Não Contatado'] += 1
      else if (status === 'Sem Interesse') acc['Sem Interesse'] += 1
      else if (status === 'Em Atendimento') acc['Em Atendimento'] += 1
      else if (status === 'Proposta Enviada') acc['Proposta Enviada'] += 1
      else if (status === 'Em Aprovação') acc['Em Aprovação'] += 1
      else if (status === 'Fechado') acc['Fechado'] += 1
      return acc
    }, {
      'Não Contatado': 0,
      'Sem Interesse': 0,
      'Em Atendimento': 0,
      'Proposta Enviada': 0,
      'Em Aprovação': 0,
      'Fechado': 0,
    } as Record<string, number>)

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
