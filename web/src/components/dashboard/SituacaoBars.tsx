'use client'

import Link from 'next/link'
import { m } from 'motion/react'

interface SituacaoBarsProps {
  title: string
  description?: string
  items: { label: string; count: number }[]
  href: string
}

// Distribuição por situação no TransfereGov: barras horizontais ordenadas.
export default function SituacaoBars({ title, description, items, href }: SituacaoBarsProps) {
  const total = items.reduce((s, i) => s + i.count, 0)
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="font-body text-base font-semibold tracking-normal text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      <ul className="divide-y divide-line">
        {items.map((item, i) => (
          <li key={item.label}>
            <Link
              href={href}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-2.5 transition-colors duration-fast hover:bg-raised sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
            >
              <span className="truncate text-sm text-ink">{item.label}</span>
              <span className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-line/70 sm:col-span-1 sm:row-start-auto">
                <m.span
                  className="block h-full origin-left rounded-full bg-accent/80"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: item.count / max }}
                  transition={{ duration: 0.5, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className="text-sm text-ink-2 tabular">
                <span className="font-medium text-ink">{item.count.toLocaleString('pt-BR')}</span>
                <span className="ml-2 text-xs text-ink-3">{total > 0 ? Math.round((item.count / total) * 100) : 0}%</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
