'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/lib/auth-actions'
import ThemeToggle from '@/components/ThemeToggle'
import { getNavItemsForRole } from '@/lib/sidebar-nav-items'

interface SidebarProps {
  user: {
    name?: string | null
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao'
    email?: string | null
  }
  defaultOpen?: boolean
}

function NavIcon({ name, className }: { name: string; className?: string }) {
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
    default:
      return <span className="w-4 h-4 rounded-full bg-gray-300" />
  }
}

export default function Sidebar({ user, defaultOpen = true }: SidebarProps) {
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

  return (
    <aside
      data-sidebar-open={open}
      className={`fixed left-0 top-0 h-screen ${open ? 'w-56' : 'w-14'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 hidden md:flex flex-col z-50 transition-[width] duration-200`}
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800">
        <div className={open ? '' : 'hidden'}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Projete" style={{ width: 100, height: 'auto' }} />
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 tracking-widest uppercase">
            Hub da PROJETUS
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={open ? 'Recolher menu' : 'Expandir menu'}
          className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
        >
          {open ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          )}
        </button>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ href, label, icon }) => {
          // Compute active state. For hrefs with ?view=, match both pathname AND view.
          // For plain /tgov, only active when on /tgov without a view querystring (so
          // Pipeline doesn't stay highlighted when BI view is open).
          const [hrefPath, hrefQuery] = href.split('?')
          const hrefView = hrefQuery
            ? new URLSearchParams(hrefQuery).get('view')
            : null
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
              className={`flex items-center gap-3 ${open ? 'px-5' : 'px-3 justify-center'} py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-[#0072F7] bg-blue-50 dark:bg-blue-950/40 border-r-2 border-[#0072F7]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <NavIcon name={icon} />
              <span className={open ? '' : 'hidden'}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info and logout */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <ThemeToggle />
        <div className={open ? '' : 'hidden'}>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
            {user.name || user.email}
          </p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
            user.role === 'gestor' || user.role === 'admin'
              ? 'bg-blue-50 text-blue-600'
              : user.role === 'coordenador'
              ? 'bg-indigo-50 text-indigo-600'
              : user.role === 'visualizador'
              ? 'bg-purple-50 text-purple-600'
              : user.role === 'adm_produto'
              ? 'bg-orange-50 text-orange-600'
              : user.role === 'csm'
              ? 'bg-teal-50 text-teal-600'
              : user.role === 'coord_aprovacao'
              ? 'bg-sky-50 text-sky-600'
              : user.role === 'assistente_aprovacao'
              ? 'bg-cyan-50 text-cyan-600'
              : user.role === 'projetista'
              ? 'bg-violet-50 text-violet-600'
              : user.role === 'coord_execucao' || user.role === 'assistente_execucao'
              ? 'bg-amber-50 text-amber-600'
              : user.role === 'coord_prestacao' || user.role === 'assistente_prestacao'
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-green-50 text-green-600'
          }`}>
            {user.role === 'gestor' ? 'Gestor' : user.role === 'admin' ? 'Admin' : user.role === 'coordenador' ? 'Coordenador' : user.role === 'visualizador' ? 'Visualizador' : user.role === 'adm_produto' ? 'Adm Produto' : user.role === 'csm' ? 'CSM' : user.role === 'coord_aprovacao' ? 'Coord. Aprovação' : user.role === 'assistente_aprovacao' ? 'Assist. Aprovação' : user.role === 'projetista' ? 'Projetista' : user.role === 'coord_execucao' ? 'Coord. Execução' : user.role === 'assistente_execucao' ? 'Assist. Execução' : user.role === 'coord_prestacao' ? 'Coord. Prestação' : user.role === 'assistente_prestacao' ? 'Assist. Prestação' : 'Vendedor'}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Sair"
            className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-500 dark:text-red-400 py-2 px-3 rounded text-sm transition-colors"
          >
            {open ? 'Sair' : '×'}
          </button>
        </form>
      </div>

      {/* Footer: powered by */}
      <div className={`px-5 py-3 border-t border-gray-200 dark:border-gray-800 ${open ? '' : 'hidden'}`}>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mb-1">v4.7</p>
        <p className="text-[10px] text-[#0072F7] tracking-wider text-center">
          powered by <a href="https://sigmaintel.io" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">SigmaIntel</a>
        </p>
      </div>
    </aside>
  )
}
