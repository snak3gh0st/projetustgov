'use client'

import { useEffect, useState } from 'react'

type Learner = { id: string; email: string; name: string | null; status: string; created_at: string; last_login_at: string | null; enrollment_count: number }

export default function AdminLearnersPage() {
  const [learners, setLearners] = useState<Learner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/learners').then(r => r.json()).then(d => { setLearners(d.data ?? []); setLoading(false) })
  }, [])

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">Alunos</h1>
      {loading ? <p className="text-slate-400">Carregando…</p> : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Aluno</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Matrículas</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Cadastro</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Último login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {learners.map(l => (
                <tr key={l.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{l.name ?? '—'}</p>
                    <p className="text-xs text-slate-400">{l.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{l.enrollment_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {l.last_login_at ? new Date(l.last_login_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
              {learners.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum aluno ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
