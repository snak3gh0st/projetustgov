'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StatusTone } from '@/lib/financeiro/assemble'

export const REFRESH_EVENT = 'financeiro:refresh'

/**
 * Fetches a BI endpoint, keeps the previous data while refetching (no layout
 * jump), and refetches when a Conta Azul sync finishes.
 */
export function useFinanceData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!url) return
    const id = ++seq.current
    setLoading(true)
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`)
      if (id === seq.current) {
        setData(body as T)
        setError(null)
      }
    } catch (err) {
      if (id === seq.current) setError(err instanceof Error ? err.message : 'Erro ao carregar')
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh)
  }, [load])

  return { data, error, loading, reload: load }
}

export function Panel({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none ${className}`}>
      {children}
    </section>
  )
}

export function PanelHead({ title, aside, sub }: { title: string; aside?: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-gray-100">{title}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-gray-400">{sub}</p>}
      </div>
      {aside && <div className="text-[12.5px] text-slate-500 dark:text-gray-400">{aside}</div>}
    </div>
  )
}

const TONES: Record<StatusTone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
  accent: 'border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export function Pill({ tone = 'neutral', children }: { tone?: StatusTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-[3px] dark:bg-gray-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-md px-3 text-[13px] font-medium transition-colors duration-150 ${
            value === o.value
              ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-gray-700 dark:text-gray-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-150 ${
        active
          ? 'border-slate-900 bg-slate-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2">
      <span className="text-[12.5px] font-medium text-slate-500 dark:text-gray-400">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 dark:bg-gray-800 ${className}`} />
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700 dark:text-gray-300">
          Não foi possível carregar estes dados ({message}).
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-800 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Tentar de novo
        </button>
      </div>
    </Panel>
  )
}

export function Callout({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-wrap items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px] ${
        tone === 'warn'
          ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
          : 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300'
      }`}
    >
      {children}
    </div>
  )
}

export function Swatch({ color, round = false }: { color: string; round?: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 flex-none ${round ? 'rounded-full' : 'rounded-[3px]'}`} style={{ background: color }} />
}

export const AGING_LABELS = ['A vencer', '1 a 30 dias', '31 a 60', '61 a 90', 'Mais de 90']
export const AGING_COLORS = ['var(--fin-in)', 'var(--fin-od1)', 'var(--fin-od2)', 'var(--fin-od3)', 'var(--fin-od4)']
