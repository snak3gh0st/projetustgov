'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { isOutcomeStatus, statusStyle } from '@/lib/status-style'

export interface FunnelStage {
  status: string
  label: string
  count: number
  href: string
}

interface FunnelStripProps {
  title: string
  description?: string
  total: number
  totalLabel: string
  stages: FunnelStage[]
}

function pct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

function StageCell({
  stage,
  total,
  max,
  index,
  outcomeStart,
  outcome,
}: {
  stage: FunnelStage
  total: number
  max: number
  index: number
  outcomeStart: boolean
  outcome: boolean
}) {
  const style = statusStyle(stage.status)
  const share = pct(stage.count, total)
  const fill = max > 0 ? stage.count / max : 0
  return (
    <Link
      href={stage.href}
      className={`group relative flex min-w-[7.25rem] flex-1 basis-0 flex-col justify-between gap-2.5 px-3.5 py-3.5 transition-colors duration-fast hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
        outcome ? 'bg-canvas/70 dark:bg-canvas/40' : ''
      } ${index === 0 ? '' : outcomeStart ? 'border-l-2 border-line-strong' : 'border-l border-line'}`}
    >
      <div className="flex min-h-[2.5rem] items-start gap-1.5 text-[13px] leading-tight text-ink-2">
        <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <span className="line-clamp-2 group-hover:text-ink">{stage.label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <AnimatedNumber value={stage.count} className="font-heading text-2xl font-semibold leading-none text-ink" />
        <span className="text-xs text-ink-3 tabular">{share}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line/70">
        <m.div
          className={`h-full origin-left rounded-full ${style.bar}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(fill, stage.count > 0 ? 0.04 : 0) }}
          transition={{ duration: 0.5, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </Link>
  )
}

// Funil horizontal: etapas em andamento em sequência; desfechos (ganho/perda) à parte.
export default function FunnelStrip({ title, description, total, totalLabel, stages }: FunnelStripProps) {
  const progress = stages.filter((s) => !isOutcomeStatus(s.status))
  const outcomes = stages.filter((s) => isOutcomeStatus(s.status))
  const max = Math.max(1, ...stages.map((s) => s.count))
  const ordered = [...progress, ...outcomes]

  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-body text-base font-semibold tracking-normal text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
        </div>
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink tabular">{total.toLocaleString('pt-BR')}</span> {totalLabel}
        </p>
      </div>
      <div className="flex overflow-x-auto">
        {ordered.map((stage, i) => (
          <StageCell
            key={stage.status}
            stage={stage}
            total={total}
            max={max}
            index={i}
            outcome={i >= progress.length}
            outcomeStart={i === progress.length}
          />
        ))}
      </div>
    </section>
  )
}
