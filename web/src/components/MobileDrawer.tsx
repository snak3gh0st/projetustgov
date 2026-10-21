'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Drawer } from 'vaul'
import { logout } from '@/lib/auth-actions'
import { AREAS, activeNavHref, getAreaNav, getAreasForRole, resolveArea, type AreaId } from '@/lib/areas'
import type { Role } from '@/lib/roles'
import ThemeToggle from '@/components/ThemeToggle'
import { NavIcon } from '@/components/NavIcon'
import BrandLockup from '@/components/BrandLockup'
import SectionTabs from '@/components/SectionTabs'
import { rememberArea } from '@/components/AreaRail'

interface MobileDrawerProps {
  user: {
    name?: string | null
    role: Role
    email?: string | null
  }
  preferredArea?: string | null
}

export default function MobileDrawer({ user, preferredArea = null }: MobileDrawerProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const areas = getAreasForRole(user.role)
  const routeArea = resolveArea(user.role, pathname, searchParams, preferredArea)
  const [area, setArea] = useState<AreaId>(routeArea)

  // vaul issue #631 workaround: close drawer on route change
  useEffect(() => {
    setOpen(false)
    setArea(routeArea)
  }, [pathname, routeArea])

  const items = getAreaNav(user.role, area)
  const activeHref = activeNavHref(items.map((i) => i.href), pathname, searchParams)
  const groups = [
    { key: 'main', title: null as string | null, items: items.filter((i) => !i.section) },
    { key: 'gestao', title: 'Gestão', items: items.filter((i) => i.section === 'Gestão') },
  ].filter((g) => g.items.length > 0)

  function selectArea(id: string) {
    rememberArea(id as AreaId)
    setArea(id as AreaId)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="md:hidden fixed bottom-4 left-4 z-nav p-3 rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition-colors duration-fast"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-overlay" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-modal bg-surface rounded-t-2xl flex flex-col max-h-[85vh] outline-none">
            <div className="mx-auto mt-2 mb-3 h-1.5 w-12 rounded-full bg-line-strong" />
            <Drawer.Title className="sr-only">Menu</Drawer.Title>

            <div className="px-5 pb-3 border-b border-line space-y-3">
              <BrandLockup />
              {areas.length > 1 && (
                <SectionTabs
                  ariaLabel="Áreas"
                  value={area}
                  onChange={selectArea}
                  tabs={areas.map((id) => ({ id, label: AREAS[id].short }))}
                  className="w-full"
                />
              )}
            </div>

            <nav className="flex-1 overflow-y-auto py-3" aria-label={`Menu: ${AREAS[area].label}`}>
              {groups.map((group) => (
                <div key={group.key} className="mb-4 last:mb-0">
                  {group.title && <p className="px-5 pb-1.5 text-xs font-medium text-ink-3">{group.title}</p>}
                  {group.items.map(({ href, label, icon }) => {
                    const isActive = href === activeHref
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`mx-2 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                          isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-2 hover:bg-raised hover:text-ink'
                        }`}
                      >
                        <NavIcon name={icon} />
                        <span>{label}</span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-line space-y-3">
              <ThemeToggle />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-ink">{user.name || user.email}</p>
                <form action={logout}>
                  <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-fast">
                    Sair
                  </button>
                </form>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
