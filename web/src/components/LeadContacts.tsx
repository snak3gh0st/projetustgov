'use client'

import { useState, useEffect } from 'react'
import type { LeadContact, TelefoneStatus } from '@/lib/types'
import { googleCalendarEventUrl, whatsappMeUrlFromTelefone } from '@/lib/format'

interface LeadContactsProps {
  cnpj: string
  canModify: boolean
}

const TELEFONE_STATUS_CONFIG: Record<TelefoneStatus, { label: string; color: string }> = {
  valido: { label: 'Valido', color: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20' },
  invalido: { label: 'Invalido', color: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
  nao_atende: { label: 'Nao Atende', color: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  desconhecido: { label: 'Desconhecido', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700' },
}

const EMPTY_FORM = { nome_pessoa: '', cargo: '', telefone: '', email: '' }

export default function LeadContacts({ cnpj, canModify }: LeadContactsProps) {
  const [contacts, setContacts] = useState<LeadContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [editData, setEditData] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const apiBase = `/api/leads/${encodeURIComponent(cnpj)}/contacts`

  async function fetchContacts() {
    try {
      const res = await fetch(apiBase)
      const data = await res.json()
      setContacts(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContacts()
  }, [cnpj])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.telefone.trim() && !formData.email.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        setFormData(EMPTY_FORM)
        setShowForm(false)
        fetchContacts()
      }
    } catch (err) {
      console.error('Failed to create contact:', err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(id: number, fields: Partial<LeadContact>) {
    try {
      const res = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      if (res.ok) {
        fetchContacts()
        if (editingId === id) setEditingId(null)
      }
    } catch (err) {
      console.error('Failed to update contact:', err)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este contato?')) return
    try {
      const res = await fetch(apiBase, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        fetchContacts()
      }
    } catch (err) {
      console.error('Failed to delete contact:', err)
    }
  }

  function startEdit(contact: LeadContact) {
    setEditingId(contact.id)
    setEditData({
      nome_pessoa: contact.nome_pessoa || '',
      cargo: contact.cargo || '',
      telefone: contact.telefone || '',
      email: contact.email || '',
    })
  }

  function handleEditSave(id: number) {
    handleUpdate(id, editData)
  }

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400 text-sm">Carregando contatos...</div>
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100">Contatos</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{contacts.length} contato{contacts.length !== 1 ? 's' : ''} cadastrado{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        {canModify && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4] transition-all"
          >
            + Novo Contato
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canModify && (
        <form onSubmit={handleCreate} className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nome da Pessoa</span>
              <input
                type="text"
                value={formData.nome_pessoa}
                onChange={e => setFormData({ ...formData, nome_pessoa: e.target.value })}
                placeholder="Ex: Joao Silva"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Cargo</span>
              <input
                type="text"
                value={formData.cargo}
                onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                placeholder="Ex: Prefeito, Secretario"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Telefone</span>
              <input
                type="text"
                value={formData.telefone}
                onChange={e => setFormData({ ...formData, telefone: e.target.value })}
                placeholder="(XX) XXXXX-XXXX"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Email</span>
              <input
                type="text"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormData(EMPTY_FORM) }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || (!formData.telefone.trim() && !formData.email.trim())}
              className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {/* Contact list */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            Nenhum contato cadastrado
          </div>
        ) : (
          contacts.map((contact) => (
            <div key={contact.id} className={`p-4 transition-colors ${contact.principal ? 'bg-blue-50/50 dark:bg-blue-500/5 border-l-2 border-l-[#0072F7]' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              {editingId === contact.id ? (
                /* Edit mode */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <input
                      type="text"
                      value={editData.nome_pessoa}
                      onChange={e => setEditData({ ...editData, nome_pessoa: e.target.value })}
                      placeholder="Nome da Pessoa"
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={editData.cargo}
                      onChange={e => setEditData({ ...editData, cargo: e.target.value })}
                      placeholder="Cargo"
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={editData.telefone}
                      onChange={e => setEditData({ ...editData, telefone: e.target.value })}
                      placeholder="Telefone"
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={editData.email}
                      onChange={e => setEditData({ ...editData, email: e.target.value })}
                      placeholder="Email"
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-[#0072F7] placeholder-gray-400 dark:placeholder:text-gray-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleEditSave(contact.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#0072F7] text-white text-sm font-medium hover:bg-[#0058C4]"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                /* Read mode */
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {contact.nome_pessoa && (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{contact.nome_pessoa}</span>
                      )}
                      {contact.cargo && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{contact.cargo}</span>
                      )}
                      {contact.principal && (
                        <span className="text-xs bg-[#0072F7]/10 text-[#0072F7] px-2 py-0.5 rounded-full border border-[#0072F7]/20 font-medium">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                      {contact.telefone && (
                        whatsappMeUrlFromTelefone(contact.telefone) ? (
                          <a
                            href={whatsappMeUrlFromTelefone(contact.telefone)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-700"
                            title="Abrir WhatsApp"
                          >
                            {contact.telefone}
                          </a>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300">{contact.telefone}</span>
                        )
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-[#0072F7] hover:text-blue-700"
                        >
                          {contact.email}
                        </a>
                      )}
                      <a
                        href={googleCalendarEventUrl({
                          title: contact.nome_pessoa
                            ? `Reunião Projetus — ${contact.nome_pessoa}`
                            : `Reunião Projetus — ${cnpj}`,
                          details: [
                            contact.nome_pessoa ? `Contato: ${contact.nome_pessoa}` : null,
                            contact.cargo ? `Cargo: ${contact.cargo}` : null,
                            contact.telefone ? `Telefone: ${contact.telefone}` : null,
                            contact.email ? `Email: ${contact.email}` : null,
                            `CNPJ: ${cnpj}`,
                            'Local: Google Meet',
                          ].filter(Boolean).join('\n'),
                          guestEmail: contact.email,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                        title="Abrir Google Calendar / Meet"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          <rect x="2" y="3" width="12" height="11" rx="1.5" />
                          <path d="M2 6.5h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
                        </svg>
                        Agendar
                      </a>
                    </div>
                    {contact.created_by_nome && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Adicionado por {contact.created_by_nome}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Telefone status */}
                    {canModify ? (
                      <select
                        value={contact.telefone_status}
                        onChange={e => handleUpdate(contact.id, { telefone_status: e.target.value as TelefoneStatus })}
                        className={`text-xs rounded px-2 py-1 border cursor-pointer focus:outline-none bg-transparent ${TELEFONE_STATUS_CONFIG[contact.telefone_status].color}`}
                      >
                        {Object.entries(TELEFONE_STATUS_CONFIG).map(([key, cfg]) => (
                          <option key={key} value={key}>{cfg.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs rounded px-2 py-1 border ${TELEFONE_STATUS_CONFIG[contact.telefone_status].color}`}>
                        {TELEFONE_STATUS_CONFIG[contact.telefone_status].label}
                      </span>
                    )}

                    {/* Principal indicator / toggle */}
                    {contact.principal ? (
                      <span className="text-[#0072F7] px-1" title="Contato principal">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.7 3.7 14l.8-4.6L1 6l4.9-.7L8 1z"/>
                        </svg>
                      </span>
                    ) : canModify ? (
                      <button
                        onClick={() => handleUpdate(contact.id, { principal: true })}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-[#0072F7] transition-colors px-1"
                        title="Marcar como principal"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 1l2.1 4.3L15 6l-3.5 3.4.8 4.6L8 11.7 3.7 14l.8-4.6L1 6l4.9-.7L8 1z"/>
                        </svg>
                      </button>
                    ) : null}

                    {/* Edit / Delete */}
                    {canModify && (
                      <>
                        <button
                          onClick={() => startEdit(contact)}
                          className="text-gray-400 dark:text-gray-500 hover:text-[#0072F7] transition-colors"
                          title="Editar contato"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                          title="Remover contato"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="4" x2="12" y2="12"/>
                            <line x1="12" y1="4" x2="4" y2="12"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
