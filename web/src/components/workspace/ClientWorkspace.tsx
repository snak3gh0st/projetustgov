'use client'
import Link from 'next/link'
import WorkspaceIcon from './WorkspaceIcon'
import {WORKSPACE_AREAS,workspaceHref} from '@/lib/workspace/presentation'
export default function ClientWorkspace({cnpj}:{cnpj:string;embedded?:boolean}) {
  return <section id="workspace" className="rounded-xl border border-line bg-surface p-5" aria-label="Workspace do cliente"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="!font-body text-base font-semibold text-ink">Workspace do cliente</h2><p className="mt-1 text-sm text-ink-2">Continue o atendimento nas suas ferramentas de trabalho.</p></div><Link href={workspaceHref('email',cnpj)} className="text-sm font-medium text-accent hover:underline">Abrir Workspace →</Link></div><nav aria-label="Ferramentas do cliente" className="mt-4 flex flex-wrap gap-2">{WORKSPACE_AREAS.filter(a=>a.id!=='historico').map(area=><Link key={area.id} href={workspaceHref(area.id,cnpj)} className="flex min-h-11 items-center gap-2 rounded-lg bg-raised/60 px-4 text-sm text-ink-2 hover:bg-accent-soft hover:text-accent-ink"><WorkspaceIcon name={area.id} className="h-4 w-4"/>{area.label}</Link>)}</nav></section>
}
