export type Origin = 'projete' | 'hotmart' | 'conta_azul'
export type EntryStatus = 'open' | 'partial' | 'paid' | 'canceled' | 'refunded' | 'review'
export type Payment = { date: string; amountCents: number }
export type ReportEntry = {
  origin: Origin; kind: 'receivable' | 'payable'; amountCents: number; settledCents: number
  dueDate: string; paidDate?: string | null; status: EntryStatus; payments?: Payment[]
}

export class FinanceError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

export function toCents(input: unknown): number {
  const value = String(input ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new FinanceError('Valor monetário inválido; use até duas casas decimais.')
  const [whole, fractional = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000_000) throw new FinanceError('Valor monetário fora do limite.')
  return cents
}

export function isoDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceError('Data inválida.')
  const d = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new FinanceError('Data inválida.')
  return value
}

export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function buildSchedule(totalCents: number, count: number, firstDate: string) {
  isoDate(firstDate)
  if (!Number.isSafeInteger(totalCents) || !Number.isInteger(count) || count < 1 || count > 120 || totalCents < count) {
    throw new FinanceError('Parcelamento inválido: informe de 1 a 120 parcelas com valor positivo.')
  }
  const [y, m, day] = firstDate.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const lastDay = new Date(Date.UTC(y, m + i, 0)).getUTCDate()
    const date = new Date(Date.UTC(y, m - 1 + i, Math.min(day, lastDay)))
    return { dueDate: date.toISOString().slice(0, 10), amountCents: Math.floor(totalCents / count) + (i < totalCents % count ? 1 : 0) }
  })
}

export function closingDueDate(period: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new FinanceError('Competência inválida; use AAAA-MM.')
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 15)).toISOString().slice(0, 10)
}

type Obj = Record<string, any>
export type HotmartPurchase = {
  externalKey: string; eventId: string; eventDate: string; eventType: string
  customerName: string; customerEmail: string; customerDocument: string; description: string
  amountCents: number; paymentStatus: EntryStatus; billingMode: 'review' | 'subscription'
  approvedDate: string | null; affiliateCode: string | null; affiliateName: string | null
  affiliateCents: number | null; snapshot: Obj
}

export function normalizeHotmart(payload: Obj): HotmartPurchase {
  const data = payload.data ?? payload
  const p = data.purchase ?? {}
  const buyer = data.buyer ?? {}
  const currency = p.price?.currency_value ?? p.price?.currency_code
  if (currency !== 'BRL') throw new FinanceError('Moeda Hotmart sem suporte: somente BRL nesta etapa.')
  if (typeof p.transaction !== 'string' || !p.transaction.trim() || !buyer.name) throw new FinanceError('Compra Hotmart sem transação ou comprador.')
  const status = String(p.status ?? payload.event?.replace('PURCHASE_', '') ?? '')
  const paymentStatus: EntryStatus = ['REFUNDED', 'CHARGEBACK'].includes(status) ? 'refunded'
    : ['CANCELLED', 'CANCELED', 'EXPIRED'].includes(status) ? 'canceled'
    : ['APPROVED', 'COMPLETE'].includes(status) ? 'paid'
    : status === 'PARTIALLY_REFUNDED' ? 'review' : 'open'
  const stamp = Number(payload.creation_date ?? p.approved_date ?? p.order_date)
  if (!Number.isFinite(stamp) || stamp <= 0) throw new FinanceError('Compra Hotmart sem data válida.')
  const approvedDate = p.approved_date ? businessDate(new Date(Number(p.approved_date))) : null
  const commission = (data.commissions ?? []).find((c: Obj) => c.source === 'AFFILIATE' && c.currency_value === 'BRL')
  return {
    externalKey: p.transaction.trim(), eventId: String(payload.id ?? `${p.transaction}:${status}:${stamp}`),
    eventDate: new Date(stamp).toISOString(), eventType: String(payload.event ?? status),
    customerName: String(buyer.name), customerEmail: String(buyer.email ?? ''),
    customerDocument: String(buyer.document ?? '').replace(/\D/g, ''),
    description: String(data.product?.name ?? 'Venda Hotmart'), amountCents: toCents(p.price?.value), paymentStatus,
    billingMode: data.subscription || p.is_subscription ? 'subscription' : 'review', approvedDate,
    affiliateCode: data.affiliates?.[0]?.affiliate_code ?? commission?.user?.ucode ?? p.tracking?.source ?? p.origin?.src ?? null,
    affiliateName: data.affiliates?.[0]?.name ?? commission?.user?.name ?? null,
    affiliateCents: commission ? toCents(commission.value) : null,
    // Retain only operational fields; no raw tokens, payment URLs, card data or full webhook body.
    snapshot: { transaction: p.transaction, status, productId: data.product?.id, installmentsNumber: p.payment?.installments_number,
      subscriptionCode: data.subscription?.subscriber?.code, recurrence: p.recurrence_number ?? p.recurrency_number,
      amount: p.price?.value, approvedDate, nextCharge: p.date_next_charge ?? null,affiliateCode:data.affiliates?.[0]?.affiliate_code??commission?.user?.ucode??p.tracking?.source??p.origin?.src??null },
  }
}

export function summarizeReport(entries: ReportEntry[], today: string) {
  isoDate(today)
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 7)
  const until = next.toISOString().slice(0, 10)
  const result = { receivableTodayCents: 0, payableTodayCents: 0, overdueReceivableCents: 0, overduePayableCents: 0,
    receivedTodayCents: 0, paidTodayCents: 0, upcomingReceivableCents: 0, upcomingPayableCents: 0,
    unsyncedReceivableCents: 0, unsyncedPayableCents: 0 }
  for (const e of entries) {
    if (['canceled', 'refunded', 'review'].includes(e.status)) continue
    const remaining = Math.max(0, e.amountCents - e.settledCents)
    const income = e.kind === 'receivable'
    if (e.origin !== 'conta_azul') {
      result[income ? 'unsyncedReceivableCents' : 'unsyncedPayableCents'] += remaining
      continue
    }
    if (e.dueDate === today) result[income ? 'receivableTodayCents' : 'payableTodayCents'] += remaining
    if (e.dueDate < today) result[income ? 'overdueReceivableCents' : 'overduePayableCents'] += remaining
    if (e.dueDate > today && e.dueDate <= until) result[income ? 'upcomingReceivableCents' : 'upcomingPayableCents'] += remaining
    for (const p of e.payments ?? []) if (p.date === today) result[income ? 'receivedTodayCents' : 'paidTodayCents'] += p.amountCents
  }
  return result
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
