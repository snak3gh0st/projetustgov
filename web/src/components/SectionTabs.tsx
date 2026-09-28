'use client'

export interface SectionTabItem {
  id: string
  label: string
  count?: number
}

interface SectionTabsProps {
  tabs: SectionTabItem[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}

export default function SectionTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SectionTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-zinc-700 dark:bg-zinc-800/80 ${className}`}
    >
      {tabs.map(tab => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-zinc-900 ${
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-zinc-700 dark:text-zinc-50 dark:ring-zinc-600'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'bg-slate-200/80 text-slate-500 dark:bg-zinc-600 dark:text-zinc-300'
                }`}
              >
                {tab.count.toLocaleString('pt-BR')}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
