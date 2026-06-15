'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Lesson = { id: string }
type Module = { id: string; lessons: Lesson[] | null }
type Course = { id: string; slug: string; title: string; modules: Module[] | null }

type ProgressEntry = { status: string; position: number | null }
type Progress = Record<string, ProgressEntry>

type Learner = { id?: string; email?: string; name?: string }

export default function CertificatePage() {
  const { slug } = useParams<{ slug: string }>()

  const [course, setCourse] = useState<Course | null>(null)
  const [progress, setProgress] = useState<Progress>({})
  const [learner, setLearner] = useState<Learner | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/area/courses/${slug}`).then(r => r.json()).catch(() => null),
      fetch('/api/area/progress').then(r => r.json()).catch(() => null),
      fetch('/api/auth/learner/me').then(r => r.json()).catch(() => null),
    ]).then(([c, p, m]) => {
      if (c?.data) setCourse(c.data)
      if (p?.data) setProgress(p.data)
      if (m?.data) setLearner(m.data)
      setLoading(false)
    })
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-academy-gold border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white p-6">
        <p className="text-red-400 mb-4">Curso não encontrado ou sem acesso.</p>
        <Link href="/area" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← Voltar aos cursos
        </Link>
      </div>
    )
  }

  const allLessons = (course.modules ?? []).flatMap(m => m.lessons ?? [])
  const totalCount = allLessons.length
  const doneCount = allLessons.filter(l => progress[l.id]?.status === 'completed').length
  const isComplete = totalCount > 0 && doneCount === totalCount

  if (!isComplete) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white p-6 text-center">
        <p className="text-4xl mb-4">🏆</p>
        <p className="text-lg font-medium text-slate-200 mb-2">
          Conclua todas as aulas para emitir seu certificado.
        </p>
        <p className="text-sm text-slate-500 mb-6">
          {doneCount} de {totalCount} aulas concluídas.
        </p>
        <Link
          href={`/area/${slug}`}
          className="text-sm text-academy-gold hover:opacity-80 transition-opacity"
        >
          ← Voltar ao curso
        </Link>
      </div>
    )
  }

  const learnerName = learner?.name?.trim() || learner?.email || 'Aluno(a)'
  const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-zinc-950 print:bg-white flex flex-col items-center justify-center p-6">
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body { background: #fff !important; }
        }
      `}</style>

      {/* Certificate */}
      <div className="w-full max-w-4xl aspect-[1.414/1] bg-[#fdfbf4] text-zinc-900 shadow-2xl print:shadow-none relative overflow-hidden">
        {/* Outer gold frame */}
        <div className="absolute inset-3 sm:inset-5 border-2 border-academy-gold" />
        {/* Inner thin frame */}
        <div className="absolute inset-5 sm:inset-8 border border-academy-gold/40" />

        {/* Corner flourishes */}
        <div className="absolute top-5 left-5 sm:top-8 sm:left-8 w-8 h-8 border-t-2 border-l-2 border-academy-gold" />
        <div className="absolute top-5 right-5 sm:top-8 sm:right-8 w-8 h-8 border-t-2 border-r-2 border-academy-gold" />
        <div className="absolute bottom-5 left-5 sm:bottom-8 sm:left-8 w-8 h-8 border-b-2 border-l-2 border-academy-gold" />
        <div className="absolute bottom-5 right-5 sm:bottom-8 sm:right-8 w-8 h-8 border-b-2 border-r-2 border-academy-gold" />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-8 sm:px-16 py-8">
          {/* Wordmark */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs sm:text-sm font-bold tracking-[0.3em] text-academy-gold">PROJETUS</span>
            <span className="text-xs sm:text-sm tracking-[0.2em] text-zinc-500">ACADEMY</span>
          </div>

          <p className="mt-4 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.4em] text-zinc-400">
            Certificado de Conclusão
          </p>

          <div className="mt-6 sm:mt-8 mb-1 text-xs sm:text-sm text-zinc-500">
            Certificamos que
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-bold text-zinc-900 leading-tight px-4">
            {learnerName}
          </h1>

          <div className="mt-3 h-px w-32 sm:w-48 bg-academy-gold/60" />

          <p className="mt-5 sm:mt-6 text-sm sm:text-base text-zinc-600">
            concluiu com êxito o curso
          </p>

          <h2 className="mt-2 font-serif text-xl sm:text-3xl font-bold text-academy-gold leading-snug px-4 max-w-2xl">
            {course.title}
          </h2>

          <p className="mt-6 sm:mt-8 text-xs sm:text-sm text-zinc-500">{today}</p>

          {/* Seal */}
          <div className="mt-6 sm:mt-8 relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-academy-gold flex items-center justify-center bg-academy-gold/5">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-academy-gold/50 flex flex-col items-center justify-center">
                <span className="text-[7px] sm:text-[8px] font-bold tracking-widest text-academy-gold leading-none">PROJETUS</span>
                <span className="text-[6px] sm:text-[7px] tracking-widest text-zinc-500 leading-none mt-0.5">ACADEMY</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls (hidden on print) */}
      <div className="print:hidden mt-8 flex items-center gap-4">
        <Link
          href={`/area/${slug}`}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Voltar ao curso
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-academy-gold px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>
    </div>
  )
}
