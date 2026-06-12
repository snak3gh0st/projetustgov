import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const [products, learners, enrollments, commissions] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::text FROM education_products WHERE status = $1', ['published']),
    query<{ count: string }>('SELECT COUNT(*)::text FROM learners WHERE status = $1', ['active']),
    query<{ count: string }>('SELECT COUNT(*)::text FROM education_enrollments WHERE status = $1', ['active']),
    query<{ total: string }>('SELECT COALESCE(SUM(commission_cents),0)::text AS total FROM affiliate_commissions WHERE status = $1', ['pending']),
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
    </div>
  )
}
