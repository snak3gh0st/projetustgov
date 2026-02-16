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

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Pipeline', icon: '📊' },
  { href: '/leads', label: 'Leads', icon: '👥' },
  { href: '/comissoes', label: 'Comissões', icon: '💰' },
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
    : BASE_NAV_ITEMS  // vendedor and visualizador see base items

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
              <span>{icon}</span>
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
