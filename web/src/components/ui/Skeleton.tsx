export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-md ${className}`} />
}

// Linhas de tabela fantasmas enquanto a lista carrega.
export function SkeletonRows({ rows = 6, className = '' }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Carregando" className={`divide-y divide-line ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="ml-auto h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  )
}
