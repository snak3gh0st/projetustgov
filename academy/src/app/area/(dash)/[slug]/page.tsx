'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Lesson = {
  id: string
  slug: string
  title: string
  position: number
  duration_seconds: number | null
  playback_url: string | null
}

type Module = {
  id: string
  title: string
  position: number
  lessons: Lesson[]
}

type Course = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  cover_image_url: string | null
  modules: Module[]
}

type ProgressEntry = { status: string; position: number | null }
type Progress = Record<string, ProgressEntry>

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  const [course, setCourse] = useState<Course | null>(null)
  const [progress, setProgress] = useState<Progress>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/area/courses/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (!d.data) { setNotFound(true); setLoading(false); return }
        const c: Course = d.data
        setCourse(c)
        setExpanded(new Set((c.modules ?? []).map(m => m.id)))
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [slug])

  useEffect(() => {
    fetch('/api/area/progress')
      .then(r => r.json())
      .then(d => { if (d.data) setProgress(d.data) })
      .catch(() => {})
  }, [slug])

  const toggleModule = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Loading skeleton
  if (loading) return (
    <div className="min-h-screen bg-black text-white">
      <div className="relative min-h-[360px] overflow-hidden rounded-xl animate-pulse bg-white/5 mb-8" />
      <div className="space-y-3 px-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  )

  // Error / not found
  if (notFound || !course) return (
    <div className="flex min-h-[64vh] items-center justify-center text-white">
      <div className="text-center">
        <p className="text-red-400 mb-4">Curso não encontrado ou sem acesso.</p>
        <Link href="/area" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Voltar aos cursos
        </Link>
      </div>
    </div>
  )

  const allLessons = (course.modules ?? []).flatMap(m => m.lessons ?? [])
  const doneCount = allLessons.filter(l => progress[l.id]?.status === 'completed').length
  const totalCount = allLessons.length
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const hasStarted = doneCount > 0

  // Find the first non-completed lesson for "Continuar", or first lesson for "Começar"
  const continueLesson = allLessons.find(l => progress[l.id]?.status !== 'completed') ?? allLessons[0]
  const ctaHref = continueLesson
    ? `/area/${slug}/player?aula=${continueLesson.slug}`
    : `/area/${slug}/player`

  return (
    <div className="min-h-screen bg-black text-white pb-16">

      {/* Back link */}
      <div className="mb-6">
        <Link href="/area" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <span>←</span> Todos os cursos
        </Link>
      </div>

      {/* Hero banner */}
      <section className="relative min-h-[360px] overflow-hidden rounded-xl mb-10">
        {/* Background */}
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(184,137,23,0.26),transparent_28%),radial-gradient(circle_at_78%_10%,rgba(15,76,129,0.45),transparent_30%),linear-gradient(135deg,#020617,#09090b_48%,#111827)]" />
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex min-h-[360px] max-w-2xl flex-col justify-end p-6 sm:p-10">
          <h1 className="text-3xl font-bold text-white sm:text-4xl leading-tight">{course.title}</h1>
          {course.subtitle && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">{course.subtitle}</p>
          )}

          {/* Progress */}
          <div className="mt-6 max-w-md">
            <div className="mb-2 flex justify-between text-xs text-white/50">
              <span>{doneCount} de {totalCount} aulas</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-academy-gold transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* CTA */}
          <div className="mt-7">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-academy-gold hover:text-white"
            >
              <span>▶</span>
              {hasStarted ? 'Continuar' : 'Começar'}
            </Link>
          </div>
        </div>
      </section>

      {/* Module list */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-white">Conteúdo do curso</h2>
        <div className="space-y-2">
          {(course.modules ?? []).map(mod => {
            const modLessons = mod.lessons ?? []
            const modDone = modLessons.filter(l => progress[l.id]?.status === 'completed').length
            const isOpen = expanded.has(mod.id)

            return (
              <div key={mod.id} className="rounded-lg bg-white/5 overflow-hidden">
                {/* Module header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{mod.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {modDone}/{modLessons.length} aulas concluídas
                    </p>
                  </div>
                  <span className="text-slate-500 text-xs ml-4 shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Lesson list */}
                {isOpen && modLessons.length > 0 && (
                  <ul className="border-t border-white/5 pb-1">
                    {modLessons.map(lesson => {
                      const status = progress[lesson.id]?.status ?? 'not_started'
                      const isCompleted = status === 'completed'
                      const isInProgress = status === 'in_progress'

                      return (
                        <li key={lesson.id}>
                          <Link
                            href={`/area/${slug}/player?aula=${lesson.slug}`}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 rounded-lg cursor-pointer transition-colors mx-1 my-0.5"
                          >
                            {/* Status circle */}
                            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isInProgress
                                ? 'bg-academy-gold text-white'
                                : 'border border-slate-600 text-slate-600'
                            }`}>
                              {isCompleted ? '✓' : isInProgress ? '▶' : ''}
                            </span>

                            {/* Title */}
                            <span className={`flex-1 text-sm leading-snug ${
                              isCompleted ? 'text-slate-500' : 'text-slate-200'
                            }`}>
                              {lesson.title}
                            </span>

                            {/* Duration */}
                            {lesson.duration_seconds && (
                              <span className="text-xs text-slate-500 shrink-0">
                                {fmt(lesson.duration_seconds)}
                              </span>
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
