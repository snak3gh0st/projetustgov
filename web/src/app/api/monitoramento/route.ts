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
    const saldoMin = Number(searchParams.get('saldo_min') || '500000')
    const ufFilter = searchParams.get('uf')
    const searchTerm = searchParams.get('search')
    const limit = Number(searchParams.get('limit') || '1000')

    const conditions: string[] = [
      "situacao = 'Em execução'",
      'saldo_conta IS NOT NULL',
      'saldo_conta > 0',
    ]
    const params: unknown[] = []
    let paramIndex = 1

    // Saldo minimum filter
    conditions.push(`saldo_conta >= $${paramIndex++}`)
    params.push(saldoMin)

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
       ORDER BY saldo_conta DESC
       LIMIT $${paramIndex}`,
      params
    )

    // Compute priority and perc_execucao for each row
    const convenios = rows.map((row: Record<string, unknown>) => {
      const valorGlobal = Number(row.valor_global) || 0
      const valorLiberado = Number(row.valor_liberado) || 0
      const saldoConta = Number(row.saldo_conta) || 0
      const percExecucao = valorGlobal > 0 ? (valorLiberado / valorGlobal) * 100 : 0

      let prioridade: string
      if (percExecucao < 30 && saldoConta >= 500000) {
        prioridade = 'Alta'
      } else if (percExecucao > 70) {
        prioridade = 'Baixa'
      } else {
        prioridade = 'Média'
      }

      return {
        ...row,
        prioridade,
        perc_execucao: Math.round(percExecucao * 10) / 10,
      }
    })

    // Apply priority filter after computation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered: any[] = prioridadeFilter
      ? convenios.filter((c) => c.prioridade === prioridadeFilter)
      : convenios

    // Compute stats from filtered results
    const stats = {
      total_monitorados: filtered.length,
      total_saldo: filtered.reduce((sum: number, c) => sum + (Number(c.saldo_conta) || 0), 0),
      alta_prioridade: filtered.filter((c) => c.prioridade === 'Alta').length,
      media_prioridade: filtered.filter((c) => c.prioridade === 'Média').length,
      baixa_prioridade: filtered.filter((c) => c.prioridade === 'Baixa').length,
    }

    return NextResponse.json({ stats, convenios: filtered })
  } catch (error) {
    console.error('Monitoramento query error:', error)
    return NextResponse.json({ error: 'Failed to fetch monitoramento data' }, { status: 500 })
  }
}
