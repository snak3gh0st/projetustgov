interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  icon?: string
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  delta,
  deltaType = 'neutral',
}: KPICardProps) {
  const deltaColor = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral: 'text-gray-400',
  }[deltaType]

  return (
    <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider">{title}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <span className="text-2xl font-heading font-bold text-white">{value}</span>
      <div className="flex items-center gap-2">
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        {delta && <span className={`text-xs font-medium ${deltaColor}`}>{delta}</span>}
      </div>
    </div>
  )
}
