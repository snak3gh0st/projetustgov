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
  summary: string | null
  content_html: string | null
  attachments: { id: string; url: string }[] | null
  subtitle_url: string | null
  poster_url: string | null
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

type Comment = {
  id: string
  parent_id: string | null
  body: string
  created_at: string
  author_name: string | null
  is_mine: boolean
}

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

  // Notes panel
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesLoaded, setNotesLoaded] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesLessonRef = useRef<string | null>(null)

  // Comments panel
  const [comments, setComments] = useState<Comment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [posting, setPosting] = useState(false)

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

  const handleProgress = useCallback((fraction: number) => {
    if (!activeLesson) return
    if (fraction >= 0.95 && progress[activeLesson.id]?.status !== 'completed') {
      markComplete(activeLesson.id)
    }
  }, [activeLesson, progress, markComplete])

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

  // Load notes when the active lesson changes
  useEffect(() => {
    if (notesDebounceRef.current) {
      clearTimeout(notesDebounceRef.current)
      notesDebounceRef.current = null
    }
    if (!activeLesson) {
      notesLessonRef.current = null
      setNotes('')
      setNotesLoaded(false)
      return
    }
    const lessonId = activeLesson.id
    notesLessonRef.current = lessonId
    setNotesLoaded(false)
    setNotes('')
    setNotesSaving(false)
    let cancelled = false
    fetch(`/api/area/notes/${lessonId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || notesLessonRef.current !== lessonId) return
        setNotes(d.data?.content ?? '')
        setNotesLoaded(true)
      })
      .catch(() => {
        if (cancelled || notesLessonRef.current !== lessonId) return
        setNotesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [activeLesson])

  // Clear pending debounce on unmount
  useEffect(() => () => {
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
  }, [])

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value)
    const lessonId = activeLesson?.id
    if (!lessonId) return
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    notesDebounceRef.current = setTimeout(async () => {
      setNotesSaving(true)
      await fetch(`/api/area/notes/${lessonId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      }).catch(() => {})
      // Only clear the saving state if we're still on the same lesson
      if (notesLessonRef.current === lessonId) setNotesSaving(false)
    }, 800)
  }, [activeLesson])

  // Load comments when the active lesson changes
  useEffect(() => {
    if (!activeLesson) {
      setComments([])
      setReplyTo(null)
      setCommentBody('')
      return
    }
    const lessonId = activeLesson.id
    setComments([])
    setReplyTo(null)
    setCommentBody('')
    let cancelled = false
    fetch(`/api/area/comments?lessonId=${lessonId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setComments(d.data?.comments ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeLesson])

  const submitComment = useCallback(async () => {
    const text = commentBody.trim()
    if (!text || !activeLesson || posting) return
    setPosting(true)
    try {
      const res = await fetch('/api/area/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: activeLesson.id, body: text, parentId: replyTo }),
      })
      const d = await res.json()
      if (res.ok && d.data?.comment) {
        setComments(c => [...c, d.data.comment as Comment])
        setCommentBody('')
        setReplyTo(null)
      }
    } catch {
      // ignore
    } finally {
      setPosting(false)
    }
  }, [commentBody, activeLesson, replyTo, posting])

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
                onProgress={handleProgress}
                poster={activeLesson.poster_url ?? undefined}
                subtitleUrl={activeLesson.subtitle_url ?? undefined}
              />
            ) : activeLesson?.content_html ? (
              <div className="w-full h-full overflow-y-auto bg-slate-950 px-6 py-8">
                <article className="prose prose-invert mx-auto max-w-2xl text-slate-200 [&_h1]:text-white [&_h2]:text-white [&_a]:text-academy-gold" dangerouslySetInnerHTML={{ __html: activeLesson.content_html }} />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
                {activeLesson ? 'Conteúdo não disponível ainda.' : 'Selecione uma aula na lista →'}
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
            {(activeLesson?.summary || (activeLesson?.attachments?.length ?? 0) > 0) && (
              <div className="mt-3 border-t border-white/5 pt-3 space-y-3">
                {activeLesson?.summary && (
                  <p className="text-sm leading-relaxed text-slate-300">{activeLesson.summary}</p>
                )}
                {(activeLesson?.attachments?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Materiais</p>
                    <div className="flex flex-wrap gap-2">
                      {activeLesson!.attachments!.map(att => (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 hover:border-white/30 transition-colors">
                          <span>⬇</span> {decodeURIComponent(att.url.split('/').pop()?.split('?')[0] ?? 'Material')}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes panel */}
            {activeLesson && (
              <div className="mt-3 border-t border-white/5 pt-3">
                <button
                  onClick={() => setNotesOpen(o => !o)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    📝 Minhas anotações
                  </span>
                  <span className="flex items-center gap-2">
                    {notesOpen && notesLoaded && (
                      <span className="text-[10px] text-slate-500">
                        {notesSaving ? 'Salvando…' : 'Salvo ✓'}
                      </span>
                    )}
                    <span className="text-slate-600 text-xs">{notesOpen ? '▲' : '▼'}</span>
                  </span>
                </button>
                {notesOpen && (
                  <div className="mt-2">
                    {notesLoaded ? (
                      <textarea
                        value={notes}
                        onChange={e => handleNotesChange(e.target.value)}
                        placeholder="Escreva suas anotações desta aula…"
                        className="bg-slate-800 border border-white/10 rounded-lg text-sm text-slate-200 p-3 w-full min-h-[80px] outline-none focus:border-academy-gold"
                      />
                    ) : (
                      <div className="h-[80px] rounded-lg bg-slate-800/50 animate-pulse" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Comments panel */}
            {activeLesson && (
              <div className="mt-3 border-t border-white/5 pt-3">
                <button
                  onClick={() => setCommentsOpen(o => !o)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    💬 Comentários e dúvidas ({comments.length})
                  </span>
                  <span className="text-slate-600 text-xs">{commentsOpen ? '▲' : '▼'}</span>
                </button>
                {commentsOpen && (
                  <div className="mt-3 space-y-4 bg-slate-800/60 rounded-lg p-3">
                    {/* Composer */}
                    <div className="space-y-2">
                      {replyTo && (
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Respondendo…</span>
                          <button
                            onClick={() => setReplyTo(null)}
                            className="text-slate-500 hover:text-white"
                            title="Cancelar resposta"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <textarea
                        value={commentBody}
                        onChange={e => setCommentBody(e.target.value)}
                        placeholder={replyTo ? 'Escreva sua resposta…' : 'Escreva um comentário ou tire uma dúvida…'}
                        className="bg-slate-800 border border-white/10 rounded-lg p-3 text-sm text-slate-200 w-full min-h-[70px] outline-none focus:border-academy-gold"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={submitComment}
                          disabled={posting || !commentBody.trim()}
                          className="bg-academy-gold text-white rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
                        >
                          {posting ? 'Enviando…' : 'Comentar'}
                        </button>
                      </div>
                    </div>

                    {/* Thread */}
                    {comments.length === 0 ? (
                      <p className="text-xs text-slate-500">Seja o primeiro a comentar nesta aula.</p>
                    ) : (
                      <ul className="space-y-4">
                        {comments.filter(c => c.parent_id === null).map(comment => {
                          const replies = comments.filter(r => r.parent_id === comment.id)
                          return (
                            <li key={comment.id} className="space-y-2">
                              <div className="text-sm text-slate-200">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-semibold text-white">{comment.author_name ?? 'Aluno'}</span>
                                  <span className="text-[10px] text-slate-500">
                                    {new Date(comment.created_at).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                <p className="whitespace-pre-line text-slate-300 mt-0.5">{comment.body}</p>
                                <button
                                  onClick={() => setReplyTo(comment.id)}
                                  className="text-[11px] text-academy-gold hover:underline mt-1"
                                >
                                  Responder
                                </button>
                              </div>
                              {replies.length > 0 && (
                                <ul className="ml-8 border-l border-white/10 pl-3 space-y-3">
                                  {replies.map(reply => (
                                    <li key={reply.id} className="text-sm text-slate-200">
                                      <div className="flex items-baseline gap-2">
                                        <span className="font-semibold text-white">{reply.author_name ?? 'Aluno'}</span>
                                        <span className="text-[10px] text-slate-500">
                                          {new Date(reply.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                      </div>
                                      <p className="whitespace-pre-line text-slate-300 mt-0.5">{reply.body}</p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
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
