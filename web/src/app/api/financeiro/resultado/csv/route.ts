import { NextResponse } from 'next/server'
import { canReadBiFinanceiro, getApiSession } from '@/lib/dal'
import { ccParam, periodParam } from '@/lib/financeiro/api'
import { getResultado } from '@/lib/financeiro/queries'

export const dynamic = 'force-dynamic'

const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

function cell(v: string) {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** DRE as a CSV that opens directly in a pt-BR spreadsheet (semicolons, decimal comma, UTF-8 BOM). */
export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session || !canReadBiFinanceiro(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const q = new URL(request.url).searchParams
  const regime = q.get('regime') === 'cash' ? 'cash' : 'comp'
  const r = await getResultado({ period: periodParam(q.get('period')), regime, cc: ccParam(q.get('cc')) })

  const lines: string[] = []
  lines.push(['Linha', 'Código', ...r.months, 'Total'].map(cell).join(';'))
  const row = (label: string, codigo: string, values: number[]) =>
    lines.push([label, codigo, ...values.map((v) => num.format(v)), num.format(values.reduce((a, b) => a + b, 0))].map(cell).join(';'))
  for (const l of r.rows) {
    row(`${'  '.repeat(l.nivel)}${l.descricao}`, l.codigo ?? '', l.values)
    for (const c of l.categorias) row(`${'  '.repeat(l.nivel + 1)}${c.nome}`, '', c.values)
  }
  row('Lançamentos fora do DRE', '', r.foraDoDre.values)
  for (const c of r.foraDoDre.categorias) row(`  ${c.nome}`, '', c.values)

  const name = `dre-${regime === 'cash' ? 'caixa' : 'competencia'}-${r.months[0]}-a-${r.months[r.months.length - 1]}.csv`
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
  })
}
