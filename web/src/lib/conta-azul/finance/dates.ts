/**
 * Conta Azul works in Sao Paulo local dates. Every "today" in the finance area
 * is the Sao Paulo calendar day, so a check at 23:30 BRT (already tomorrow in
 * UTC) does not shift aging buckets or due-today lists.
 */

const SP_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todaySP(now: Date = new Date()): string {
  return SP_DATE.format(now)
}

function utcMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000)
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(utcMs(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** 0 = due today or later, 1 = 1-30 days late, 2 = 31-60, 3 = 61-90, 4 = more than 90. */
export function agingBucket(due: string, today: string): 0 | 1 | 2 | 3 | 4 {
  const late = daysBetween(due, today)
  if (late <= 0) return 0
  if (late <= 30) return 1
  if (late <= 60) return 2
  if (late <= 90) return 3
  return 4
}
