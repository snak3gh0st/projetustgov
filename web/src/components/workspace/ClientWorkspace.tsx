'use client'
import Link from 'next/link'
import WorkspaceShortcuts from './WorkspaceShortcuts'
import {workspaceHref} from '@/lib/workspace/presentation'
export default function ClientWorkspace({cnpj}:{cnpj:string;embedded?:boolean}) {
  return <section id="workspace" className="rounded-xl border border-line bg-surface p-5" aria-label="Workspace do cliente"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="!font-body text-base font-semibold text-ink">Workspace do cliente</h2><p className="mt-1 text-sm text-ink-2">Continue o atendimento nas suas ferramentas de trabalho.</p></div><Link href={workspaceHref('email',cnpj)} className="text-sm font-medium text-accent hover:underline">Abrir Workspace →</Link></div><WorkspaceShortcuts cnpj={cnpj} className="mt-3"/></section>
}
