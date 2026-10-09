interface BrandLockupProps {
  compact?: boolean
}

/** Projete logo; the collapsed sidebar shows only the symbol. */
export default function BrandLockup({ compact = false }: BrandLockupProps) {
  if (compact) {
    return (
      <div className="h-8 w-[31px] shrink-0 overflow-hidden" aria-label="Projete">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-8 w-auto max-w-none" />
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1" aria-label="Projete">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Projete" className="h-8 w-auto" />
      <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Hub da PROJETUS</span>
    </div>
  )
}
