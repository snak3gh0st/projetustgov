'use client'

import { useState, useEffect } from 'react'
import type { ContactNote } from '@/lib/types'

interface ContactNotesTimelineProps {
  cnpj: string
  canModify: boolean
}

const TIPO_CONFIG = {
  ligacao: { label: 'Ligacao', icon: 'Tel', color: 'text-[#0072F7] bg-blue-50 border-blue-200' },
  email: { label: 'Email', icon: '@', color: 'text-[#0072F7] bg-blue-50 border-blue-200' },
  whatsapp: { label: 'WhatsApp', icon: 'WA', color: 'text-green-600 bg-green-50 border-green-200' },
  reuniao: { label: 'Reuniao', icon: 'Reu', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  outro: { label: 'Outro', icon: '--', color: 'text-gray-600 bg-gray-50 border-gray-200' },
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
    setEditForm({ tipo: 'ligacao', observacao: '' })
  }

  async function handleEditSubmit(noteId: string) {
    setEditSubmitting(true)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, tipo: editForm.tipo, observacao: editForm.observacao })
      })

      if (res.ok) {
        setEditingNoteId(null)
        fetchNotes()
      }
    } catch (err) {
      console.error('Failed to update note:', err)
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
    return <div className="text-gray-500 text-sm">Carregando histórico...</div>
  }

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900">Histórico de Contatos</h2>
          <p className="text-xs text-gray-500">{notes.length} interações registradas</p>
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
        <form onSubmit={handleSubmit} className="p-4 border-b border-gray-200 bg-gray-50">
          <label className="block mb-3">
            <span className="text-sm text-gray-400 block mb-1">Tipo de Contato</span>
            <select
              value={formData.tipo}
              onChange={e => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0072F7]"
            >
              {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.icon} {cfg.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block mb-3">
            <span className="text-sm text-gray-400 block mb-1">Observação</span>
            <textarea
              value={formData.observacao}
              onChange={e => setFormData({ ...formData, observacao: e.target.value })}
              placeholder="Descreva o que foi discutido..."
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
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

      <div className="divide-y divide-gray-200">
        {notes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Nenhuma interação registrada ainda
          </div>
        ) : (
          notes.map((note) => {
            const cfg = TIPO_CONFIG[note.tipo as keyof typeof TIPO_CONFIG]
            const isEditing = editingNoteId === note.id

            return (
              <div key={note.id} className="p-4 hover:bg-gray-50 transition-colors">
                {isEditing ? (
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">{note.vendedor_nome}</span>
                      <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                      <span className="text-xs text-amber-600 ml-auto">Editando...</span>
                    </div>
                    <label className="block">
                      <span className="text-xs text-gray-400 block mb-1">Tipo de Contato</span>
                      <select
                        value={editForm.tipo}
                        onChange={e => setEditForm({ ...editForm, tipo: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0072F7]"
                      >
                        {Object.entries(TIPO_CONFIG).map(([key, tipoConfig]) => (
                          <option key={key} value={key}>
                            {tipoConfig.icon} {tipoConfig.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-400 block mb-1">Observação</span>
                      <textarea
                        value={editForm.observacao}
                        onChange={e => setEditForm({ ...editForm, observacao: e.target.value })}
                        rows={3}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[#0072F7]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
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
                        <span className="text-sm font-medium text-gray-900">{note.vendedor_nome}</span>
                        <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                        {canModify && (
                          <div className="ml-auto flex items-center gap-1.5">
                            <button
                              onClick={() => startEdit(note)}
                              className="text-xs text-gray-400 hover:text-[#0072F7] transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50"
                              title="Editar nota"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(note.id)}
                              className="text-xs text-gray-400 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                              title="Excluir nota"
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                      {note.observacao && (
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{note.observacao}</p>
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
