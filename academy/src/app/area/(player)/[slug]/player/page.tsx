'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false })

type Lesson = {
  id: string
  slug: string
  title: string
  position: number
  lesson_type: string
  duration_seconds: number | null
  playback_url: string | null
}

type Module = {
  id: string
  title: string
  position: number
  lessons: Lesson[] | null
}

type Course = {
  id: string
  slug: string
  title: string
  modules: Module[] | null
}

type ProgressEntry = { status: string; position: number | null }
type Progress = Record<string, ProgressEntry>

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-academy-gold border-t-transparent animate-spin" />
      </div>
    }>
      <PlayerContent />
    </Suspense>
  )
}

function PlayerContent() {
  const { slug } = useParams<{ slug: string }>()
  const searchParams = useSearchParams()

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [progress, setProgress] = useState<Progress>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [countdown, setCountdown] = useState<number | null>(null)
  const activeLessonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch(`/api/area/courses/${slug}`)
      .then(r => r.json())
      .then(d => {
        const c: Course = d.data
        setCourse(c)
        setExpanded(new Set((c?.modules ?? []).map(m => m.id)))
        const all = (c?.modules ?? []).flatMap(m => m.lessons ?? [])
        const aula = searchParams.get('aula')
        const target = aula ? all.find(l => l.slug === aula) : all[0]
        if (target) setActiveLesson(target)
        setLoading(false)
      })
  }, [slug, searchParams])

  useEffect(() => {
    fetch('/api/area/progress')
      .then(r => r.json())
      .then(d => { if (d.data) setProgress(d.data) })
      .catch(() => {})
  }, [slug])

  const allLessons = (course?.modules ?? []).flatMap(m => m.lessons ?? [])
  const nextLesson = activeLesson
    ? allLessons[allLessons.findIndex(l => l.id === activeLesson.id) + 1] ?? null
    : null
  const activeModule = course?.modules?.find(m => m.lessons?.some(l => l.id === activeLesson?.id))
  const doneCount = allLessons.filter(l => progress[l.id]?.status === 'completed').length

  const initialPosition = activeLesson ? (progress[activeLesson.id]?.position ?? undefined) : undefined

  const handlePositionUpdate = useCallback(async (pos: number) => {
    if (!activeLesson) return
    await fetch(`/api/area/progress/${activeLesson.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', position_seconds: Math.floor(pos) }),
    }).catch(() => {})
  }, [activeLesson])

  const markComplete = useCallback(async (lessonId: string) => {
    setProgress(p => ({ ...p, [lessonId]: { status: 'completed', position: p[lessonId]?.position ?? null } }))
    await fetch(`/api/area/progress/${lessonId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    }).catch(() => {})
  }, [])

  const handleEnded = useCallback(() => {
    if (activeLesson) markComplete(activeLesson.id)
    if (nextLesson) {
      setCountdown(5)
    }
  }, [activeLesson, nextLesson, markComplete])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      if (nextLesson) setActiveLesson(nextLesson)
      return
    }
    const t = setTimeout(() => setCountdown(c => c !== null ? c - 1 : null), 1000)
    return () => clearTimeout(t)
  }, [countdown, nextLesson])

  useEffect(() => {
    activeLessonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeLesson])

  const toggleModule = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (loading) return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-academy-gold border-t-transparent animate-spin" />
    </div>
  )

  if (!course) return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center text-white">
      <div className="text-center">
        <p className="text-red-400 mb-4">Curso não encontrado ou sem acesso.</p>
        <Link href="/area" className="text-sm text-slate-400 hover:text-white">← Voltar aos cursos</Link>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col text-white overflow-hidden">

      {/* Top bar */}
      <header className="h-12 flex-shrink-0 bg-black/70 backdrop-blur border-b border-white/5 flex items-center px-4 gap-3">
        <Link
          href={`/area/${slug}`}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <span className="text-lg leading-none">←</span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-widest text-academy-gold">PROJETUS</span>
            <span className="text-xs text-slate-500">Academy</span>
          </span>
        </Link>
        <span className="text-white/20 hidden sm:block">|</span>
        <p className="flex-1 min-w-0 text-sm font-medium text-slate-200 truncate">{course.title}</p>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Fechar lista de aulas' : 'Ver lista de aulas'}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect y="1" width="14" height="2" rx="1" />
            <rect y="6" width="10" height="2" rx="1" />
            <rect y="11" width="12" height="2" rx="1" />
          </svg>
          <span className="hidden sm:inline">Aulas</span>
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Video + info */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Video */}
          <div className="relative flex-1 bg-black min-h-0">
            {activeLesson?.playback_url ? (
              <VideoPlayer
                key={activeLesson.id}
                src={activeLesson.playback_url}
                title={activeLesson.title}
                onEnded={handleEnded}
                initialPosition={initialPosition}
                onPositionUpdate={handlePositionUpdate}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
                {activeLesson ? 'Vídeo não disponível ainda.' : 'Selecione uma aula na lista →'}
              </div>
            )}
            {countdown !== null && nextLesson && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-black/80 backdrop-blur px-5 py-3 shadow-xl">
                <span className="text-sm text-white font-medium">
                  Próxima aula em <span className="font-bold text-academy-gold">{countdown}s</span>
                </span>
                <button
                  onClick={() => setCountdown(null)}
                  className="text-xs text-slate-400 hover:text-white transition-colors border border-white/20 rounded-full px-3 py-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* Lesson info */}
          <div className="flex-shrink-0 bg-slate-900/80 border-t border-white/5 px-5 py-3.5">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                {activeModule && (
                  <p className="text-xs text-slate-500 mb-0.5 truncate">{activeModule.title}</p>
                )}
                <h2 className="font-semibold text-white text-sm sm:text-base truncate">
                  {activeLesson?.title ?? 'Selecione uma aula'}
                </h2>
                {activeLesson?.duration_seconds && (
                  <p className="text-xs text-slate-500 mt-0.5">{fmt(activeLesson.duration_seconds)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeLesson && progress[activeLesson.id]?.status !== 'completed' && (
                  <button
                    onClick={() => activeLesson && markComplete(activeLesson.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:border-white/30 transition-colors"
                  >
                    <span>✓</span> Concluída
                  </button>
                )}
                {nextLesson && (
                  <button
                    onClick={() => setActiveLesson(nextLesson)}
                    className="flex items-center gap-1.5 rounded-lg bg-academy-gold px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  >
                    Próxima <span>→</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Episode sidebar */}
        {sidebarOpen && (
          <>
          <div
            className="fixed inset-0 z-20 bg-black/50 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-30 w-80 sm:w-72 xl:w-80 flex-shrink-0 border-l border-white/5 bg-slate-900 flex flex-col overflow-hidden sm:relative sm:inset-auto sm:z-auto">
            <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Conteúdo</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {doneCount} / {allLessons.length} aulas concluídas
              </p>
              {allLessons.length > 0 && (
                <div className="mt-2 h-1 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-academy-gold transition-all"
                    style={{ width: `${Math.round((doneCount / allLessons.length) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {(() => {
                const lessonIndexMap = new Map<string, number>()
                let idx = 0
                for (const mod of course.modules ?? []) {
                  for (const l of mod.lessons ?? []) {
                    lessonIndexMap.set(l.id, idx + 1)
                    idx++
                  }
                }
                return (course.modules ?? []).map(mod => {
                const modLessons = mod.lessons ?? []
                const modDone = modLessons.filter(l => progress[l.id]?.status === 'completed').length
                const isOpen = expanded.has(mod.id)

                return (
                  <div key={mod.id}>
                    <button
                      onClick={() => toggleModule(mod.id)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-300 truncate">{mod.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{modDone}/{modLessons.length} aulas</p>
                      </div>
                      <span className="text-slate-600 text-xs ml-2 shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <ul>
                        {modLessons.map(lesson => {
                          const isActive = lesson.id === activeLesson?.id
                          const isDone = progress[lesson.id]?.status === 'completed'

                          return (
                            <li key={lesson.id} className="relative">
                              <button
                                ref={isActive ? activeLessonRef : undefined}
                                onClick={() => setActiveLesson(lesson)}
                                className={`flex w-full items-center gap-2.5 pl-4 pr-3 py-2.5 text-left transition-colors border-l-2 ${
                                  isActive
                                    ? 'bg-academy-gold/10 border-academy-gold'
                                    : 'hover:bg-white/5 border-transparent'
                                }`}
                              >
                                {/* Lesson number */}
                                <span className="flex-shrink-0 text-[10px] text-slate-600 w-5 text-right font-mono">
                                  {lessonIndexMap.get(lesson.id)}
                                </span>

                                {/* Status circle */}
                                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  isDone
                                    ? 'bg-green-500 text-white'
                                    : isActive
                                    ? 'bg-academy-gold text-white'
                                    : 'border border-slate-600 text-slate-600'
                                }`}>
                                  {isDone ? '✓' : isActive ? '▶' : ''}
                                </span>

                                <span className={`flex-1 text-xs leading-tight ${
                                  isActive ? 'text-white font-semibold' : isDone ? 'text-slate-500' : 'text-slate-300'
                                }`}>
                                  {lesson.title}
                                </span>

                                {lesson.duration_seconds && (
                                  <span className="text-[10px] text-slate-600 shrink-0">
                                    {fmt(lesson.duration_seconds)}
                                  </span>
                                )}
                              </button>
                              {/* Mini progress bar for in_progress */}
                              {progress[lesson.id]?.status === 'in_progress' && lesson.duration_seconds && progress[lesson.id]?.position && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
                                  <div
                                    className="h-full bg-academy-gold/60"
                                    style={{ width: `${Math.min(100, Math.round(((progress[lesson.id]?.position ?? 0) / lesson.duration_seconds) * 100))}%` }}
                                  />
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })
              })()}
            </div>
          </aside>
          </>
        )}
      </div>
    </div>
  )
}
