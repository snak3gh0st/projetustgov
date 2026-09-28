interface BrandLockupProps {
  compact?: boolean
}

export default function BrandLockup({ compact = false }: BrandLockupProps) {
  return (
    <div className="flex items-center gap-2.5" aria-label="Central da Mobilização">
      <svg className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-400" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="5" fill="currentColor" />
        <circle cx="7" cy="8" r="3" fill="currentColor" opacity=".58" />
        <circle cx="25" cy="8" r="3" fill="currentColor" opacity=".78" />
        <circle cx="25" cy="24" r="3" fill="currentColor" opacity=".58" />
        <circle cx="7" cy="24" r="3" fill="currentColor" opacity=".78" />
        <path d="M9.5 9.5 12.5 13M22.5 9.5 19.5 13M22.5 22.5 19.5 19M9.5 22.5 12.5 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65" />
      </svg>
      <span className={compact ? 'sr-only' : 'leading-none'}>
        <span className="block text-sm font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Central</span>
        <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-zinc-400">da Mobilização</span>
      </span>
    </div>
  )
}
