import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import NotificationBell from '@/components/NotificationBell'

function computeStreak(days: string[]): number {
  // days: distinct active days as 'YYYY-MM-DD', sorted DESC
  if (days.length === 0) return 0

  const set = new Set(days)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  // Determine the anchor: today if active today, else yesterday if active yesterday, else no streak
  const addDays = (iso: string, delta: number) => {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    return d.toISOString().slice(0, 10)
  }

  const yesterdayStr = addDays(todayStr, -1)

  let cursor: string
  if (set.has(todayStr)) cursor = todayStr
  else if (set.has(yesterdayStr)) cursor = yesterdayStr
  else return 0

  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

async function getStreak(email: string): Promise<number> {
  try {
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT (ep.last_seen_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
       FROM education_progress ep
       JOIN education_enrollments e ON e.id = ep.enrollment_id
       JOIN learners l ON l.id = e.learner_id
       WHERE l.email = $1 AND ep.last_seen_at IS NOT NULL
       ORDER BY day DESC
       LIMIT 60`,
      [email],
    )
    const days = rows.map((r) => {
      // node-postgres may return Date or string for ::date
      const v = r.day as unknown
      if (v instanceof Date) return v.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      return String(v).slice(0, 10)
    })
    return computeStreak(days)
  } catch {
    return 0
  }
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const streak = session?.email ? await getStreak(session.email) : 0

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/area" className="flex items-center gap-2 font-bold text-white">
            <span className="text-sm font-semibold text-white">Capte Recursos</span>
          </Link>
          <div className="flex min-w-0 items-center gap-4 text-sm text-white/55">
            {streak > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-academy-gold/15 px-2.5 py-1 text-xs font-semibold text-academy-gold">
                🔥 {streak} {streak === 1 ? 'dia' : 'dias'}
              </span>
            )}
            <Link href="/area/conta" className="hidden truncate text-xs font-semibold text-white/70 transition hover:text-white sm:block">
              Conta
            </Link>
            <NotificationBell />
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
