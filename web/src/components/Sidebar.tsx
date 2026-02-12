'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/auth-actions'

interface SidebarProps {
  user: {
    name?: string | null
    role: 'gestor' | 'vendedor'
    email?: string | null
  }
}

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Pipeline', icon: '📊' },
  { href: '/leads', label: 'Leads', icon: '👥' },
]

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  // Add gestor-only nav items
  const navItems = user.role === 'gestor'
    ? [
        ...BASE_NAV_ITEMS,
        { href: '/upload', label: 'Importar Planilha', icon: '📤' },
        { href: '/distribuir', label: 'Distribuir Leads', icon: '🔀' },
        { href: '/monitoramento', label: 'Monitoramento', icon: '📈' },
        { href: '/cadastro-vendedor', label: 'Vendedores', icon: '👤' },
      ]
    : BASE_NAV_ITEMS

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-sigma-navy-light border-r border-white/5 flex flex-col z-50">
      <div className="p-5 border-b border-white/5">
        <h1 className="font-heading text-xl font-bold text-sigma-neon tracking-tight">
          PROJETUS
        </h1>
        <p className="text-[10px] text-gray-500 mt-0.5 tracking-widest uppercase">
          Sigma CRM
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
                  ? 'text-sigma-neon bg-sigma-neon/10 border-r-2 border-sigma-neon'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info and logout */}
      <div className="p-4 border-t border-white/5 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-200 truncate">
            {user.name || user.email}
          </p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
            user.role === 'gestor'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'bg-green-500/20 text-green-400'
          }`}>
            {user.role === 'gestor' ? 'Gestor' : 'Vendedor'}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 px-3 rounded text-sm transition-colors"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
