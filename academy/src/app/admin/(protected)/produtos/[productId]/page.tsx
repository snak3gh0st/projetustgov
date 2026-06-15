'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Lesson = { id: string; slug: string; title: string; position: number; lesson_type: string; duration_seconds: number | null; status: string }
type Module = { id: string; slug: string; title: string; position: number; status: string; lesson_count: number; lessons?: Lesson[] }
type Product = { id: string; slug: string; title: string; subtitle: string | null; status: string; visibility: string; default_price_cents: number | null; cover_image_url: string | null; modules: Module[] | null }

const STATUS_OPTIONS = ['draft', 'published', 'archived']
const VIS_OPTIONS = ['private', 'unlisted', 'public']

export default function AdminProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [moduleForm, setModuleForm] = useState({ slug: '', title: '', position: '0' })
  const [lessonForms, setLessonForms] = useState<Record<string, { slug: string; title: string; position: string; lesson_type: string }>>({})
  const [showLessonForm, setShowLessonForm] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverSaving, setCoverSaving] = useState(false)
  const [coverError, setCoverError] = useState('')

  useEffect(() => {
    fetch(`/api/admin/products/${productId}`)
      .then(r => r.json())
      .then(d => { setProduct(d.data); setCoverUrl(d.data?.cover_image_url ?? ''); setLoading(false) })
  }, [productId])

  async function updateStatus(status: string) {
    setSaving(true)
    await fetch(`/api/admin/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setProduct(p => p ? { ...p, status } : p)
    setSaving(false)
  }

  async function updateModuleStatus(moduleId: string, status: string) {
    setSaving(true)
    await fetch(`/api/admin/modules/${moduleId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setProduct(p => p ? {
      ...p,
      modules: (p.modules ?? []).map(m => m.id === moduleId ? { ...m, status } : m),
    } : p)
    setSaving(false)
  }

  async function updateLessonStatus(moduleId: string, lessonId: string, status: string) {
    setSaving(true)
    await fetch(`/api/admin/lessons/${lessonId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setProduct(p => p ? {
      ...p,
      modules: (p.modules ?? []).map(m => m.id === moduleId ? {
        ...m,
        lessons: (m.lessons ?? []).map(l => l.id === lessonId ? { ...l, status } : l),
      } : m),
    } : p)
    setSaving(false)
  }

  async function createModule(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/admin/products/${productId}/modules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...moduleForm, position: parseInt(moduleForm.position) }),
    })
    const d = await res.json()
    if (!res.ok) return
    setProduct(p => p ? { ...p, modules: [...(p.modules ?? []), { ...d.data, lesson_count: 0 }] } : p)
    setShowModuleForm(false)
    setModuleForm({ slug: '', title: '', position: '0' })
  }

  async function createLesson(moduleId: string, e: React.FormEvent) {
    e.preventDefault()
    const f = lessonForms[moduleId]
    if (!f) return
    const res = await fetch(`/api/admin/modules/${moduleId}/lessons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, position: parseInt(f.position) }),
    })
    const d = await res.json()
    if (!res.ok) return
    setProduct(p => {
      if (!p) return p
      return {
        ...p,
        modules: (p.modules ?? []).map(m =>
          m.id === moduleId ? { ...m, lesson_count: m.lesson_count + 1, lessons: [...(m.lessons ?? []), d.data] } : m
        ),
      }
    })
    setShowLessonForm(null)
    setLessonForms(f => ({ ...f, [moduleId]: { slug: '', title: '', position: '0', lesson_type: 'video' } }))
  }

  async function saveCoverImage() {
    setCoverSaving(true)
    setCoverError('')
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_image_url: coverUrl || null }),
    })
    if (!res.ok) {
      setCoverError('Erro ao salvar. Tente novamente.')
    } else {
      setProduct(p => p ? { ...p, cover_image_url: coverUrl || null } : p)
    }
    setCoverSaving(false)
  }

  if (loading) return <div className="text-slate-400">Carregando…</div>
  if (!product) return <div className="text-red-400">Produto não encontrado</div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/produtos" className="text-sm text-slate-400 hover:text-white">← Produtos</Link>
        <span className="text-slate-600">/</span>
        <h1 className="text-lg font-semibold text-white">{product.title}</h1>
      </div>

      <div className="mb-6 rounded-xl bg-slate-800 p-5">
        <p className="mb-3 text-xs text-slate-400">Imagem de capa</p>
        <div className="flex gap-5">
          <div className="w-40 shrink-0">
            {product.cover_image_url ? (
              <img
                src={product.cover_image_url}
                alt="Capa do produto"
                className="aspect-video w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-700 text-xs text-slate-500">
                Sem imagem
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs text-slate-400">URL da imagem</label>
            <input
              type="text"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={saveCoverImage}
                disabled={coverSaving}
                className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {coverSaving ? 'Salvando…' : 'Salvar imagem'}
              </button>
              {coverError && <p className="text-xs text-red-400">{coverError}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-3 rounded-xl bg-slate-800 p-5">
        <div className="flex-1">
          <p className="text-xs text-slate-400">Slug</p>
          <p className="text-sm text-slate-200">{product.slug}</p>
        </div>
        <div className="flex-1">
          <p className="text-xs text-slate-400">Preço</p>
          <p className="text-sm text-slate-200">
            {product.default_price_cents ? `R$ ${(product.default_price_cents / 100).toFixed(2)}` : '—'}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-400">Status</p>
          <select value={product.status} onChange={e => updateStatus(e.target.value)} disabled={saving}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-400">Visibilidade</p>
          <select value={product.visibility} onChange={async e => {
            setSaving(true)
            await fetch(`/api/admin/products/${productId}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visibility: e.target.value }),
            })
            setProduct(p => p ? { ...p, visibility: e.target.value } : p)
            setSaving(false)
          }} disabled={saving}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-academy-gold"
          >
            {VIS_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-white">Módulos</h2>
        <button onClick={() => setShowModuleForm(v => !v)}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
        >
          + Módulo
        </button>
      </div>

      {showModuleForm && (
        <form onSubmit={createModule} className="mb-4 rounded-xl bg-slate-800 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-400">Título</label>
              <input required value={moduleForm.title} onChange={e => setModuleForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Slug</label>
              <input required value={moduleForm.slug} onChange={e => setModuleForm(f => ({ ...f, slug: e.target.value }))}
                className="w-full rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-3">
            <button type="submit" className="rounded-lg bg-academy-gold px-3 py-1.5 text-xs font-semibold text-white">Criar</button>
            <button type="button" onClick={() => setShowModuleForm(false)} className="text-xs text-slate-400">Cancelar</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {(product.modules ?? []).map(mod => (
          <div key={mod.id} className="rounded-xl border border-slate-700 bg-slate-800">
            <button
              onClick={() => setExpandedModule(v => v === mod.id ? null : mod.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <span className="font-medium text-white">{mod.title}</span>
                <span className="ml-3 text-xs text-slate-400">{mod.lesson_count} aula(s)</span>
                <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{mod.status}</span>
              </div>
              <span className="text-slate-400">{expandedModule === mod.id ? '▲' : '▼'}</span>
            </button>

            {expandedModule === mod.id && (
              <div className="border-t border-slate-700 px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <select
                    value={mod.status}
                    onChange={e => updateModuleStatus(mod.id, e.target.value)}
                    disabled={saving}
                    className="rounded bg-slate-700 px-2 py-1 text-xs text-white outline-none"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => setShowLessonForm(v => v === mod.id ? null : mod.id)}
                    className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                  >
                    + Aula
                  </button>
                </div>

                {showLessonForm === mod.id && (
                  <form onSubmit={e => createLesson(mod.id, e)} className="mb-3 rounded-lg bg-slate-700 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Título</label>
                        <input required
                          value={lessonForms[mod.id]?.title ?? ''}
                          onChange={e => setLessonForms(f => ({ ...f, [mod.id]: { ...f[mod.id] ?? { slug: '', position: '0', lesson_type: 'video' }, title: e.target.value } }))}
                          className="w-full rounded bg-slate-600 px-2 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">Slug</label>
                        <input required
                          value={lessonForms[mod.id]?.slug ?? ''}
                          onChange={e => setLessonForms(f => ({ ...f, [mod.id]: { ...f[mod.id] ?? { title: '', position: '0', lesson_type: 'video' }, slug: e.target.value } }))}
                          className="w-full rounded bg-slate-600 px-2 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="submit" className="rounded bg-academy-gold px-2 py-1 text-xs font-semibold text-white">Criar</button>
                      <button type="button" onClick={() => setShowLessonForm(null)} className="text-xs text-slate-400">Cancelar</button>
                    </div>
                  </form>
                )}

                {(mod.lessons ?? []).length === 0 && (
                  <p className="text-xs text-slate-500">Nenhuma aula</p>
                )}
                <ul className="space-y-1">
                  {(mod.lessons ?? []).map(l => (
                    <li key={l.id} className="flex items-center justify-between rounded-lg bg-slate-700 px-3 py-2">
                      <div>
                        <span className="text-sm text-slate-200">{l.title}</span>
                        <span className="ml-2 text-xs text-slate-500">{l.lesson_type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={l.status}
                          onChange={e => updateLessonStatus(mod.id, l.id, e.target.value)}
                          disabled={saving}
                          className="rounded bg-slate-600 px-2 py-1 text-xs text-white outline-none"
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {l.lesson_type === 'video' && !l.duration_seconds && (
                          <Link href={`/admin/aulas/${l.id}/video`} className="text-xs text-academy-gold hover:underline">
                            Upload vídeo
                          </Link>
                        )}
                        {l.duration_seconds && (
                          <span className="text-xs text-green-400">✓ {Math.round(l.duration_seconds / 60)}min</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {(product.modules ?? []).length === 0 && (
          <p className="text-sm text-slate-500">Nenhum módulo ainda. Crie o primeiro acima.</p>
        )}
      </div>
    </div>
  )
}
