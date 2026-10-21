'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { m } from 'motion/react'
import { logout } from '@/lib/auth-actions'
import ThemeToggle from '@/components/ThemeToggle'
import { getNavItemsForRole, groupNavItems, navSectionOrderForRole } from '@/lib/sidebar-nav-items'
import BrandLockup from '@/components/BrandLockup'
import NotificationBell from '@/components/NotificationBell'

interface SidebarProps {
  user: {
    name?: string | null
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao' | 'gestor_financeiro'
    email?: string | null
  }
  defaultOpen?: boolean
  showBell?: boolean
}

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const cls = className || 'w-4 h-4'
  switch (name) {
    case 'pipeline':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
    case 'leads':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
    case 'comissoes':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'upload':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
    case 'distribuir':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
    case 'monitoramento':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
    case 'monitorar':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    case 'bi':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg>
    case 'vendedores':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
    case 'execucao':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
    case 'tgov':
      // ClipboardDocumentCheck — distinct from ChartBarIcon used by pipeline
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" /></svg>
    case 'csm':
      // UserGroup icon - distinct representation for CSM sidebar
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a3 3 0 100-6 3 3 0 000 6zM8 18.72a3 3 0 100-6 3 3 0 000 6zM20.486 15.914A4.989 4.989 0 0122 15c0-2.761-2.239-5-5-5s-5 2.239-5 5c0 1.037.324 2.002.883 2.823M15 10.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    case 'produtos':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75A2.25 2.25 0 016.75 4.5h3.75v5.25H4.5v-3zm9-2.25h3.75a2.25 2.25 0 012.25 2.25v3h-6v-5.25zm-9 8.25h6v6.75H6.75a2.25 2.25 0 01-2.25-2.25v-4.5zm9 0h6v4.5a2.25 2.25 0 01-2.25 2.25H13.5v-6.75z" /></svg>
    case 'financeiro':
      // Banknotes: the finance area
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
    case 'conta-azul':
      // Link: the ERP connection
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
    default:
      return <span className="w-4 h-4 rounded-full bg-gray-300" />
  }
}

const ROLE_LABEL: Record<SidebarProps['user']['role'], string> = {
  gestor: 'Gestor',
  admin: 'Admin',
  vendedor: 'Vendedor',
  visualizador: 'Visualizador',
  coordenador: 'Coordenador',
  adm_produto: 'Adm. produto',
  csm: 'CSM',
  coord_aprovacao: 'Coord. aprovação',
  assistente_aprovacao: 'Assist. aprovação',
  projetista: 'Projetista',
  coord_execucao: 'Coord. execução',
  assistente_execucao: 'Assist. execução',
  coord_prestacao: 'Coord. prestação',
  assistente_prestacao: 'Assist. prestação',
  gestor_financeiro: 'Gestor financeiro',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export default function Sidebar({ user, defaultOpen = true, showBell = false }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view')

  const [open, setOpen] = useState<boolean>(defaultOpen)

  function writeSidebarCookie(next: boolean) {
    document.cookie = `sidebar:state=${next}; path=/; max-age=31536000; SameSite=Lax`
  }

  function toggleSidebar() {
    const next = !open
    setOpen(next)
    writeSidebarCookie(next)
  }

  const navItems = getNavItemsForRole(user.role)
  const displayName = user.name || user.email || 'Usuário'

  return (
    <aside
      data-sidebar-open={open}
      className={`fixed left-0 top-0 h-screen ${open ? 'w-64' : 'w-16'} bg-surface border-r border-line hidden md:flex flex-col z-nav transition-[width] duration-base ease-out-quart`}
    >
      <div className="flex min-h-14 items-center justify-between px-3 py-2 border-b border-line">
        <div className={open ? 'min-w-0' : 'hidden'}>
          <BrandLockup />
        </div>
        {!open && <BrandLockup compact />}
        {open && showBell && (
          <div className="ml-auto">
            <NotificationBell align="left" />
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={open ? 'Recolher menu' : 'Expandir menu'}
          className={`${open ? (showBell ? '' : 'ml-auto') : 'hidden'} h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-raised hover:text-ink transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
      </div>
      {!open && showBell && (
        <div className="mx-auto mt-2">
          <NotificationBell align="left" />
        </div>
      )}
      {!open && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expandir menu"
          className="mx-auto mt-2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-raised hover:text-ink transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Navegação principal">
        {groupNavItems(navItems, navSectionOrderForRole(user.role)).map(({ section, items }) => (
          <div key={section} className="mb-4 last:mb-0">
            {open ? (
              <p className="px-5 pb-1.5 text-xs font-medium text-ink-3">{section}</p>
            ) : (
              <div aria-hidden className="mx-4 mb-2 h-px bg-line first:hidden" />
            )}
            {items.map(({ href, label, icon }) => {
              // Ativo: em /tgov compara ?view=, em /execucao compara ?fase=
              const [hrefPath, hrefQuery] = href.split('?')
              const hrefView = hrefQuery ? new URLSearchParams(hrefQuery).get('view') : null
              let isActive: boolean
              if (href === '/') {
                isActive = pathname === '/'
              } else if (hrefPath === '/tgov') {
                isActive = pathname === '/tgov' && (currentView ?? null) === (hrefView ?? null)
              } else if (hrefPath === '/execucao') {
                // Execução e Prestação de Contas são a mesma página, por fase
                isActive = pathname === '/execucao' && (searchParams.get('fase') ?? 'execucao') === new URLSearchParams(hrefQuery).get('fase')
              } else {
                isActive = pathname.startsWith(hrefPath)
              }

              return (
                <Link
                  key={href}
                  href={href}
                  title={open ? undefined : label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative mx-2 flex min-h-10 items-center gap-3 rounded-lg ${open ? 'px-3' : 'justify-center px-2'} text-sm transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    isActive ? 'font-medium text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
                  }`}
                >
                  {isActive && (
                    <m.span
                      layoutId="sidebar-active"
                      aria-hidden
                      className="absolute inset-0 rounded-lg bg-accent-soft"
                      transition={{ type: 'tween', duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <NavIcon name={icon} className="relative h-4 w-4 shrink-0" />
                  <span className={open ? 'relative truncate' : 'sr-only'}>{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Usuário, tema e sair */}
      <div className="border-t border-line p-3 space-y-2">
        <ThemeToggle compact={!open} />
        <div className={`flex items-center gap-2.5 ${open ? 'px-1' : 'flex-col'}`}>
          <span
            aria-hidden
            title={open ? undefined : displayName}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold text-ink-2"
          >
            {initials(displayName)}
          </span>
          {open && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{displayName}</p>
              <p className="truncate text-xs text-ink-3">{ROLE_LABEL[user.role] ?? 'Vendedor'}</p>
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sair da conta"
              title="Sair"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-6l3 3m0 0l-3 3m3-3H9" /></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Rodapé */}
      <div className={`px-5 py-2.5 border-t border-line ${open ? '' : 'hidden'}`}>
        <a
          href="https://bterminal.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-[11px] text-ink-3 hover:text-ink-2 transition-colors duration-fast"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bt-mark.svg" alt="" className="h-3.5 w-3.5" />
          <span>Powered by BTerminal Systems</span>
        </a>
      </div>
    </aside>
  )
}
