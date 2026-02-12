'use client'

import { useState, useEffect } from 'react'
import type { ContactNote } from '@/lib/types'

interface ContactNotesTimelineProps {
  cnpj: string
  canModify: boolean
}

const TIPO_CONFIG = {
  ligacao: { label: 'Ligação', icon: '📞', color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
  email: { label: 'Email', icon: '📧', color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30' },
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'text-green-400 bg-green-500/20 border-green-500/30' },
  reuniao: { label: 'Reunião', icon: '🤝', color: 'text-purple-400 bg-purple-500/20 border-purple-500/30' },
  outro: { label: 'Outro', icon: '📝', color: 'text-gray-400 bg-gray-500/20 border-gray-500/30' },
}

export default function ContactNotesTimeline({ cnpj, canModify }: ContactNotesTimelineProps) {
  const [notes, setNotes] = useState<ContactNote[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ tipo: 'ligacao', observacao: '' })
  const [submitting, setSubmitting] = useState(false)

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
    <div className="bg-sigma-navy-card border border-white/5 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-white">Histórico de Contatos</h2>
          <p className="text-xs text-gray-500">{notes.length} interações registradas</p>
        </div>
        {canModify && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 rounded-lg bg-sigma-neon text-sigma-navy-dark text-sm font-medium hover:brightness-110 transition-all"
          >
            + Nova Interação
          </button>
        )}
      </div>

      {showForm && canModify && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-white/5 bg-white/5">
          <label className="block mb-3">
            <span className="text-sm text-gray-400 block mb-1">Tipo de Contato</span>
            <select
              value={formData.tipo}
              onChange={e => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sigma-neon/50"
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
              className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.observacao.trim()}
              className="px-3 py-1.5 rounded-lg bg-sigma-neon text-sigma-navy-dark text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-white/5">
        {notes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Nenhuma interação registrada ainda
          </div>
        ) : (
          notes.map((note) => {
            const cfg = TIPO_CONFIG[note.tipo as keyof typeof TIPO_CONFIG]
            return (
              <div key={note.id} className="p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <span className={`inline-block px-2 py-1 rounded text-xs border ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-medium text-white">{note.vendedor_nome}</span>
                      <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                    </div>
                    {note.observacao && (
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{note.observacao}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
