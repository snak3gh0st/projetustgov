'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Lesson = { id: string; slug: string; title: string; position: number; lesson_type: string; duration_seconds: number | null; status: string; summary?: string | null; content_html?: string | null }
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
  const [uploadingCover, setUploadingCover] = useState(false)
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [lessonEditForms, setLessonEditForms] = useState<Record<string, { title: string; summary: string; content_html: string }>>({})
  const [materialForms, setMaterialForms] = useState<Record<string, string>>({})
  const [materialDone, setMaterialDone] = useState<Record<string, boolean>>({})

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

  async function uploadCover(file: File) {
    setUploadingCover(true)
    setCoverError('')
    try {
      const pres = await fetch('/api/admin/images/presigned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      }).then(r => r.json())
      if (!pres.data) throw new Error('presign failed')
      await fetch(pres.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image_url: pres.data.publicUrl }),
      })
      setCoverUrl(pres.data.publicUrl)
      setProduct(p => p ? { ...p, cover_image_url: pres.data.publicUrl } : p)
    } catch {
      setCoverError('Falha no upload')
    } finally {
      setUploadingCover(false)
    }
  }

  function startEditLesson(lesson: Lesson) {
    setLessonEditForms(f => ({
      ...f,
      [lesson.id]: {
        title: lesson.title ?? '',
        summary: lesson.summary ?? '',
        content_html: lesson.content_html ?? '',
      },
    }))
    setEditingLesson(v => v === lesson.id ? null : lesson.id)
  }

  async function saveLessonEdit(moduleId: string, lessonId: string) {
    const f = lessonEditForms[lessonId]
    if (!f) return
    setSaving(true)
    await fetch(`/api/admin/lessons/${lessonId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: f.title, summary: f.summary || null, content_html: f.content_html || null }),
    })
    setProduct(p => p ? {
      ...p,
      modules: (p.modules ?? []).map(m => m.id === moduleId ? {
        ...m,
        lessons: (m.lessons ?? []).map(l => l.id === lessonId
          ? { ...l, title: f.title, summary: f.summary || null, content_html: f.content_html || null }
          : l),
      } : m),
    } : p)
    setSaving(false)
    setEditingLesson(null)
  }

  async function swapModules(moduleId: string, dir: -1 | 1) {
    const mods = [...(product?.modules ?? [])]
    const idx = mods.findIndex(m => m.id === moduleId)
    const other = idx + dir
    if (other < 0 || other >= mods.length) return
    const a = mods[idx], b = mods[other]
    setSaving(true)
    await Promise.all([
      fetch(`/api/admin/modules/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: b.position }) }),
      fetch(`/api/admin/modules/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: a.position }) }),
    ])
    const swappedA = { ...a, position: b.position }
    const swappedB = { ...b, position: a.position }
    mods[idx] = swappedB
    mods[other] = swappedA
    setProduct(p => p ? { ...p, modules: mods } : p)
    setSaving(false)
  }

  async function swapLessons(moduleId: string, lessonId: string, dir: -1 | 1) {
    const mod = (product?.modules ?? []).find(m => m.id === moduleId)
    if (!mod) return
    const lessons = [...(mod.lessons ?? [])]
    const idx = lessons.findIndex(l => l.id === lessonId)
    const other = idx + dir
    if (other < 0 || other >= lessons.length) return
    const a = lessons[idx], b = lessons[other]
    setSaving(true)
    await Promise.all([
      fetch(`/api/admin/lessons/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: b.position }) }),
      fetch(`/api/admin/lessons/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: a.position }) }),
    ])
    lessons[idx] = { ...b, position: a.position }
    lessons[other] = { ...a, position: b.position }
    setProduct(p => p ? {
      ...p,
      modules: (p.modules ?? []).map(m => m.id === moduleId ? { ...m, lessons } : m),
    } : p)
    setSaving(false)
  }

  async function addMaterial(lessonId: string) {
    const url = materialForms[lessonId]
    if (!url) return
    const res = await fetch(`/api/admin/lessons/${lessonId}/materials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.ok) {
      setMaterialForms(f => ({ ...f, [lessonId]: '' }))
      setMaterialDone(d => ({ ...d, [lessonId]: true }))
      setTimeout(() => setMaterialDone(d => ({ ...d, [lessonId]: false })), 2500)
    }
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={saveCoverImage}
                disabled={coverSaving || uploadingCover}
                className="rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {coverSaving ? 'Salvando…' : 'Salvar imagem'}
              </button>
              <span className="text-xs text-slate-500">ou</span>
              <label className="cursor-pointer rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
                {uploadingCover ? 'Enviando…' : 'Enviar arquivo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingCover}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadCover(file)
                    e.target.value = ''
                  }}
                />
              </label>
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
        {(product.modules ?? []).map((mod, modIdx, modArr) => (
          <div key={mod.id} className="rounded-xl border border-slate-700 bg-slate-800">
            <div className="flex w-full items-center justify-between px-4 py-3">
              <button
                onClick={() => setExpandedModule(v => v === mod.id ? null : mod.id)}
                className="flex flex-1 items-center text-left"
              >
                <span className="font-medium text-white">{mod.title}</span>
                <span className="ml-3 text-xs text-slate-400">{mod.lesson_count} aula(s)</span>
                <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{mod.status}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => swapModules(mod.id, -1)}
                  disabled={saving || modIdx === 0}
                  className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                  title="Mover para cima"
                >▲</button>
                <button
                  onClick={() => swapModules(mod.id, 1)}
                  disabled={saving || modIdx === modArr.length - 1}
                  className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                  title="Mover para baixo"
                >▼</button>
                <button
                  onClick={() => setExpandedModule(v => v === mod.id ? null : mod.id)}
                  className="ml-1 text-slate-400"
                >{expandedModule === mod.id ? '▲' : '▼'}</button>
              </div>
            </div>

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
                  {(mod.lessons ?? []).map((l, lIdx, lArr) => (
                    <li key={l.id} className="rounded-lg bg-slate-700 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <div className="mr-1 flex flex-col">
                            <button
                              onClick={() => swapLessons(mod.id, l.id, -1)}
                              disabled={saving || lIdx === 0}
                              className="leading-none text-[10px] text-slate-400 hover:text-white disabled:opacity-30"
                              title="Mover para cima"
                            >▲</button>
                            <button
                              onClick={() => swapLessons(mod.id, l.id, 1)}
                              disabled={saving || lIdx === lArr.length - 1}
                              className="leading-none text-[10px] text-slate-400 hover:text-white disabled:opacity-30"
                              title="Mover para baixo"
                            >▼</button>
                          </div>
                          <span className="text-sm text-slate-200">{l.title}</span>
                          <span className="ml-2 text-xs text-slate-500">{l.lesson_type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditLesson(l)}
                            className="text-xs text-slate-300 hover:text-white"
                          >
                            {editingLesson === l.id ? 'Fechar' : 'Editar'}
                          </button>
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
                      </div>

                      {editingLesson === l.id && (
                        <div className="mt-3 space-y-2 border-t border-slate-600 pt-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Título</label>
                            <input
                              value={lessonEditForms[l.id]?.title ?? ''}
                              onChange={e => setLessonEditForms(f => ({ ...f, [l.id]: { ...f[l.id], title: e.target.value } }))}
                              className="w-full rounded bg-slate-600 px-2 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Resumo</label>
                            <textarea
                              rows={2}
                              value={lessonEditForms[l.id]?.summary ?? ''}
                              onChange={e => setLessonEditForms(f => ({ ...f, [l.id]: { ...f[l.id], summary: e.target.value } }))}
                              className="w-full rounded bg-slate-600 px-2 py-1.5 text-xs text-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Conteúdo (HTML)</label>
                            <textarea
                              rows={6}
                              value={lessonEditForms[l.id]?.content_html ?? ''}
                              onChange={e => setLessonEditForms(f => ({ ...f, [l.id]: { ...f[l.id], content_html: e.target.value } }))}
                              className="w-full rounded bg-slate-600 px-2 py-1.5 font-mono text-xs text-white outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveLessonEdit(mod.id, l.id)}
                              disabled={saving}
                              className="rounded bg-academy-gold px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >Salvar</button>
                            <button onClick={() => setEditingLesson(null)} className="text-xs text-slate-400">Cancelar</button>
                          </div>

                          <div className="border-t border-slate-600 pt-2">
                            <label className="mb-1 block text-xs text-slate-400">+ Material (URL)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="url"
                                placeholder="https://..."
                                value={materialForms[l.id] ?? ''}
                                onChange={e => setMaterialForms(f => ({ ...f, [l.id]: e.target.value }))}
                                className="flex-1 rounded bg-slate-600 px-2 py-1.5 text-xs text-white outline-none"
                              />
                              <button
                                onClick={() => addMaterial(l.id)}
                                className="rounded bg-slate-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-400"
                              >Adicionar</button>
                              {materialDone[l.id] && <span className="text-xs text-green-400">✓</span>}
                            </div>
                          </div>
                        </div>
                      )}
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
