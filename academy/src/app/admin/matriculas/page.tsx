'use client'

import { useEffect, useState } from 'react'

type Enrollment = {
  id: string; learner_email: string; learner_name: string | null
  product_title: string; product_slug: string; status: string; created_at: string
}
type Product = { id: string; title: string }

export default function AdminEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ learner_email: '', product_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/enrollments').then(r => r.json()),
      fetch('/api/admin/products').then(r => r.json()),
    ]).then(([e, p]) => {
      setEnrollments(e.data ?? [])
      setProducts(p.data ?? [])
      setLoading(false)
    })
  }, [])

  async function enroll(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/enrollments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erro'); return }
      setEnrollments(prev => [{ ...d.data, product_title: products.find(p => p.id === form.product_id)?.title ?? '' }, ...prev])
      setShowForm(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Matrículas</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Matricular aluno
        </button>
      </div>

      {showForm && (
        <form onSubmit={enroll} className="mb-6 rounded-xl bg-slate-800 p-5">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">E-mail do aluno</label>
              <input type="email" required value={form.learner_email} onChange={e => setForm(f => ({ ...f, learner_email: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-slate-400">Produto</label>
              <select required value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="">Selecione…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Matricular'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-400">Cancelar</button>
          </div>
        </form>
      )}

      {loading ? <p className="text-slate-400">Carregando…</p> : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Aluno</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {enrollments.map(e => (
                <tr key={e.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="text-white">{e.learner_name ?? e.learner_email}</p>
                    <p className="text-xs text-slate-400">{e.learner_email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{e.product_title}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${e.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
              {enrollments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Nenhuma matrícula ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
