'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type PublicCourse = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  cover_image_url: string | null
  product_type: string
  default_price_cents: number | null
  lesson_count: number
}

function priceLabel(cents: number | null) {
  if (!cents || cents <= 0) return 'Gratuito'
  return `R$ ${(cents / 100).toFixed(2)}`
}

export default function CourseCatalog() {
  const [courses, setCourses] = useState<PublicCourse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/public/courses')
      .then(r => r.json())
      .then(d => setCourses(d.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section id="catalogo" className="bg-zinc-950 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-academy-gold">Nossa biblioteca</p>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Cursos disponíveis</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/50">
            Explore as formações abertas para matrícula e comece a estudar hoje mesmo.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className="text-center text-sm text-white/40">Em breve, novos cursos.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(course => (
              <div
                key={course.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/25 transition duration-300 hover:-translate-y-1 hover:border-academy-gold/60"
              >
                <div className="aspect-[16/9] bg-zinc-800">
                  {course.cover_image_url ? (
                    <img
                      src={course.cover_image_url}
                      alt={course.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_10%,rgba(184,137,23,0.28),transparent_32%),linear-gradient(135deg,#111827,#020617)]">
                      <span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Capte Recursos</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-academy-gold">
                    {course.product_type}
                  </p>
                  <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-white">
                    {course.title}
                  </h3>
                  {course.subtitle && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/45">{course.subtitle}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                    <span>{course.lesson_count} aula{course.lesson_count === 1 ? '' : 's'}</span>
                    <span className="text-sm font-semibold text-white/80">{priceLabel(course.default_price_cents)}</span>
                  </div>

                  <Link
                    href={
                      course.default_price_cents && course.default_price_cents > 0
                        ? `/checkout/${course.slug}`
                        : '/login'
                    }
                    className="mt-5 rounded-md bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-academy-gold hover:text-white"
                  >
                    {course.default_price_cents && course.default_price_cents > 0 ? 'Comprar' : 'Acessar'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
