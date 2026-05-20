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
  const desktopCols =
    items.length >= 4 ? 'lg:grid-cols-4' :
    items.length === 3 ? 'lg:grid-cols-3' :
    items.length === 2 ? 'lg:grid-cols-2' :
    'lg:grid-cols-1'

  return (
    <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${desktopCols}`}>
      {items.map((item) => (
        <KPICard key={item.title} {...item} />
      ))}
    </div>
  )
}
