interface PriorityBadgeProps {
  level: 1 | 2 | 3 | 4 | 5 | null
  /** Optional override — when set, ignores the level→label map. */
  label?: string
  size?: 'sm' | 'md'
}

const LEVEL_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Saldo em Conta',
  2: 'A Desembolsar',
  3: 'Rendimento',
  4: 'Aprovação',
  5: 'Prestação de Contas',
}

const LEVEL_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'bg-emerald-100 text-emerald-800 ring-emerald-200',   // money in account — best
  2: 'bg-amber-100 text-amber-800 ring-amber-200',         // pending disbursement
  3: 'bg-sky-100 text-sky-800 ring-sky-200',                // yield / rendimento
  4: 'bg-violet-100 text-violet-800 ring-violet-200',      // approval phase
  5: 'bg-slate-100 text-slate-700 ring-slate-200',         // accounts settlement — last
}

export default function PriorityBadge({ level, label, size = 'sm' }: PriorityBadgeProps) {
  if (level == null) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200">
        —
      </span>
    )
  }
  const text = label ?? LEVEL_LABELS[level]
  const colour = LEVEL_COLORS[level]
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${sizeClass} ${colour}`}>
      <span className="font-bold tabular-nums">{level}</span>
      <span>{text}</span>
    </span>
  )
}
