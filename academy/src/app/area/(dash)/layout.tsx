import Link from 'next/link'
import { getSession } from '@/lib/auth'

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/area" className="flex items-center gap-2 font-bold text-white">
            <span className="text-xs font-black uppercase tracking-[0.28em] text-academy-gold">PROJETUS</span>
            <span className="text-sm text-white/70">Academy</span>
          </Link>
          <div className="flex min-w-0 items-center gap-4 text-sm text-white/55">
            <span className="hidden truncate sm:block">{session?.email}</span>
            <form action="/api/auth/learner/logout" method="POST">
              <button type="submit" className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
