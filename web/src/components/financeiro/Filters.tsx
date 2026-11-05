'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { SelectField } from './ui'

/** Period and cost-centre filters live in the URL so a view can be shared as a link. */
export function useUrlParam(name: string, fallback: string): [string, (v: string) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const value = params.get(name) ?? fallback
  const set = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params.toString())
      if (v === fallback) next.delete(name)
      else next.set(name, v)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [fallback, name, params, pathname, router]
  )
  return [value, set]
}

export const PERIOD_OPTIONS = [
  { value: '12', label: 'Últimos 12 meses' },
  { value: 'ytd', label: 'Ano até o último mês fechado' },
  { value: 'q', label: 'Últimos 3 meses' },
]

export function PeriodAndCostCentre() {
  const [period, setPeriod] = useUrlParam('period', '12')
  const [cc, setCc] = useUrlParam('cc', 'all')
  const [centros, setCentros] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    fetch('/api/financeiro/centros', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCentros(Array.isArray(rows) ? rows : []))
      .catch(() => setCentros([]))
  }, [])

  return (
    <>
      <SelectField id="fin-period" label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      <SelectField
        id="fin-cc"
        label="Centro de custo"
        value={cc}
        onChange={setCc}
        options={[{ value: 'all', label: 'Todos' }, ...centros.map((c) => ({ value: c.id, label: c.nome }))]}
      />
    </>
  )
}
