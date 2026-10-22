'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { m } from 'motion/react'
import { logout } from '@/lib/auth-actions'
import ThemeToggle from '@/components/ThemeToggle'
import { AREAS, activeNavHref, getAreaNav, getAreasForRole, resolveArea, sidebarWidthClass, type AreaId } from '@/lib/areas'
import type { Role } from '@/lib/roles'
import AreaRail, { rememberArea } from '@/components/AreaRail'
import { NavIcon } from '@/components/NavIcon'
import BrandLockup from '@/components/BrandLockup'
import NotificationBell from '@/components/NotificationBell'

interface SidebarProps {
  user: {
    name?: string | null
    role: Role
    email?: string | null
  }
  defaultOpen?: boolean
  showBell?: boolean
  /** Área escolhida por último (cookie), lida no servidor. */
  preferredArea?: string | null
  /** Canal de WhatsApp ligado (mostra Conversas). */
  whatsapp?: boolean
}

const ROLE_LABEL: Record<Role, string> = {
  gestor: 'Gestor comercial',
  diretoria: 'Diretoria',
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

export default function Sidebar({ user, defaultOpen = true, showBell = false, preferredArea = null, whatsapp = false }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState<boolean>(defaultOpen)
  const [chosenArea, setChosenArea] = useState<string | null>(preferredArea)

  function writeSidebarCookie(next: boolean) {
    document.cookie = `sidebar:state=${next}; path=/; max-age=31536000; SameSite=Lax`
  }

  function toggleSidebar() {
    const next = !open
    setOpen(next)
    writeSidebarCookie(next)
  }

  const hasRail = getAreasForRole(user.role).length > 1
  const area: AreaId = resolveArea(user.role, pathname, searchParams, chosenArea)
  // A área exibida vira a preferência: telas que estão em duas áreas não fazem o menu pular.
  useEffect(() => {
    if (area === chosenArea) return
    setChosenArea(area)
    // No celular o menu lateral fica oculto; quem escolhe a área lá é o drawer.
    if (window.matchMedia('(min-width: 768px)').matches) rememberArea(area)
  }, [area, chosenArea])

  const items = getAreaNav(user.role, area, { whatsapp })
  const activeHref = activeNavHref(items.map((i) => i.href), pathname, searchParams)
  const groups = [
    { key: 'main', title: null as string | null, items: items.filter((i) => !i.section) },
    { key: 'gestao', title: 'Gestão', items: items.filter((i) => i.section === 'Gestão') },
  ].filter((g) => g.items.length > 0)
  const displayName = user.name || user.email || 'Usuário'

  return (
    <aside
      data-sidebar-open={open}
      className={`fixed left-0 top-0 h-screen ${sidebarWidthClass(user.role, open).aside} bg-surface border-r border-line hidden md:flex z-nav transition-[width] duration-base ease-out-quart`}
    >
      {hasRail && <AreaRail role={user.role} current={area} onChange={setChosenArea} />}
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-14 items-center justify-between px-3 py-2 border-b border-line">
        {hasRail ? (
          <p className={open ? 'min-w-0 truncate px-1 font-heading text-[15px] font-semibold text-ink' : 'hidden'}>{AREAS[area].label}</p>
        ) : (
          <>
            <div className={open ? 'min-w-0' : 'hidden'}>
              <BrandLockup />
            </div>
            {!open && <BrandLockup compact />}
          </>
        )}
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

      <nav className="flex-1 overflow-y-auto py-3" aria-label={`Menu: ${AREAS[area].label}`}>
        {groups.map((group) => (
          <div key={group.key} className="mb-4 last:mb-0">
            {group.title && (open ? (
              <p className="px-5 pb-1.5 text-xs font-medium text-ink-3">{group.title}</p>
            ) : (
              <div aria-hidden className="mx-4 mb-2 h-px bg-line" />
            ))}
            {group.items.map(({ href, label, icon }) => {
              const isActive = href === activeHref
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
      </div>
    </aside>
  )
}
