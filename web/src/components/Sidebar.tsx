'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/auth-actions'

interface SidebarProps {
  user: {
    name?: string | null
    role: 'gestor' | 'vendedor' | 'visualizador'
    email?: string | null
  }
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
    case 'vendedores':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
    default:
      return <span className="w-4 h-4 rounded-full bg-gray-300" />
  }
}

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
  { href: '/comissoes', label: 'Comissoes', icon: 'comissoes' },
]

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  const navItems = user.role === 'gestor'
    ? [
        ...BASE_NAV_ITEMS,
        { href: '/upload', label: 'Importar Planilha', icon: 'upload' },
        { href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' },
        { href: '/monitoramento', label: 'Monitoramento', icon: 'monitoramento' },
        { href: '/cadastro-vendedor', label: 'Vendedores', icon: 'vendedores' },
      ]
    : BASE_NAV_ITEMS

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-200 flex flex-col z-50">
      <div className="p-5 border-b border-gray-200">
        <h1 className="font-heading text-xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-[#FD225C] via-[#7A4BAC] to-[#0072F7] bg-clip-text text-transparent">PROJETUS</span>
        </h1>
        <p className="text-[10px] text-gray-400 mt-0.5 tracking-widest uppercase">
          CRM de Vendas
        </p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ href, label, icon }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-[#0072F7] bg-blue-50 border-r-2 border-[#0072F7]'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <NavIcon name={icon} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info and logout */}
      <div className="p-4 border-t border-gray-200 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-800 truncate">
            {user.name || user.email}
          </p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
            user.role === 'gestor'
              ? 'bg-blue-50 text-blue-600'
              : user.role === 'visualizador'
              ? 'bg-purple-50 text-purple-600'
              : 'bg-green-50 text-green-600'
          }`}>
            {user.role === 'gestor' ? 'Gestor' : user.role === 'visualizador' ? 'Visualizador' : 'Vendedor'}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full bg-red-50 hover:bg-red-100 text-red-500 py-2 px-3 rounded text-sm transition-colors"
          >
            Sair
          </button>
        </form>
      </div>

      {/* Footer: powered by */}
      <div className="px-5 py-3 border-t border-gray-200">
        <p className="text-[10px] text-[#0072F7] tracking-wider text-center">
          powered by <span className="font-semibold">SigmaIntel</span>
        </p>
      </div>
    </aside>
  )
}
