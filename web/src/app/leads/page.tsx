'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { formatCNPJ, formatCompactCurrency, formatCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'
import SaleModal from '@/components/SaleModal'

const STATUS_OPTIONS = ['Não Contatado', 'Retorno', 'Proposta', 'Fechado']
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-red-50 text-red-500',
  'Retorno': 'bg-amber-50 text-amber-600',
  'Proposta': 'bg-blue-50 text-[#0072F7]',
  'Fechado': 'bg-green-50 text-green-600',
}

interface Vendedor {
  id: string
  nome: string
  email: string
  lead_count: number
}

interface SessionUser {
  role: string
  id: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [selectedLead, setSelectedLead] = useState<VendedorProjeto | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [assignmentModal, setAssignmentModal] = useState<{
    cnpj: string
    nome: string
    currentVendedor: string | null
  } | null>(null)
  const [saleModal, setSaleModal] = useState<{
    leadId: number
    leadCnpj: string
    leadNome: string
    tipoVendedor: string | null
  } | null>(null)
  const [expandedCnpjs, setExpandedCnpjs] = useState<Set<string>>(new Set())
  const [clientFilter, setClientFilter] = useState('')

  // Fetch session
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      if (s?.user) {
        setSessionUser({ role: s.user.role, id: s.user.id })
      }
    }).catch(() => {})
  }, [])

  // Fetch vendedores for gestor filter
  useEffect(() => {
    if (sessionUser?.role === 'gestor') {
      fetch('/api/vendedores').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setVendedores(data)
      }).catch(() => {})
    }
  }, [sessionUser])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status_contato', statusFilter)
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
    params.set('limit', '500')

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, vendedorFilter])

  useEffect(() => {
    const timer = setTimeout(fetchLeads, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

  // Group leads by CNPJ for display (show total when multiple emendas, cascade shows individual values)
  const displayLeads = useMemo(() => {
    const leadsByCnpj = leads.reduce((acc, lead) => {
      if (!acc[lead.cnpj]) {
        acc[lead.cnpj] = []
      }
      acc[lead.cnpj].push(lead)
      return acc
    }, {} as Record<string, VendedorProjeto[]>)

    let result = Object.entries(leadsByCnpj).map(([cnpj, cnpjLeads]) => {
      const first = cnpjLeads[0] // highest value (ORDER BY valor_emenda DESC)
      return {
        ...first,
        emenda_count: cnpjLeads.length,
        subLeads: cnpjLeads, // all emendas for cascade (including first)
      }
    })

    // Client filter
    if (clientFilter === 'existing') {
      result = result.filter(l => l.is_existing_client)
    } else if (clientFilter === 'new') {
      result = result.filter(l => !l.is_existing_client)
    }

    return result
  }, [leads, clientFilter])

  function toggleExpand(cnpj: string) {
    setExpandedCnpjs(prev => {
      const next = new Set(prev)
      if (next.has(cnpj)) next.delete(cnpj)
      else next.add(cnpj)
      return next
    })
  }

  async function updateLead(id: number, field: string, value: string) {
    try {
      const lead = leads.find(l => l.id === id)
      if (!lead) return

      // If status is changing to "Fechado", open SaleModal instead of proceeding directly
      if (field === 'status_contato' && value === 'Fechado') {
        setSaleModal({
          leadId: id,
          leadCnpj: lead.cnpj,
          leadNome: lead.nome || 'Sem nome',
          tipoVendedor: lead.tipo_vendedor,
        })
        return // SaleModal will call submitFechado when confirmed
      }

      const body: Record<string, unknown> = { id, [field]: value }

      const res = await fetch(`/api/leads/${encodeURIComponent(lead.cnpj)}`, {
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
      setLeads(prev => prev.map(l =>
        l.id === id ? {
          ...l,
          [field]: value,
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : l
      ))
    } catch (err) {
      console.error('Failed to update lead:', err)
    }
  }

  async function submitFechado(leadId: number, leadCnpj: string, saleData: { valor_venda: number; tipo_vendedor: string }) {
    try {
      const body = {
        id: leadId,
        status_contato: 'Fechado',
        valor_venda: saleData.valor_venda,
        tipo_vendedor: saleData.tipo_vendedor,
      }
      const res = await fetch(`/api/leads/${encodeURIComponent(leadCnpj)}`, {
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
      setLeads(prev => prev.map(l =>
        l.id === leadId ? {
          ...l,
          status_contato: 'Fechado',
          valor_venda: saleData.valor_venda,
          tipo_vendedor: saleData.tipo_vendedor as 'SDR' | 'Closer',
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : l
      ))
      setSaleModal(null)
    } catch (err) {
      console.error('Failed to submit fechado:', err)
    }
  }

  function exportCSV() {
    const headers = ['CNPJ', 'Nome', 'Valor Emenda', 'Ministerio', 'UF', 'Municipio', 'Parlamentar', 'Telefone', 'Email', 'Status', 'Vendedor', 'Observacoes', 'Link']
    const rows = leads.map(l => [
      l.cnpj, l.nome, l.valor_emenda || '', l.orgao_concedente || '', l.uf || '', l.municipio || '',
      l.parlamentar || '', l.telefone || '', l.email || '',
      l.status_contato, l.vendedor_nome || '', l.observacoes || '', l.link_externo || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'leads.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Lista de Leads</h1>
        <p className="text-sm text-gray-500 mt-1">
          {sessionUser?.role === 'vendedor' ? 'Seus leads atribuídos' : 'Todos os projetos dos vendedores'}
        </p>
      </div>

      <input
        type="text"
        placeholder="Buscar por CNPJ ou nome..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
      />

      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]">
          <option value="">Todos Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {sessionUser?.role === 'gestor' && (
          <>
            <select value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]">
              <option value="">Todos Vendedores</option>
              <option value="unassigned">Não atribuídos</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
            </select>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]">
              <option value="">Todos Clientes</option>
              <option value="existing">Clientes Existentes</option>
              <option value="new">Novos Clientes</option>
            </select>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-400">Carregando leads...</div>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Instituição</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ministério</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Local</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  {sessionUser?.role === 'gestor' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayLeads.map(lead => {
                  const hasContact = lead.telefone || lead.email
                  const isExpanded = expandedCnpjs.has(lead.cnpj)
                  const hasMultipleEmendas = lead.emenda_count > 1
                  const isFechado = lead.status_contato === 'Fechado'
                  return (
                  <React.Fragment key={lead.cnpj}>
                  <tr
                    onClick={() => setSelectedLead(lead)}
                    className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${
                      lead.is_max_priority ? 'bg-red-50 border-l-2 border-l-red-500' :
                      !hasContact ? 'bg-red-50/50 border-l-2 border-l-red-300' : ''
                    }`}
                  >
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="flex items-start gap-1.5">
                        {hasMultipleEmendas && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(lead.cnpj) }}
                            className="mt-0.5 text-gray-400 hover:text-[#0072F7] transition-colors text-xs flex-shrink-0"
                            title={`${lead.emenda_count} emendas`}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="text-gray-900 font-medium text-sm leading-tight whitespace-normal break-words">
                            {lead.nome || '-'}
                            {lead.is_existing_client && (
                              <span className="ml-2 text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200">
                                CLIENTE
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-gray-400 mt-0.5 block">{formatCNPJ(lead.cnpj)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isFechado && lead.comissao_valor ? (
                        <div>
                          <span className="text-green-600 font-semibold text-sm">
                            {formatCompactCurrency(lead.comissao_valor)}
                          </span>
                          <span className="block text-[10px] text-gray-400">comissao</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sigma-neon font-semibold text-sm">
                            {formatCompactCurrency(hasMultipleEmendas ? Number(lead.total_valor_emendas || lead.valor_emenda) || 0 : Number(lead.valor_emenda) || 0)}
                          </span>
                          {hasMultipleEmendas && (
                            <span className="ml-1 text-gray-400 text-xs">({lead.emenda_count})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="text-gray-600 text-xs leading-tight whitespace-normal break-words">{lead.orgao_concedente || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-600 text-xs">
                        {lead.uf && lead.municipio ? `${lead.municipio}, ${lead.uf}` : lead.uf || lead.municipio || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {hasContact ? (
                        <div className="space-y-0.5">
                          {lead.telefone && (
                            <div className="text-xs text-gray-600 truncate">{lead.telefone}</div>
                          )}
                          {lead.email && (
                            <div className="text-xs text-gray-400 truncate">{lead.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500/70">Sem contato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.status_contato || 'Não Contatado'}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateLead(lead.id, 'status_contato', e.target.value)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border-0 cursor-pointer ${STATUS_COLORS[lead.status_contato] || STATUS_COLORS['Não Contatado']}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {sessionUser?.role === 'gestor' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{lead.vendedor_nome || '-'}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setAssignmentModal({
                                cnpj: lead.cnpj,
                                nome: lead.nome,
                                currentVendedor: lead.vendedor_nome || null
                              })
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-[#0072F7] transition-colors"
                          >
                            {lead.vendedor_nome ? '↻' : '+'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Cascade sub-rows for multiple emendas */}
                  {isExpanded && lead.subLeads.map(sub => (
                    <tr
                      key={sub.id}
                      onClick={() => setSelectedLead(sub)}
                      className="border-b border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2 pl-10">
                        <div className="text-xs">
                          <span className="text-gray-400 mr-1">↳</span>
                          <span className="text-amber-600 font-medium">{sub.parlamentar || '-'}</span>
                          {sub.nr_emenda && (
                            <span className="text-gray-400 ml-1.5 text-[10px]">#{sub.nr_emenda}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-sigma-neon/70 font-medium text-xs">
                          {formatCompactCurrency(Number(sub.valor_emenda) || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-gray-400 text-xs">{sub.orgao_concedente || '-'}</div>
                      </td>
                      <td className="px-4 py-2" colSpan={sessionUser?.role === 'gestor' ? 4 : 3}>
                        <select
                          value={sub.status_contato || 'Não Contatado'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateLead(sub.id, 'status_contato', e.target.value)}
                          className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STATUS_COLORS[sub.status_contato] || STATUS_COLORS['Não Contatado']}`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>{displayLeads.length} CNPJs ({leads.length} emendas)</span>
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs">
              Exportar CSV
            </button>
          </div>
        </div>
      )}

      <LeadSlideOver
        lead={selectedLead}
        allEmendas={selectedLead ? leads.filter(l => l.cnpj === selectedLead.cnpj) : undefined}
        onClose={() => setSelectedLead(null)}
        canModify={sessionUser?.role !== 'visualizador'}
      />

      <LeadAssignmentModal
        cnpj={assignmentModal?.cnpj || null}
        leadNome={assignmentModal?.nome || null}
        currentVendedor={assignmentModal?.currentVendedor || null}
        onClose={() => setAssignmentModal(null)}
        onAssigned={() => {
          setAssignmentModal(null)
          fetchLeads() // refresh list
        }}
      />

      <SaleModal
        open={!!saleModal}
        leadNome={saleModal?.leadNome || ''}
        currentTipoVendedor={saleModal?.tipoVendedor}
        onCancel={() => setSaleModal(null)}
        onConfirm={(data) => {
          if (saleModal) {
            submitFechado(saleModal.leadId, saleModal.leadCnpj, data)
          }
        }}
      />
    </div>
  )
}
