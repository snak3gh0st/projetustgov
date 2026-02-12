'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatCNPJ, formatCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import ContactNotesTimeline from '@/components/ContactNotesTimeline'

const STATUS_OPTIONS = ['Não Contatado', 'Ainda Não', 'Retorno', 'Proposta', 'Fechado']
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-gray-500/20 text-gray-400',
  'Ainda Não': 'bg-red-500/20 text-red-400',
  'Retorno': 'bg-amber-500/20 text-amber-400',
  'Proposta': 'bg-blue-500/20 text-blue-400',
  'Fechado': 'bg-green-500/20 text-green-400',
}

export default function LeadDetailPage() {
  const params = useParams()
  const cnpj = decodeURIComponent(params.cnpj as string)

  const [projetos, setProjetos] = useState<VendedorProjeto[]>([])
  const [loading, setLoading] = useState(true)
  const [isPriority, setIsPriority] = useState(false)
  const [isExistingClient, setIsExistingClient] = useState(false)
  const [canModify, setCanModify] = useState(false)
  const [editingField, setEditingField] = useState<'telefone' | 'email' | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    fetch(`/api/leads?search=${encodeURIComponent(cnpj)}&limit=100`)
      .then(r => r.json())
      .then(data => {
        const filtered = (Array.isArray(data) ? data : []).filter(
          (p: VendedorProjeto) => p.cnpj === cnpj
        )
        setProjetos(filtered)
        if (filtered.length > 0) {
          setIsPriority(filtered[0].is_max_priority || false)
          setIsExistingClient(filtered[0].is_existing_client || false)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Fetch session to determine if user can modify
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(session => {
        if (session?.user?.role) {
          setCanModify(session.user.role !== 'visualizador')
        }
      })
      .catch(() => {})
  }, [cnpj])

  async function updateProjeto(id: number, field: string, value: string) {
    try {
      await fetch(`/api/leads/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      })
      setProjetos(prev => prev.map(p =>
        p.id === id ? { ...p, [field]: value } : p
      ))
    } catch (err) {
      console.error('Update error:', err)
    }
  }

  async function updateContact(field: 'telefone' | 'email', value: string) {
    try {
      await fetch(`/api/leads/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: first.id, [field]: value })
      })
      setProjetos(prev => prev.map(p => p.cnpj === cnpj ? {...p, [field]: value} : p))
      setEditingField(null)
    } catch (err) {
      console.error('Update contact error:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (projetos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-red-400">Nenhum projeto encontrado para este CNPJ</div>
        <Link href="/leads" className="text-sigma-neon hover:underline text-sm">Voltar</Link>
      </div>
    )
  }

  const first = projetos[0]
  const totalValorEmenda = projetos.reduce((sum, p) => sum + (Number(p.valor_emenda) || 0), 0)

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/leads" className="text-gray-400 hover:text-white transition-colors text-sm">
        &#8592; Voltar para leads
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-bold text-white">{first.nome || 'Sem nome'}</h1>
          {isPriority && (
            <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full border border-red-500/30 font-medium">
              MÁXIMA PRIORIDADE
            </span>
          )}
          {isExistingClient && (
            <span className="text-xs bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full border border-purple-500/30 font-medium">
              CLIENTE EXISTENTE
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 font-mono mt-1">{formatCNPJ(cnpj)}</p>
        {isPriority && (
          <p className="text-sm text-gray-500 mt-2">
            Este CNPJ nunca executou um convênio — alta probabilidade de conversão
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase">Valor Emenda Total</p>
          <p className="text-xl font-heading font-bold text-sigma-neon mt-1">
            {formatCurrency(totalValorEmenda)}
          </p>
        </div>
        <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase">Projetos</p>
          <p className="text-xl font-heading font-bold text-white mt-1">{projetos.length}</p>
        </div>
        <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase">UF</p>
          <p className="text-xl font-heading font-bold text-white mt-1">{first.uf || '-'}</p>
          <p className="text-xs text-gray-500">{first.municipio || ''}</p>
        </div>
        <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase">Vendedor</p>
          <p className="text-xl font-heading font-bold text-white mt-1">{first.vendedor_nome || '-'}</p>
        </div>
      </div>

      {/* Contact info */}
      {(first.telefone || first.email || canModify) && (
        <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4 flex flex-wrap gap-6">
          {(first.telefone || canModify) && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-gray-400 uppercase">Telefone</p>
                {canModify && editingField !== 'telefone' && (
                  <button
                    onClick={() => {
                      setEditingField('telefone')
                      setEditValue(first.telefone || '')
                    }}
                    className="text-gray-500 hover:text-sigma-neon transition-colors"
                    title="Editar telefone"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z"/>
                    </svg>
                  </button>
                )}
              </div>
              {editingField === 'telefone' ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue !== (first.telefone || '')) {
                      updateContact('telefone', editValue)
                    } else {
                      setEditingField(null)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (editValue !== (first.telefone || '')) {
                        updateContact('telefone', editValue)
                      } else {
                        setEditingField(null)
                      }
                    } else if (e.key === 'Escape') {
                      setEditingField(null)
                    }
                  }}
                  autoFocus
                  className="text-sm text-white bg-sigma-navy-light border border-white/20 rounded-md px-2 py-1 focus:outline-none focus:border-sigma-neon/50"
                />
              ) : first.telefone ? (
                <a href={`https://wa.me/55${first.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="text-sm text-green-400 hover:text-green-300 block">
                  {first.telefone}
                </a>
              ) : (
                <span className="text-sm text-gray-600">Sem telefone</span>
              )}
            </div>
          )}
          {(first.email || canModify) && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-gray-400 uppercase">Email</p>
                {canModify && editingField !== 'email' && (
                  <button
                    onClick={() => {
                      setEditingField('email')
                      setEditValue(first.email || '')
                    }}
                    className="text-gray-500 hover:text-sigma-neon transition-colors"
                    title="Editar email"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z"/>
                    </svg>
                  </button>
                )}
              </div>
              {editingField === 'email' ? (
                <input
                  type="email"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue !== (first.email || '')) {
                      updateContact('email', editValue)
                    } else {
                      setEditingField(null)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (editValue !== (first.email || '')) {
                        updateContact('email', editValue)
                      } else {
                        setEditingField(null)
                      }
                    } else if (e.key === 'Escape') {
                      setEditingField(null)
                    }
                  }}
                  autoFocus
                  className="text-sm text-white bg-sigma-navy-light border border-white/20 rounded-md px-2 py-1 focus:outline-none focus:border-sigma-neon/50"
                />
              ) : first.email ? (
                <a href={`mailto:${first.email}`} className="text-sm text-cyan-400 hover:text-cyan-300 block">
                  {first.email}
                </a>
              ) : (
                <span className="text-sm text-gray-600">Sem email</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-sigma-navy-card border border-white/5 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-lg font-heading font-semibold text-white">Emendas ({projetos.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-sigma-navy-light">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Parlamentar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Orgao</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Valor Emenda</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Obs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Link</th>
              </tr>
            </thead>
            <tbody>
              {projetos.map(p => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white text-xs truncate max-w-[180px]">{p.parlamentar || '-'}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs truncate max-w-[150px]">{p.orgao_concedente || '-'}</td>
                  <td className="px-4 py-3 text-sigma-neon text-xs">{formatCurrency(Number(p.valor_emenda) || 0)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.status_contato || 'Ainda Não'}
                      onChange={e => updateProjeto(p.id, 'status_contato', e.target.value)}
                      className={`text-xs rounded px-2 py-1 border-0 cursor-pointer ${STATUS_COLORS[p.status_contato] || STATUS_COLORS['Ainda Não']}`}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={p.observacoes || ''}
                      placeholder="..."
                      onBlur={e => {
                        if (e.target.value !== (p.observacoes || '')) {
                          updateProjeto(p.id, 'observacoes', e.target.value)
                        }
                      }}
                      className="bg-transparent border-b border-white/10 text-xs text-gray-300 w-24 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {p.link_externo ? (
                      <a href={p.link_externo} target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 text-xs">
                        Abrir
                      </a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact notes timeline */}
      <ContactNotesTimeline cnpj={cnpj} canModify={canModify} />
    </div>
  )
}
