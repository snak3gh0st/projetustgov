import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Link from 'next/link'

export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-academy-sand">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/area" className="font-bold text-academy-blue">
            PROJETUS Academy
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>{session.email}</span>
            <form action="/api/auth/learner/logout" method="POST">
              <button type="submit" className="text-slate-400 hover:text-slate-700">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  )
}
