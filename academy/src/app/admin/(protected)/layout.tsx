import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/auth'

const nav = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/produtos', label: 'Produtos' },
  { href: '/admin/alunos', label: 'Alunos' },
  { href: '/admin/matriculas', label: 'Matrículas' },
  { href: '/admin/afiliados', label: 'Afiliados' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()

  if (!session) {
    redirect('/admin/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-200">
      <aside className="w-56 flex-shrink-0 border-r border-slate-700 bg-slate-900 px-4 py-6">
        <div className="mb-8">
          <p className="text-sm font-semibold text-slate-200">Capte Recursos Admin</p>
        </div>
        <nav className="space-y-1">
          {nav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <form action="/api/auth/admin/logout" method="POST">
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-300">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
