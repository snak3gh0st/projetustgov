'use client'

// Peças das listas de leads (Aprovação, Execução, Prestação): campos, cabeçalho ordenável,
// filtros por tag, pílula de status editável e último contato.
import { statusStyle } from '@/lib/status-style'

export const inputClass =
  'h-10 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition-colors duration-fast hover:border-line-strong focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30'

export const selectClass =
  'h-10 rounded-lg border border-line bg-surface pl-3 pr-8 text-sm text-ink-2 transition-colors duration-fast hover:border-line-strong focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30'

export const thClass = 'px-3 py-2.5 text-left text-xs font-medium text-ink-3 whitespace-nowrap'

export function SortHeader({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
  className = '',
}: {
  col: string
  label: string
  sortCol: string
  sortDir: 'asc' | 'desc'
  onSort: (col: string) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <th aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${thClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors duration-fast hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${active ? 'text-ink' : ''}`}
      >
        {label}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-fast ${active ? 'opacity-100' : 'opacity-30'} ${active && sortDir === 'desc' ? 'rotate-180' : ''}`}>
          <path d="M6 3l3.5 5h-7z" fill="currentColor" />
        </svg>
      </button>
    </th>
  )
}

export function FilterChip({
  label,
  active,
  activeClass,
  onClick,
}: {
  label: string
  active: boolean
  activeClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        active ? activeClass : 'bg-surface text-ink-2 ring-line hover:bg-raised hover:text-ink'
      }`}
    >
      {label}
      {active && (
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 opacity-70">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      )}
    </button>
  )
}

/** Cores das tags (ativas), alinhadas às pílulas de status. */
export const TAG_TONE = {
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
  rose: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/25',
  indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25',
  neutral: 'bg-raised text-ink-2 ring-line',
} as const

export function Tag({ tone, children, title }: { tone: keyof typeof TAG_TONE; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TAG_TONE[tone]}`}>
      {children}
    </span>
  )
}

/** Status comercial editável com a cor da etapa. Sem permissão, vira só a pílula. */
export function StatusSelect({
  status,
  label,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  status: string | null | undefined
  label: string
  options: readonly string[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const style = statusStyle(status)
  return (
    <span className={`relative inline-flex items-center rounded-full ring-1 ring-inset ${style.pill} ${disabled ? 'opacity-80' : ''}`}>
      <span aria-hidden className={`pointer-events-none absolute left-2.5 h-1.5 w-1.5 rounded-full ${style.dot}`} />
      <select
        aria-label={ariaLabel}
        value={label}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-full bg-transparent py-1 pl-6 pr-6 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {!options.includes(label) && <option value={label}>{label}</option>}
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {!disabled && (
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 opacity-60">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  )
}

export function LastContactBadge({ days }: { days: number | null | undefined }) {
  if (days == null) return <Tag tone="neutral">Nunca</Tag>
  const tone = days <= 2 ? 'emerald' : days <= 7 ? 'amber' : 'rose'
  return <Tag tone={tone} title={`Último contato há ${days} dia${days === 1 ? '' : 's'}`}>{days}d</Tag>
}

const PHONE_DOT: Record<string, { cls: string; label: string }> = {
  valido: { cls: 'bg-emerald-500', label: 'Telefone válido' },
  invalido: { cls: 'bg-red-500', label: 'Telefone inválido' },
  nao_atende: { cls: 'bg-amber-500', label: 'Não atende' },
}

export function PhoneStatusDot({ status }: { status: string | null | undefined }) {
  const dot = status ? PHONE_DOT[status] : undefined
  if (!dot) return null
  return (
    <span title={dot.label} className={`mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot.cls}`}>
      <span className="sr-only">{dot.label}</span>
    </span>
  )
}

export function OpenCardLink({ cnpj }: { cnpj: string }) {
  return (
    <a
      href={`/lead/${encodeURIComponent(cnpj)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 rounded p-0.5 text-ink-3 opacity-60 transition-[opacity,color] duration-fast hover:text-accent hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50"
      title="Abrir card do lead em nova aba"
      aria-label="Abrir card do lead em nova aba"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </a>
  )
}
