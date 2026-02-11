import KPICard from './KPICard'

interface KPIItem {
  title: string
  value: string
  subtitle?: string
  icon?: string
  delta?: string
  deltaType?: 'positive' | 'negative' | 'neutral'
}

export default function KPIRow({ items }: { items: KPIItem[] }) {
  return (
    <div className={`grid gap-4 grid-cols-2 lg:grid-cols-${Math.min(items.length, 4)}`}>
      {items.map((item) => (
        <KPICard key={item.title} {...item} />
      ))}
    </div>
  )
}
