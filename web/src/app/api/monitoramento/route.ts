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

    const { searchParams } = new URL(request.url)
    const prioridadeFilter = searchParams.get('prioridade')
    const valorMin = Number(searchParams.get('valor_min') || '0')
    const ufFilter = searchParams.get('uf')
    const searchTerm = searchParams.get('search')
    const limit = Number(searchParams.get('limit') || '1000')

    const conditions: string[] = [
      'valor_emenda IS NOT NULL',
      'valor_emenda > 0',
    ]
    const params: unknown[] = []
    let paramIndex = 1

    if (valorMin > 0) {
      conditions.push(`valor_emenda >= $${paramIndex++}`)
      params.push(valorMin)
    }

    if (ufFilter) {
      conditions.push(`uf = $${paramIndex++}`)
      params.push(ufFilter)
    }

    if (searchTerm) {
      conditions.push(`(nome ILIKE $${paramIndex} OR cnpj LIKE $${paramIndex})`)
      params.push(`%${searchTerm}%`)
      paramIndex++
    }

    params.push(limit)

    const rows = await query(
      `SELECT * FROM vendedor_projetos
       WHERE ${conditions.join(' AND ')}
       ORDER BY valor_emenda DESC
       LIMIT $${paramIndex}`,
      params
    )

    // Compute priority based on valor_emenda
    const convenios = rows.map((row: Record<string, unknown>) => {
      const valorEmenda = Number(row.valor_emenda) || 0
      const valorGlobal = Number(row.valor_global) || 0
      const valorLiberado = Number(row.valor_liberado) || 0
      const saldoConta = Number(row.saldo_conta) || 0

      // Priority based on emenda value
      let prioridade: string
      if (valorEmenda >= 1000000) {
        prioridade = 'Alta'
      } else if (valorEmenda >= 300000) {
        prioridade = 'Media'
      } else {
        prioridade = 'Baixa'
      }

      // Execution percentage (when data is available)
      const percExecucao = valorGlobal > 0 ? (valorLiberado / valorGlobal) * 100 : 0

      return {
        ...row,
        prioridade,
        perc_execucao: Math.round(percExecucao * 10) / 10,
        // Use valor_emenda as the main financial metric
        saldo_conta: saldoConta || valorEmenda,
      }
    })

    // Apply priority filter after computation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered: any[] = prioridadeFilter
      ? convenios.filter((c) => c.prioridade === prioridadeFilter)
      : convenios

    const stats = {
      total_monitorados: filtered.length,
      total_saldo: filtered.reduce((sum: number, c) => sum + (Number(c.valor_emenda) || 0), 0),
      alta_prioridade: filtered.filter((c) => c.prioridade === 'Alta').length,
      media_prioridade: filtered.filter((c) => c.prioridade === 'Media').length,
      baixa_prioridade: filtered.filter((c) => c.prioridade === 'Baixa').length,
    }

    return NextResponse.json({ stats, convenios: filtered })
  } catch (error) {
    console.error('Monitoramento query error:', error)
    return NextResponse.json({ error: 'Failed to fetch monitoramento data' }, { status: 500 })
  }
}
