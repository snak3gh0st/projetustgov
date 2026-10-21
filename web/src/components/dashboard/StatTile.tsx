import Link from 'next/link'
import AnimatedNumber from '@/components/ui/AnimatedNumber'

type Tone = 'default' | 'accent' | 'warn' | 'danger' | 'good'

const TONE_VALUE: Record<Tone, string> = {
  default: 'text-ink',
  accent: 'text-accent-ink',
  warn: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  good: 'text-emerald-700 dark:text-emerald-300',
}

interface StatTileProps {
  label: string
  value: number
  format?: (n: number) => string
  hint?: React.ReactNode
  href?: string
  tone?: Tone
}

// Indicador da faixa superior: rótulo curto, número grande alinhado, contexto embaixo.
export default function StatTile({ label, value, format, hint, href, tone = 'default' }: StatTileProps) {
  const body = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className={`mt-1.5 font-heading text-[1.75rem] font-semibold leading-none tracking-tight ${TONE_VALUE[tone]}`}>
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint && <p className="mt-2 truncate text-xs text-ink-3">{hint}</p>}
    </>
  )
  const base = 'group block rounded-xl border border-line bg-surface px-5 py-4'
  if (!href) return <div className={base}>{body}</div>
  return (
    <Link
      href={href}
      className={`${base} transition-[border-color,transform] duration-fast ease-out-quart hover:-translate-y-px hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}
    >
      {body}
    </Link>
  )
}
