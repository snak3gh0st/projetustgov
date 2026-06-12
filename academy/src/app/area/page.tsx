'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Course = {
  id: string; slug: string; title: string; subtitle: string | null
  cover_image_url: string | null; product_type: string
  enrollment_status: string; enrolled_at: string; lesson_count: number
}

export default function AreaPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/area/courses').then(r => r.json()).then(d => { setCourses(d.data ?? []); setLoading(false) })
  }, [])

  if (loading) return <p className="text-slate-400">Carregando seus cursos…</p>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-academy-ink">Meus cursos</h1>
      {courses.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p className="text-slate-500">Você ainda não tem nenhum curso.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(c => (
            <Link key={c.id} href={`/area/${c.slug}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-academy-blue hover:shadow-sm transition-all"
            >
              {c.cover_image_url ? (
                <img src={c.cover_image_url} alt={c.title} className="mb-4 h-36 w-full rounded-lg object-cover" />
              ) : (
                <div className="mb-4 flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-4xl">
                  📚
                </div>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-academy-blue">{c.product_type}</p>
              <h2 className="mt-1 font-semibold text-academy-ink group-hover:text-academy-blue">{c.title}</h2>
              {c.subtitle && <p className="mt-1 text-sm text-slate-500">{c.subtitle}</p>}
              <p className="mt-3 text-xs text-slate-400">{c.lesson_count} aulas</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
