'use client'

import { useEffect, useState } from 'react'

type Affiliate = {
  id: string; code: string; name: string; email: string | null
  commission_rate: number; status: string; commission_count: number
  pending_cents: number; paid_cents: number
}

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', email: '', commission_rate: '10' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/affiliates').then(r => r.json()).then(d => { setAffiliates(d.data ?? []); setLoading(false) })
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, commission_rate: parseFloat(form.commission_rate), email: form.email || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setError(JSON.stringify(d.error)); return }
      setAffiliates(prev => [{ ...d.data, commission_count: 0, pending_cents: 0, paid_cents: 0 }, ...prev])
      setShowForm(false)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Afiliados</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Novo afiliado
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 rounded-xl bg-slate-800 p-5">
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Nome</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Código de afiliado</label>
              <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white font-mono outline-none"
                placeholder="EX: JOAO2025"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">E-mail (opcional)</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Comissão (%)</label>
              <input type="number" step="0.01" min="0" max="100" required value={form.commission_rate}
                onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Criar afiliado'}
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Afiliado</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Comissão</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Pendente</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Pago</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {affiliates.map(a => (
                <tr key={a.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{a.name}</p>
                    {a.email && <p className="text-xs text-slate-400">{a.email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-academy-gold">{a.code}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.commission_rate}%</td>
                  <td className="px-4 py-3 text-yellow-300">R$ {(a.pending_cents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-green-300">R$ {(a.paid_cents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-300">{a.commission_count}</td>
                </tr>
              ))}
              {affiliates.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum afiliado ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
