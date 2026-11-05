import type { Tipo } from '../finance/types'

export type ApiSideTotals = Record<Tipo, { itens: number | null; pago: number | null; aberto: number | null }>
export type MirrorSide = { tipo: Tipo; itens: number; pago: number; aberto: number }

export type ReconcileCheck = {
  tipo: Tipo
  campo: 'itens' | 'pago' | 'aberto'
  api: number
  espelho: number
  diferenca: number
  ok: boolean
}

const TOLERANCE_BRL = 1

/** Compares the mirror against the totals Conta Azul itself reports for the same search. */
export function reconcile(api: ApiSideTotals, mirror: MirrorSide[]): { ok: boolean; checks: ReconcileCheck[] } {
  const checks: ReconcileCheck[] = []
  for (const tipo of ['RECEITA', 'DESPESA'] as const) {
    const m = mirror.find((x) => x.tipo === tipo) ?? { tipo, itens: 0, pago: 0, aberto: 0 }
    for (const campo of ['itens', 'pago', 'aberto'] as const) {
      const apiValue = api[tipo][campo]
      if (apiValue === null) continue
      const diferenca = Math.round((m[campo] - apiValue) * 100) / 100
      const ok = campo === 'itens' ? diferenca === 0 : Math.abs(diferenca) <= TOLERANCE_BRL
      checks.push({ tipo, campo, api: apiValue, espelho: m[campo], diferenca, ok })
    }
  }
  return { ok: checks.every((c) => c.ok), checks }
}
