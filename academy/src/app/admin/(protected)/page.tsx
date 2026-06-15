import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

type CompletionRow = { title: string; lessons: number; students: number; completions: number }
type TopLessonRow = { title: string; course: string; views: number }
type RecentEnrollmentRow = { learner_email: string; course: string; enrolled_at: string | Date }

export default async function AdminDashboard() {
  const [products, learners, enrollments, commissions, completion, topLessons, recentEnrollments] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::text FROM education_products WHERE status = $1', ['published']),
    query<{ count: string }>('SELECT COUNT(*)::text FROM learners WHERE status = $1', ['active']),
    query<{ count: string }>('SELECT COUNT(*)::text FROM education_enrollments WHERE status = $1', ['active']),
    query<{ total: string }>('SELECT COALESCE(SUM(commission_cents),0)::text AS total FROM affiliate_commissions WHERE status = $1', ['pending']),
    query<CompletionRow>(`
      SELECT p.title,
        (SELECT COUNT(*) FROM education_lessons l WHERE l.product_id = p.id AND l.status = 'published')::int AS lessons,
        (SELECT COUNT(*) FROM education_enrollments e WHERE e.product_id = p.id AND e.status = 'active')::int AS students,
        (SELECT COUNT(*) FROM education_progress pr
           JOIN education_enrollments e ON e.id = pr.enrollment_id
           JOIN education_lessons l ON l.id = pr.lesson_id
           WHERE e.product_id = p.id AND e.status = 'active' AND pr.status = 'completed' AND l.status = 'published')::int AS completions
      FROM education_products p
      WHERE p.status = 'published'
      ORDER BY students DESC
    `),
    query<TopLessonRow>(`
      SELECT l.title, p.title AS course, COUNT(*)::int AS views
      FROM education_progress pr
      JOIN education_lessons l ON l.id = pr.lesson_id
      JOIN education_products p ON p.id = l.product_id
      WHERE pr.status IN ('in_progress','completed')
      GROUP BY l.id, l.title, p.title
      ORDER BY views DESC
      LIMIT 8
    `),
    query<RecentEnrollmentRow>(`
      SELECT e.learner_email, p.title AS course, e.enrolled_at
      FROM education_enrollments e
      JOIN education_products p ON p.id = e.product_id
      ORDER BY e.enrolled_at DESC
      LIMIT 8
    `),
  ])

  const stats = [
    { label: 'Produtos publicados', value: products[0]?.count ?? '0' },
    { label: 'Alunos ativos', value: learners[0]?.count ?? '0' },
    { label: 'Matrículas ativas', value: enrollments[0]?.count ?? '0' },
    { label: 'Comissões pendentes', value: `R$ ${((parseInt(commissions[0]?.total ?? '0')) / 100).toFixed(2)}` },
  ]

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl bg-slate-800 p-5">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Section 1: Conclusão por curso */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Conclusão por curso</h2>
      <div className="overflow-hidden rounded-xl border border-slate-700">
        {completion.length === 0 ? (
          <p className="bg-slate-800 p-5 text-sm text-slate-400">Nenhum curso publicado</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-left text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Curso</th>
                <th className="px-4 py-3 font-medium">Alunos</th>
                <th className="px-4 py-3 font-medium">Aulas</th>
                <th className="px-4 py-3 font-medium">Conclusão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {completion.map(c => {
                const denom = c.students * c.lessons
                const pct = denom > 0 ? Math.round((c.completions / denom) * 100) : 0
                return (
                  <tr key={c.title} className="bg-slate-800/50">
                    <td className="px-4 py-3 text-white">{c.title}</td>
                    <td className="px-4 py-3 text-slate-400">{c.students}</td>
                    <td className="px-4 py-3 text-slate-400">{c.lessons}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
                          <div className="h-full rounded-full bg-academy-gold" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-white">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 2: Aulas mais assistidas */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Aulas mais assistidas</h2>
      <div className="overflow-hidden rounded-xl border border-slate-700">
        {topLessons.length === 0 ? (
          <p className="bg-slate-800 p-5 text-sm text-slate-400">Nenhuma aula assistida ainda</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-left text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Aula</th>
                <th className="px-4 py-3 font-medium">Curso</th>
                <th className="px-4 py-3 text-right font-medium">Visualizações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {topLessons.map((l, i) => (
                <tr key={`${l.title}-${i}`} className="bg-slate-800/50">
                  <td className="px-4 py-3 text-white">{l.title}</td>
                  <td className="px-4 py-3 text-slate-400">{l.course}</td>
                  <td className="px-4 py-3 text-right text-white">{l.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 3: Matrículas recentes */}
      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Matrículas recentes</h2>
      <div className="overflow-hidden rounded-xl border border-slate-700">
        {recentEnrollments.length === 0 ? (
          <p className="bg-slate-800 p-5 text-sm text-slate-400">Nenhuma matrícula recente</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-left text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Aluno</th>
                <th className="px-4 py-3 font-medium">Curso</th>
                <th className="px-4 py-3 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {recentEnrollments.map((e, i) => (
                <tr key={`${e.learner_email}-${i}`} className="bg-slate-800/50">
                  <td className="px-4 py-3 text-white">{e.learner_email}</td>
                  <td className="px-4 py-3 text-slate-400">{e.course}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {new Date(e.enrolled_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
