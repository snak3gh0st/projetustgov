import { statusStyle } from '@/lib/status-style'

interface StatusPillProps {
  status: string | null | undefined
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export default function StatusPill({ status, label, size = 'sm', className = '' }: StatusPillProps) {
  const style = statusStyle(status)
  const text = label ?? (status === 'Fechado' ? 'Vendas Concluídas' : status || 'Não Contatado')
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full ring-1 ring-inset font-medium transition-colors duration-base ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${style.pill} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {text}
    </span>
  )
}
