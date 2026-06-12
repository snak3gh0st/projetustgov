'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Product = {
  id: string; slug: string; title: string; status: string
  default_price_cents: number | null; module_count: number; enrollment_count: number
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  published: 'bg-green-900/60 text-green-300',
  archived: 'bg-red-900/40 text-red-300',
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', title: '', product_type: 'course', default_price_cents: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/products').then(r => r.json()).then(d => { setProducts(d.data ?? []); setLoading(false) })
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          default_price_cents: form.default_price_cents ? parseInt(form.default_price_cents) : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(JSON.stringify(d.error)); return }
      setProducts(prev => [d.data, ...prev])
      setShowForm(false)
      setForm({ slug: '', title: '', product_type: 'course', default_price_cents: '' })
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Produtos</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Novo produto
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 rounded-xl bg-slate-800 p-6">
          <h2 className="mb-4 font-semibold text-white">Novo produto</h2>
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Título</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Slug (URL)</label>
              <input required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tipo</label>
              <select value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
              >
                <option value="course">Curso</option>
                <option value="mentorship">Mentoria</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Preço (centavos, ex: 49700 = R$497)</label>
              <input type="number" value={form.default_price_cents} onChange={e => setForm(f => ({ ...f, default_price_cents: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Criar produto'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Carregando…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Preço</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Módulos</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Alunos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{p.title}</p>
                    <p className="text-xs text-slate-500">{p.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] ?? ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {p.default_price_cents ? `R$ ${(p.default_price_cents / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{p.module_count}</td>
                  <td className="px-4 py-3 text-slate-300">{p.enrollment_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/produtos/${p.id}`}
                      className="text-xs text-academy-gold hover:underline"
                    >
                      Gerenciar →
                    </Link>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum produto ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
