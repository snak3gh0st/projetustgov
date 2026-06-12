'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), { ssr: false })

type Lesson = {
  id: string; slug: string; title: string; position: number
  content_type: string; duration_seconds: number | null
  video_id: string | null; playback_url: string | null; is_preview: boolean
}
type Module = { id: string; slug: string; title: string; position: number; lessons: Lesson[] | null }
type Course = {
  id: string; slug: string; title: string; subtitle: string | null
  cover_image_url: string | null; modules: Module[] | null
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)

  useEffect(() => {
    fetch(`/api/area/courses/${slug}`)
      .then(r => r.json())
      .then(d => {
        setCourse(d.data)
        const firstLesson = d.data?.modules?.[0]?.lessons?.[0]
        if (firstLesson) setActiveLesson(firstLesson)
        setLoading(false)
      })
  }, [slug])

  if (loading) return <p className="text-slate-400">Carregando curso…</p>
  if (!course) return <p className="text-red-400">Curso não encontrado ou sem acesso.</p>

  const allLessons = (course.modules ?? []).flatMap(m => m.lessons ?? [])

  return (
    <div className="flex gap-6">
      {/* Video + info */}
      <div className="flex-1 min-w-0">
        {activeLesson ? (
          <>
            {activeLesson.content_type === 'video' && activeLesson.video_id ? (
              <VideoPlayer videoId={activeLesson.video_id} title={activeLesson.title} />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                Conteúdo em texto
              </div>
            )}
            <h2 className="mt-4 text-lg font-semibold text-academy-ink">{activeLesson.title}</h2>
          </>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            Selecione uma aula
          </div>
        )}
        <h1 className="mt-6 text-xl font-bold text-academy-ink">{course.title}</h1>
        {course.subtitle && <p className="mt-1 text-slate-500">{course.subtitle}</p>}
      </div>

      {/* Curriculum sidebar */}
      <aside className="w-72 flex-shrink-0">
        <h3 className="mb-3 font-semibold text-academy-ink">Conteúdo do curso</h3>
        <div className="space-y-3">
          {(course.modules ?? []).map(mod => (
            <div key={mod.id}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{mod.title}</p>
              <ul className="space-y-0.5">
                {(mod.lessons ?? []).map(lesson => (
                  <li key={lesson.id}>
                    <button
                      onClick={() => setActiveLesson(lesson)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                        activeLesson?.id === lesson.id
                          ? 'bg-academy-blue text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="shrink-0">
                        {lesson.content_type === 'video' ? '▶' : '📄'}
                      </span>
                      <span className="flex-1 truncate">{lesson.title}</span>
                      {lesson.duration_seconds && (
                        <span className={`shrink-0 text-xs ${activeLesson?.id === lesson.id ? 'text-blue-200' : 'text-slate-400'}`}>
                          {fmtDuration(lesson.duration_seconds)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
