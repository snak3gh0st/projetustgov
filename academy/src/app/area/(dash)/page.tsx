'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Course = {
  id: string; slug: string; title: string; subtitle: string | null
  cover_image_url: string | null; product_type: string
  enrollment_status: string; enrolled_at: string; lesson_count: number; completed_count: number
  resume_lesson_slug: string | null
  resume_lesson_title: string | null
  avg_rating: number; review_count: number; in_watchlist: boolean
}

export default function AreaPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/area/courses').then(r => r.json()).then(d => { setCourses(d.data ?? []); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="min-h-[60vh]">
      <div className="h-80 animate-pulse rounded-lg bg-white/5" />
      <div className="mt-8 flex gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-44 flex-1 animate-pulse rounded-lg bg-white/5" />)}
      </div>
    </div>
  )

  const featured = courses[0]
  const inProgress = courses.filter(c => c.completed_count > 0 && c.completed_count < c.lesson_count)
  const readyToStart = courses.filter(c => c.completed_count === 0)
  const completed = courses.filter(c => c.lesson_count > 0 && c.completed_count >= c.lesson_count)
  const continueWatching = courses.filter(c => c.resume_lesson_slug)
  const watchlist = courses.filter(c => c.in_watchlist)

  const q = search.trim().toLowerCase()
  const filtered = q ? courses.filter(c => c.title.toLowerCase().includes(q) || (c.subtitle ?? '').toLowerCase().includes(q)) : []

  function progressFor(course: Course) {
    if (!course.lesson_count) return 0
    return Math.min(100, Math.round((course.completed_count / course.lesson_count) * 100))
  }

  function CourseCard({ course, resume, className }: { course: Course; resume?: boolean; className?: string }) {
    const progress = progressFor(course)
    const href = resume && course.resume_lesson_slug
      ? `/area/${course.slug}/player?aula=${course.resume_lesson_slug}`
      : `/area/${course.slug}`

    return (
      <Link
        href={href}
        className={`group relative snap-start overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl shadow-black/25 transition duration-300 hover:-translate-y-1 hover:border-academy-gold/60 ${className ?? ''}`}
      >
        <div className="relative aspect-[16/9] bg-zinc-800">
          {course.cover_image_url ? (
            <img src={course.cover_image_url} alt={course.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_10%,rgba(184,137,23,0.28),transparent_32%),linear-gradient(135deg,#111827,#020617)]">
              <span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Projetus</span>
            </div>
          )}
          {resume && course.resume_lesson_title && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6">
              <p className="line-clamp-1 text-[11px] font-semibold text-white/90">▶ Retomar: {course.resume_lesson_title}</p>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="mb-3 h-1 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-academy-gold" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-academy-gold">{course.product_type}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-white">{course.title}</h3>
          {course.subtitle && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/45">{course.subtitle}</p>}
          <div className="mt-4 flex items-center justify-between text-xs text-white/45">
            <span className="flex items-center gap-2">
              <span>{course.completed_count}/{course.lesson_count} aulas</span>
              {course.review_count > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-academy-gold">★</span>
                  <span className="text-white/45">{Number(course.avg_rating).toFixed(1)} ({course.review_count})</span>
                </span>
              )}
            </span>
            <span className="font-semibold text-white/70">{progress}%</span>
          </div>
        </div>
      </Link>
    )
  }

  function CourseRail({ title, items, resume }: { title: string; items: Course[]; resume?: boolean }) {
    if (!items.length) return null

    return (
      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <span className="text-xs text-white/35">{items.length} curso{items.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex snap-x gap-4 overflow-x-auto pb-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map(course => (
            <CourseCard key={course.id} course={course} resume={resume} className="min-w-[250px] sm:min-w-[310px]" />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <div className="relative max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cursos…"
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-academy-gold focus:ring-1 focus:ring-academy-gold"
          />
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="flex min-h-[64vh] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-academy-gold">PROJETUS Academy</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">Sua biblioteca ainda está vazia</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
              Assim que uma matrícula for liberada, seus cursos aparecem aqui com aulas, progresso e player.
            </p>
          </div>
        </div>
      ) : q ? (
        <section>
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-white/50">Nenhum curso encontrado para &quot;{search}&quot;.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map(course => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {featured && (
            <section className="relative min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-zinc-950">
              {featured.cover_image_url ? (
                <img src={featured.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(184,137,23,0.26),transparent_28%),radial-gradient(circle_at_78%_10%,rgba(15,76,129,0.45),transparent_30%),linear-gradient(135deg,#020617,#09090b_48%,#111827)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black to-transparent" />
              <div className="relative z-10 flex min-h-[420px] max-w-2xl flex-col justify-end p-6 sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-academy-gold">
                  {progressFor(featured) === 0 ? 'Em destaque' : progressFor(featured) === 100 ? 'Concluído' : 'Continue de onde parou'}
                </p>
                <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-5xl">{featured.title}</h1>
                {featured.subtitle && <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">{featured.subtitle}</p>}
                <div className="mt-6 max-w-md">
                  <div className="mb-2 flex justify-between text-xs text-white/50">
                    <span>{featured.completed_count} de {featured.lesson_count} aulas</span>
                    <span>{progressFor(featured)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-academy-gold" style={{ width: `${progressFor(featured)}%` }} />
                  </div>
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href={`/area/${featured.slug}/player`} className="rounded-md bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-academy-gold hover:text-white">
                    Assistir agora
                  </Link>
                  <Link href={`/area/${featured.slug}`} className="rounded-md border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
                    Ver aulas
                  </Link>
                </div>
              </div>
            </section>
          )}

          <CourseRail title="Continuar assistindo" items={continueWatching} resume />
          <CourseRail title="Minha Lista" items={watchlist} />
          <CourseRail title="Continue de onde parou" items={inProgress} />
          <CourseRail title="Comece agora" items={readyToStart} />
          <CourseRail title="Concluídos" items={completed} />
        </>
      )}
    </div>
  )
}
