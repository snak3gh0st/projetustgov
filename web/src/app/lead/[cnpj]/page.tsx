'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatCNPJ, formatCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import ContactNotesTimeline from '@/components/ContactNotesTimeline'
import SaleModal from '@/components/SaleModal'

const STATUS_OPTIONS = ['Não Contatado', 'Retorno', 'Proposta', 'Fechado']
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-red-500/20 text-red-500',
  'Retorno': 'bg-amber-500/20 text-amber-600',
  'Proposta': 'bg-blue-500/20 text-[#0072F7]',
  'Fechado': 'bg-green-500/20 text-green-600',
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
  const [saleModal, setSaleModal] = useState<{
    projetoId: number
    tipoVendedor: string | null
  } | null>(null)

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
      // If status is changing to "Fechado", open SaleModal instead
      if (field === 'status_contato' && value === 'Fechado') {
        const projeto = projetos.find(p => p.id === id)
        setSaleModal({
          projetoId: id,
          tipoVendedor: projeto?.tipo_vendedor || null,
        })
        return
      }

      const body: Record<string, unknown> = { id, [field]: value }

      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        alert(`Erro ao atualizar: ${errData.error || 'Falha no servidor'}`)
        return
      }
      const data = await res.json().catch(() => ({}))
      setProjetos(prev => prev.map(p =>
        p.id === id ? {
          ...p,
          [field]: value,
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : p
      ))
    } catch (err) {
      console.error('Update error:', err)
    }
  }

  async function submitFechado(projetoId: number, saleData: { valor_venda: number; tipo_vendedor: string }) {
    try {
      const body = {
        id: projetoId,
        status_contato: 'Fechado',
        valor_venda: saleData.valor_venda,
        tipo_vendedor: saleData.tipo_vendedor,
      }
      const res = await fetch(`/api/leads/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        alert(`Erro ao registrar venda: ${errData.error || 'Falha no servidor'}`)
        return
      }
      const data = await res.json().catch(() => ({}))
      setProjetos(prev => prev.map(p =>
        p.id === projetoId ? {
          ...p,
          status_contato: 'Fechado',
          valor_venda: saleData.valor_venda,
          tipo_vendedor: saleData.tipo_vendedor as 'SDR' | 'Closer',
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : p
      ))
      setSaleModal(null)
    } catch (err) {
      console.error('Failed to submit fechado:', err)
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
        <div className="text-red-500">Nenhum projeto encontrado para este CNPJ</div>
        <Link href="/leads" className="text-sigma-neon hover:underline text-sm">Voltar</Link>
      </div>
    )
  }

  const first = projetos[0]

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
  const totalEmendas = projetos.reduce((sum, p) => sum + (Number(p.valor_emenda) || 0), 0)

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/leads" className="text-gray-500 hover:text-gray-900 transition-colors text-sm">
        &#8592; Voltar para leads
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-bold text-gray-900">{first.nome || 'Sem nome'}</h1>
          {isPriority && (
            <span className="text-xs bg-red-500/20 text-red-500 px-3 py-1 rounded-full border border-red-500/30 font-medium">
              MÁXIMA PRIORIDADE
            </span>
          )}
          {isExistingClient && (
            <span className="text-xs bg-purple-500/20 text-purple-600 px-3 py-1 rounded-full border border-purple-500/30 font-medium">
              CLIENTE EXISTENTE
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 font-mono mt-1">{formatCNPJ(cnpj)}</p>
        {isPriority && (
          <p className="text-sm text-gray-400 mt-2">
            Este CNPJ nunca executou um convênio — alta probabilidade de conversão
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">{projetos.length > 1 ? 'Total Emendas' : 'Valor Emenda'}</p>
          <p className="text-xl font-heading font-bold text-sigma-neon mt-1">
            {formatCurrency(totalEmendas)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Projetos</p>
          <p className="text-xl font-heading font-bold text-gray-900 mt-1">{projetos.length}</p>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">UF</p>
          <p className="text-xl font-heading font-bold text-gray-900 mt-1">{first.uf || '-'}</p>
          <p className="text-xs text-gray-400">{first.municipio || ''}</p>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase">Vendedor</p>
          <p className="text-xl font-heading font-bold text-gray-900 mt-1">{first.vendedor_nome || '-'}</p>
        </div>
      </div>

      {/* Commission Info */}
      {first.vendedor_id && first.comissao_valor && first.comissao_valor > 0 && (
        <div className="bg-sigma-neon/10 border border-sigma-neon/30 rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase">Tipo Vendedor</p>
              {canModify ? (
                <select
                  value={first.tipo_vendedor || 'SDR'}
                  onChange={(e) => updateProjeto(first.id, 'tipo_vendedor', e.target.value)}
                  className="mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-sigma-neon/50"
                >
                  <option value="SDR">SDR (1%)</option>
                  <option value="Closer">Closer (4%)</option>
                </select>
              ) : (
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {first.tipo_vendedor || 'SDR'}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Comissao ({Number(first.comissao_percentual || 0).toFixed(1)}%)</p>
              <p className="text-2xl font-heading font-bold text-sigma-neon mt-1">
                {formatCurrency(first.comissao_valor)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Bonus por Fechamento</p>
              <p className="text-lg font-semibold text-green-600 mt-1">
                {formatCurrency(first.comissao_bonus || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Valor da Venda</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {formatCurrency(first.valor_venda || 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contact info */}
      {(first.telefone || first.email || first.endereco || canModify) && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex flex-wrap gap-6">
          {first.endereco && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Endereco</p>
              <p className="text-sm text-gray-600">{first.endereco}</p>
              {first.municipio && first.uf && (
                <p className="text-xs text-gray-400 mt-0.5">{first.municipio} - {first.uf}</p>
              )}
            </div>
          )}
          {(first.telefone || canModify) && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-gray-500 uppercase">Telefone</p>
                {canModify && editingField !== 'telefone' && (
                  <button
                    onClick={() => {
                      setEditingField('telefone')
                      setEditValue(first.telefone || '')
                    }}
                    className="text-gray-400 hover:text-sigma-neon transition-colors"
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
                  className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-sigma-neon/50"
                />
              ) : first.telefone ? (
                <a href={`https://wa.me/55${first.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="text-sm text-green-600 hover:text-green-700 block">
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
                <p className="text-xs text-gray-500 uppercase">Email</p>
                {canModify && editingField !== 'email' && (
                  <button
                    onClick={() => {
                      setEditingField('email')
                      setEditValue(first.email || '')
                    }}
                    className="text-gray-400 hover:text-sigma-neon transition-colors"
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
                  className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-sigma-neon/50"
                />
              ) : first.email ? (
                <a href={`mailto:${first.email}`} className="text-sm text-[#0072F7] hover:text-blue-700 block">
                  {first.email}
                </a>
              ) : (
                <span className="text-sm text-gray-600">Sem email</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-heading font-semibold text-gray-900">Emendas ({projetos.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parlamentar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orgao</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor Emenda</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Link</th>
              </tr>
            </thead>
            <tbody>
              {projetos.map(p => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 text-xs max-w-[220px] whitespace-normal break-words">{p.parlamentar || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] whitespace-normal break-words">{p.orgao_concedente || '-'}</td>
                  <td className="px-4 py-3 text-sigma-neon text-xs">{formatCurrency(Number(p.valor_emenda) || 0)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.status_contato || 'Não Contatado'}
                      onChange={e => updateProjeto(p.id, 'status_contato', e.target.value)}
                      className={`text-xs rounded px-2 py-1 border-0 cursor-pointer ${STATUS_COLORS[p.status_contato] || STATUS_COLORS['Não Contatado']}`}
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
                      className="bg-transparent border-b border-gray-200 text-xs text-gray-600 w-24 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {p.link_externo ? (
                      <a href={p.link_externo} target="_blank" rel="noopener" className="text-[#0072F7] hover:text-blue-700 text-xs">
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

      <SaleModal
        open={!!saleModal}
        leadNome={first.nome || 'Sem nome'}
        currentTipoVendedor={saleModal?.tipoVendedor}
        onCancel={() => setSaleModal(null)}
        onConfirm={(data) => {
          if (saleModal) {
            submitFechado(saleModal.projetoId, data)
          }
        }}
      />
    </div>
  )
}
