'use client'

import { useState, useEffect } from 'react'
import type { ContactNote } from '@/lib/types'

interface ContactNotesTimelineProps {
  cnpj: string
  canModify: boolean
}

const TIPO_CONFIG = {
  ligacao: { label: 'Ligacao', icon: 'Tel', color: 'text-[#0072F7] bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  email: { label: 'Email', icon: '@', color: 'text-[#0072F7] bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  whatsapp: { label: 'WhatsApp', icon: 'WA', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20' },
  reuniao: { label: 'Reuniao', icon: 'Reu', color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20' },
  outro: { label: 'Outro', icon: '--', color: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700' },
}

export default function ContactNotesTimeline({ cnpj, canModify }: ContactNotesTimelineProps) {
  const [notes, setNotes] = useState<ContactNote[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ tipo: 'ligacao', observacao: '' })
  const [submitting, setSubmitting] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ tipo: 'ligacao', observacao: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  async function fetchNotes() {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}/notes`)
      const data = await res.json()
      setNotes(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch notes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes()
  }, [cnpj])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.observacao.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (res.ok) {
        setFormData({ tipo: 'ligacao', observacao: '' })
        setShowForm(false)
        fetchNotes()
      }
    } catch (err) {
      console.error('Failed to create note:', err)
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(note: ContactNote) {
    setEditingNoteId(note.id)
    setEditForm({ tipo: note.tipo, observacao: note.observacao || '' })
  }

  function cancelEdit() {
    setEditingNoteId(null)
    setEditError(null)
    setEditForm({ tipo: 'ligacao', observacao: '' })
  }

  async function handleEditSubmit(noteId: string) {
    setEditSubmitting(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, tipo: editForm.tipo, observacao: editForm.observacao })
      })

      if (res.ok) {
        setEditingNoteId(null)
        setEditError(null)
        fetchNotes()
      } else {
        const data = await res.json().catch(() => ({}))
        setEditError(data.error ?? 'Erro ao salvar. Tente novamente.')
      }
    } catch (err) {
      console.error('Failed to update note:', err)
      setEditError('Erro de conexão. Tente novamente.')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleDelete(noteId: string) {
    if (!confirm('Tem certeza que deseja excluir esta nota?')) return
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId })
      })

      if (res.ok) {
        fetchNotes()
      }
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'agora'
    if (diffMins < 60) return `há ${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `há ${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `há ${diffDays}d`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">Carregando histórico...</div>
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100">Histórico de Contatos</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{notes.length} interações registradas</p>
        </div>
        {canModify && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4] transition-all"
          >
            + Nova Interação
          </button>
        )}
      </div>

      {showForm && canModify && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <label className="block mb-3">
            <span className="text-sm text-gray-400 dark:text-gray-500 block mb-1">Tipo de Contato</span>
            <select
              value={formData.tipo}
              onChange={e => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7]"
            >
              {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.icon} {cfg.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block mb-3">
            <span className="text-sm text-gray-400 dark:text-gray-500 block mb-1">Observação</span>
            <textarea
              value={formData.observacao}
              onChange={e => setFormData({ ...formData, observacao: e.target.value })}
              placeholder="Descreva o que foi discutido..."
              rows={3}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.observacao.trim()}
              className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {notes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            Nenhuma interação registrada ainda
          </div>
        ) : (
          notes.map((note) => {
            const cfg = TIPO_CONFIG[note.tipo as keyof typeof TIPO_CONFIG]
            const isEditing = editingNoteId === note.id

            return (
              <div key={note.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {isEditing ? (
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{note.vendedor_nome}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(note.created_at)}</span>
                      {editError
                        ? <span className="text-xs text-red-500 dark:text-red-400 ml-auto">{editError}</span>
                        : <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">Editando...</span>
                      }
                    </div>
                    <label className="block">
                      <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Tipo de Contato</span>
                      <select
                        value={editForm.tipo}
                        onChange={e => setEditForm({ ...editForm, tipo: e.target.value })}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7]"
                      >
                        {Object.entries(TIPO_CONFIG).map(([key, tipoConfig]) => (
                          <option key={key} value={key}>
                            {tipoConfig.icon} {tipoConfig.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Observação</span>
                      <textarea
                        value={editForm.observacao}
                        onChange={e => setEditForm({ ...editForm, observacao: e.target.value })}
                        rows={3}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditSubmit(note.id)}
                        disabled={editSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editSubmitting ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal note display */
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <span className={`inline-block px-2 py-1 rounded text-xs border ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{note.vendedor_nome}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(note.created_at)}</span>
                        {canModify && (
                          <div className="ml-auto flex items-center gap-1.5">
                            <button
                              onClick={() => startEdit(note)}
                              className="text-xs text-gray-400 dark:text-gray-500 hover:text-[#0072F7] transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-500/10"
                              title="Editar nota"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(note.id)}
                              className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                              title="Excluir nota"
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                      {note.observacao && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{note.observacao}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
