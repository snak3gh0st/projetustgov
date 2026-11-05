interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}

// Cabeçalho padrão de página: título, linha de contexto e ações à direita.
export default function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{description}</p>}
      </div>
      {(actions || children) && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions ?? children}</div>}
    </header>
  )
}
