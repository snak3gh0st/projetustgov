'use client'

import { useId } from 'react'
import { m } from 'motion/react'

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

// Abas segmentadas com indicador que desliza até a aba ativa.
export default function SectionTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SectionTabsProps) {
  const indicatorId = useId()

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = tabs.findIndex((t) => t.id === value)
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.id)
    event.preventDefault()
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons[tabs.indexOf(next)]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-raised p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium sm:px-3.5 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              active ? 'text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {active && (
              <m.span
                layoutId={`tab-indicator-${indicatorId}`}
                aria-hidden
                className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-line"
                transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <span className="relative">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`relative rounded-md px-1.5 py-0.5 text-xs tabular transition-colors duration-fast ${
                  active ? 'bg-accent-soft text-accent-ink' : 'bg-line/70 text-ink-2'
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
