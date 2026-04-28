'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Drawer } from 'vaul'
import { logout } from '@/lib/auth-actions'
import { getNavItemsForRole, type NavRole } from '@/lib/sidebar-nav-items'
import ThemeToggle from '@/components/ThemeToggle'

interface MobileDrawerProps {
  user: {
    name?: string | null
    role: NavRole
    email?: string | null
  }
}

export default function MobileDrawer({ user }: MobileDrawerProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const navItems = getNavItemsForRole(user.role)

  // vaul issue #631 workaround: close drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* Hamburger trigger — visible only on screens narrower than md */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        className="md:hidden fixed bottom-4 left-4 z-40 p-3 rounded-full bg-[#0072F7] text-white shadow-lg hover:bg-[#0058C4] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl flex flex-col max-h-[85vh] outline-none">
            {/* Drag handle */}
            <div className="mx-auto mt-2 mb-3 h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-700" />

            {/* Brand header */}
            <div className="px-5 pb-3 border-b border-gray-200 dark:border-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Projete" style={{ width: 100, height: 'auto' }} />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 tracking-widest uppercase">
                Hub da Projetos
              </p>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3">
              {navItems.map(({ href, label }) => {
                const [hrefPath, hrefQuery] = href.split('?')
                const hrefView = hrefQuery ? new URLSearchParams(hrefQuery).get('view') : null
                const currentView = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('view') : null
                let isActive: boolean
                if (href === '/') {
                  isActive = pathname === '/'
                } else if (hrefPath === '/tgov') {
                  isActive = pathname === '/tgov' && (currentView ?? null) === (hrefView ?? null)
                } else {
                  isActive = pathname.startsWith(hrefPath)
                }
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`block px-5 py-3 text-sm transition-colors ${
                      isActive
                        ? 'text-[#0072F7] bg-blue-50 dark:bg-blue-950/40 border-l-4 border-[#0072F7]'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* Footer: ThemeToggle + user + logout */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              <ThemeToggle />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {user.name || user.email}
                </p>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-500 dark:text-red-400 py-2 px-3 rounded text-sm transition-colors"
                >
                  Sair
                </button>
              </form>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
