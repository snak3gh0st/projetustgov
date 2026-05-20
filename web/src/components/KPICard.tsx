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
    positive: 'text-emerald-600 dark:text-emerald-300',
    negative: 'text-red-500',
    neutral: 'text-gray-400 dark:text-gray-500',
  }[deltaType]

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <span className="text-2xl font-heading font-bold text-gray-900 dark:text-gray-100">{value}</span>
      <div className="flex items-center gap-2">
        {subtitle && <span className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>}
        {delta && <span className={`text-xs font-medium ${deltaColor}`}>{delta}</span>}
      </div>
    </div>
  )
}
