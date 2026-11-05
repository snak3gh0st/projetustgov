export const MINUS = '−'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const int0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dec2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function sign(v: number) {
  return v < -0.004 ? `${MINUS} ` : ''
}

/** R$ 1.234,56 with a real minus sign for negatives. */
export function money(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return sign(v) + brl.format(Math.abs(v))
}

/** R$ 1,24 mi / R$ 432 mil / R$ 890 */
export function moneyCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const a = Math.abs(v)
  const body = a >= 1e6 ? `R$ ${dec2.format(a / 1e6)} mi` : a >= 1e3 ? `R$ ${int0.format(a / 1e3)} mil` : `R$ ${int0.format(a)}`
  return (v < -0.5 ? `${MINUS} ` : '') + body
}

/** Axis label without currency: 1,2 mi / 400 mil */
export function axis(v: number): string {
  const a = Math.abs(v)
  const body = a >= 1e6 ? `${dec1.format(a / 1e6)} mi` : a >= 1e3 ? `${int0.format(a / 1e3)} mil` : int0.format(a)
  return (v < 0 ? MINUS : '') + body
}

export function signedMoneyCompact(v: number): string {
  return (v >= 0 ? '+ ' : '') + moneyCompact(v)
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${dec1.format(v * 100)}%`
}

export function signedPct(v: number): string {
  return `${v >= 0 ? '+' : MINUS}${dec1.format(Math.abs(v) * 100)}%`
}

export function count(v: number): string {
  return int0.format(v)
}

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** 08/10 */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '—'
  const { m, d } = parts(iso)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** 08/10/2026 */
export function fullDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const { y } = parts(iso)
  return `${dayMonth(iso)}/${y}`
}

export function weekday(iso: string): string {
  const { y, m, d } = parts(iso)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** "2026-09" -> "set/26" */
export function monthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`
}

/** "2026-09" -> "setembro de 2026" */
export function monthLong(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_FULL[m - 1]} de ${y}`
}

/** "2026-09" -> "setembro" */
export function monthName(month: string): string {
  return MONTHS_FULL[Number(month.split('-')[1]) - 1]
}

export function relativeStamp(ts: string | null | undefined, now = new Date()): string {
  if (!ts) return 'nunca'
  const d = new Date(ts)
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString()
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `hoje às ${hm}`
  if (yesterday) return `ontem às ${hm}`
  return `${d.toLocaleDateString('pt-BR')} às ${hm}`
}
