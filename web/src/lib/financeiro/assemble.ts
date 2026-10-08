import { addDaysISO, daysBetween, monthKey } from '../conta-azul/finance/dates'
import { computeDre, resolveDreLine, type DreLinha, type DreRow } from '../conta-azul/finance/dre'

/**
 * Pure assembly for the BI Financeiro screens. SQL brings raw sums; this file
 * turns them into periods, projections, DRE rows and statuses.
 */

export type PeriodKey = '12' | 'ytd' | 'q'

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Finished months for the chosen period, oldest first (the current month is never closed). */
export function closedMonths(period: PeriodKey, today: string): string[] {
  const last = addMonths(monthKey(today), -1)
  const count = period === 'q' ? 3 : period === '12' ? 12 : Number(last.slice(5, 7))
  return Array.from({ length: count }, (_, i) => addMonths(last, i - count + 1))
}

export type Flow = { date: string; net: number }
export type ProjectionPoint = { date: string; balance: number; net: number }

/**
 * Balance projection from today's balance and open titles. Overdue titles are
 * left out (their timing is unknown); titles due today count from tomorrow,
 * since today's balance is the real one.
 */
export function dailyProjection(start: number, flows: Flow[], today: string, days: number): ProjectionPoint[] {
  const byOffset = new Map<number, number>()
  for (const f of flows) {
    const off = Math.max(1, daysBetween(today, f.date))
    if (daysBetween(today, f.date) < 0 || off > days) continue
    byOffset.set(off, (byOffset.get(off) ?? 0) + f.net)
  }
  const out: ProjectionPoint[] = [{ date: today, balance: start, net: 0 }]
  let bal = start
  for (let off = 1; off <= days; off++) {
    const net = byOffset.get(off) ?? 0
    bal += net
    out.push({ date: addDaysISO(today, off), balance: round2(bal), net: round2(net) })
  }
  return out
}

export type WeekRow = { from: string; to: string; start: number; inflow: number; outflow: number; end: number }

export function weeklyProjection(start: number, flows: Flow[], today: string, weeks: number): { weeks: WeekRow[]; minIndex: number } {
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, i) => ({
    from: addDaysISO(today, 1 + i * 7),
    to: addDaysISO(today, 7 + i * 7),
    start: 0,
    inflow: 0,
    outflow: 0,
    end: 0,
  }))
  for (const f of flows) {
    const d = daysBetween(today, f.date)
    if (d < 0) continue
    const idx = Math.floor((Math.max(1, d) - 1) / 7)
    if (idx >= weeks) continue
    if (f.net >= 0) rows[idx].inflow += f.net
    else rows[idx].outflow += -f.net
  }
  let bal = start
  let minIndex = 0
  rows.forEach((r, i) => {
    r.start = round2(bal)
    r.inflow = round2(r.inflow)
    r.outflow = round2(r.outflow)
    bal = bal + r.inflow - r.outflow
    r.end = round2(bal)
    if (r.end < rows[minIndex].end) minIndex = i
  })
  return { weeks: rows, minIndex }
}

export type CrmStatus = 'ok' | 'semfat' | 'diverg' | 'semcrm'

/** CRM sale vs Conta Azul billing: billed below 90% of the sold value is a divergence. */
export function classifyCrm(x: { vendido: number; faturado: number }): CrmStatus {
  if (x.vendido <= 0) return 'semcrm'
  if (x.faturado <= 0) return 'semfat'
  if (x.faturado < x.vendido * 0.9) return 'diverg'
  return 'ok'
}

/** Share of what came due that is still unpaid. */
export function nonPaymentRate(rows: { valor_total: number; nao_pago: number }[]): number {
  const due = rows.reduce((a, r) => a + r.valor_total, 0)
  if (!due) return 0
  return round4(rows.reduce((a, r) => a + r.nao_pago, 0) / due)
}

export type StatusTone = 'good' | 'warn' | 'bad' | 'accent' | 'neutral'
export type ParcelStatus = { key: 'pago' | 'vencido' | 'hoje' | 'aberto'; label: string; tone: StatusTone; days?: number }

export function parcelStatus(p: { data_vencimento: string | null; nao_pago: number; valor_pago: number }, today: string): ParcelStatus {
  if (p.nao_pago <= 0.004) return { key: 'pago', label: 'Liquidado', tone: 'good' }
  if (!p.data_vencimento) return { key: 'aberto', label: 'A vencer', tone: 'neutral' }
  const late = daysBetween(p.data_vencimento, today)
  if (late > 0) {
    const days = `${late} ${late === 1 ? 'dia' : 'dias'} em atraso`
    return { key: 'vencido', label: p.valor_pago > 0 ? `Parcial, ${days}` : days, tone: late > 30 ? 'bad' : 'warn', days: late }
  }
  if (late === 0) return { key: 'hoje', label: 'Vence hoje', tone: 'accent' }
  return { key: 'aberto', label: 'A vencer', tone: 'neutral' }
}

/* ---------------------------------------------------------------- DRE */

/** Conta Azul's category `entrada_dre` enum mapped to the codes of its standard DRE tree. */
const ENTRADA_CODES: Record<string, string> = {
  RECEITA_VENDA_PRODUTOS_SERVICOS: '01.1',
  RECEITA_FRETES_ENTREGAS: '01.1',
  IMPOSTOS_SOBRE_VENDAS: '02.1',
  DESCONTOS_INCONDICIONAIS: '02',
  DEVOLUCOES_VENDAS: '02',
  COMISSOES_SOBRE_VENDAS: '02.2',
  CUSTO_SERVICOS_PRESTADOS: '03.1',
  CUSTO_MERCADORIAS_VENDIDAS: '03',
  DESPESAS_COMERCIAIS: '04.1',
  DESPESAS_ADMINISTRATIVAS: '04.2',
  RECEITAS_RENDIMENTOS_FINANCEIROS: '05.1',
  DESPESAS_FINANCEIRAS: '05.2',
  DESPESSAS_FINANCEIRAS: '05.2', // spelled this way by the API
  OUTRAS_RECEITAS_NAO_OPERACIONAIS: '06.1',
  OUTRAS_DESPESAS_NAO_OPERACIONAIS: '06.2',
  INVESTIMENTOS_IMOBILIZADO: '07.1',
  EMPRESTIMOS_DIVIDAS: '07.2',
}

export function entradaDreLine(entrada: string | null | undefined, lines: DreLinha[]): string | null {
  if (!entrada) return null
  const code = ENTRADA_CODES[entrada.toUpperCase()]
  if (!code) return null
  return lines.find((l) => l.codigo === code)?.id ?? null
}

export type CategoriaInfo = { id: string; nome: string; categoria_pai: string | null; entrada_dre: string | null }
export type CategoriaValue = { categoria_id: string | null; idx: number; valor: number }
export type CategoriaLine = { id: string | null; nome: string; values: number[] }
export type DreOutRow = DreRow & { categorias: CategoriaLine[] }

/**
 * Builds the statement from per-category values. A category lands on:
 * the DRE line that lists it, else the line of its nearest listed ancestor,
 * else the line given by its (or an ancestor's) entrada_dre; otherwise it is
 * reported as "fora do DRE" and kept out of the totals, as Conta Azul does.
 */
export function buildDre(
  lines: DreLinha[],
  pairs: { dre_linha_id: string; categoria_id: string }[],
  cats: CategoriaInfo[],
  values: CategoriaValue[],
  width: number
): { rows: DreOutRow[]; unclassified: { values: number[]; categorias: CategoriaLine[] } } {
  const catToLine = new Map<string, string>()
  for (const p of pairs) if (!catToLine.has(p.categoria_id)) catToLine.set(p.categoria_id, p.dre_linha_id)
  const byId = new Map(cats.map((c) => [c.id, c]))
  const parents = new Map(cats.map((c) => [c.id, c.categoria_pai]))

  const resolve = (catId: string | null): string | null => {
    if (!catId) return null
    const direct = resolveDreLine(catId, parents, catToLine)
    if (direct) return direct
    let cur: string | null = catId
    for (let depth = 0; cur && depth < 20; depth++) {
      const line = entradaDreLine(byId.get(cur)?.entrada_dre, lines)
      if (line) return line
      cur = parents.get(cur) ?? null
    }
    return null
  }

  const zeros = () => Array.from({ length: width }, () => 0)
  const perCat = new Map<string, number[]>()
  for (const v of values) {
    if (v.idx < 0 || v.idx >= width) continue
    const key = v.categoria_id ?? ''
    const arr = perCat.get(key) ?? zeros()
    arr[v.idx] = round2(arr[v.idx] + v.valor)
    perCat.set(key, arr)
  }

  const own = new Map<string, number[]>()
  const lineCats = new Map<string, CategoriaLine[]>()
  const unclassified = { values: zeros(), categorias: [] as CategoriaLine[] }
  perCat.forEach((vals, key) => {
    const catId = key || null
    const nome = catId ? byId.get(catId)?.nome ?? 'Categoria removida' : 'Sem categoria'
    const line = resolve(catId)
    const entry = { id: catId, nome, values: vals }
    if (!line) {
      vals.forEach((x, i) => { unclassified.values[i] = round2(unclassified.values[i] + x) })
      unclassified.categorias.push(entry)
      return
    }
    const acc = own.get(line) ?? zeros()
    vals.forEach((x, i) => { acc[i] = round2(acc[i] + x) })
    own.set(line, acc)
    lineCats.set(line, [...(lineCats.get(line) ?? []), entry])
  })

  const byMagnitude = (a: CategoriaLine, b: CategoriaLine) => sumAbs(b.values) - sumAbs(a.values)
  unclassified.categorias.sort(byMagnitude)
  const rows = computeDre(lines, own, width).map((r) => ({
    ...r,
    values: r.values.map(round2),
    categorias: (lineCats.get(r.id) ?? []).sort(byMagnitude),
  }))
  return { rows, unclassified }
}

function sumAbs(v: number[]) {
  return v.reduce((a, x) => a + Math.abs(x), 0)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
