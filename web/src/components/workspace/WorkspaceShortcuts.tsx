import Link from 'next/link'
import WorkspaceIcon from './WorkspaceIcon'
import { WORKSPACE_AREAS, workspaceHref, type WorkspaceArea } from '@/lib/workspace/presentation'

interface Props {
  cnpj?: string
  selection?: string
  areas?: WorkspaceArea[]
  compact?: boolean
  iconOnly?: boolean
  className?: string
}

/** Same entry points in each team, with the source record carried in the URL. */
export default function WorkspaceShortcuts({ cnpj = '', selection = 'cliente:', areas, compact = false, iconOnly = false, className = '' }: Props) {
  return (
    <nav aria-label={cnpj ? 'Workspace deste cliente' : 'Ferramentas do Workspace'} className={`${compact ? `grid ${iconOnly ? 'grid-cols-1' : 'grid-cols-4'}` : 'flex flex-wrap'} gap-1 ${className}`}>
      {WORKSPACE_AREAS.filter(area => areas ? areas.includes(area.id) : area.id !== 'historico').map(area => (
        <Link
          key={area.id}
          href={workspaceHref(area.id, cnpj, selection)}
          title={`${area.label}${cnpj ? ' deste cliente' : ' no Workspace'}`}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded-lg font-medium text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${compact ? 'flex-col gap-1 px-0.5 py-2 text-[11px]' : 'gap-2 px-3 text-xs'}`}
        >
          <WorkspaceIcon name={area.id} className="h-4 w-4 shrink-0" />
          <span className={iconOnly ? 'sr-only' : 'whitespace-nowrap'}>{area.label}</span>
        </Link>
      ))}
    </nav>
  )
}
