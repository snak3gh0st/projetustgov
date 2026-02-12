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
    const vendedorFilter = isVendedor ? ' AND vp.vendedor_id = $1' : ''
    const vendedorParams = isVendedor ? [session.userId] : []

    // Get all leads with commission
    const leadsRows = await query(`
      SELECT
        vp.cnpj,
        vp.nome,
        vp.valor_emenda,
        vp.tipo_vendedor,
        vp.comissao_percentual,
        vp.comissao_valor,
        COALESCE(vp.status_contato, 'Não Contatado') as status_contato,
        u.nome as vendedor_nome,
        vp.updated_at
      FROM vendedor_projetos vp
      JOIN users u ON u.id = vp.vendedor_id
      WHERE vp.vendedor_id IS NOT NULL
        AND vp.comissao_valor IS NOT NULL
        AND vp.comissao_valor > 0
        ${vendedorFilter}
      ORDER BY vp.comissao_valor DESC
    `, vendedorParams)

    // Calculate stats
    const totalComissao = leadsRows.reduce((sum, lead) => sum + Number(lead.comissao_valor || 0), 0)
    const comissaoPorStatus = {
      'Não Contatado': 0,
      'Retorno': 0,
      'Proposta': 0,
      'Fechado': 0,
    }

    for (const lead of leadsRows) {
      const status = lead.status_contato as keyof typeof comissaoPorStatus
      if (status in comissaoPorStatus) {
        comissaoPorStatus[status] += Number(lead.comissao_valor || 0)
      }
    }

    return NextResponse.json({
      total_comissao: totalComissao,
      total_leads_com_comissao: leadsRows.length,
      comissao_por_status: comissaoPorStatus,
      leads: leadsRows.map(lead => ({
        cnpj: lead.cnpj,
        nome: lead.nome,
        valor_emenda: Number(lead.valor_emenda),
        tipo_vendedor: lead.tipo_vendedor,
        comissao_percentual: Number(lead.comissao_percentual),
        comissao_valor: Number(lead.comissao_valor),
        status_contato: lead.status_contato,
        vendedor_nome: lead.vendedor_nome,
        updated_at: lead.updated_at,
      })),
    })
  } catch (error) {
    console.error('Comissoes query error:', error)
    return NextResponse.json({ error: 'Failed to fetch commission data' }, { status: 500 })
  }
}
