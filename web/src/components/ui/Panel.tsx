interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'section' | 'div' | 'article'
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  padded?: boolean
}

// Superfície padrão: borda fina, sem sombra larga. Não aninhe painéis.
export default function Panel({
  as: Tag = 'section',
  title,
  description,
  actions,
  padded = true,
  className = '',
  children,
  ...rest
}: PanelProps) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface ${className}`} {...rest}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-body text-base font-semibold tracking-normal text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </Tag>
  )
}
