'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatCNPJ, formatCompactCurrency, formatCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'
import SaleModal from '@/components/SaleModal'

const STATUS_OPTIONS = ['Não Contatado', 'Ainda Não', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado', 'Telefone Invalido']
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 text-orange-600',
  'Ainda Não': 'bg-yellow-50 text-yellow-600',
  'Retorno': 'bg-amber-50 text-amber-600',
  'Proposta': 'bg-blue-50 text-[#0072F7]',
  'Aguardando Closer': 'bg-purple-50 text-purple-600',
  'Fechado': 'bg-green-50 text-green-600',
  'Telefone Invalido': 'bg-gray-50 text-gray-500',
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
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [selectedLead, setSelectedLead] = useState<VendedorProjeto | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status_contato') || '')
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
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const scrollPositionRef = useRef<number>(0)

  // Restore scroll position when returning from lead detail page (browser Back).
  // Runs after leads finish loading so the page has enough content to scroll to.
  useEffect(() => {
    if (loading) return
    const saved = sessionStorage.getItem('leads_scroll_position')
    if (saved) {
      const pos = parseInt(saved, 10)
      sessionStorage.removeItem('leads_scroll_position')
      // Double rAF ensures we restore after React's full commit + paint cycle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: pos, behavior: 'instant' })
        })
      })
    }
  }, [loading])

  // Fetch session
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      if (s?.user) {
        setSessionUser({ role: s.user.role, id: s.user.id })
      }
    }).catch(() => {})
  }, [])

  // Fetch vendedores for gestor/coordenador filter
  useEffect(() => {
    if (sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') {
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
    params.set('limit', '10000')

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, vendedorFilter, sessionUser])

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
      const totalValor = cnpjLeads.reduce((sum, l) => sum + (Number(l.valor_emenda) || 0), 0)
      const totalComissao = cnpjLeads.reduce((sum, l) => {
        if (l.status_contato === 'Fechado') {
          return sum + (Number(l.comissao_valor) || 0) + (Number(l.comissao_bonus) || 0)
        }
        return sum
      }, 0)
      const allFechado = cnpjLeads.every(l => l.status_contato === 'Fechado')
      // True if every Fechado emenda has comissao locked (not just the first emenda)
      const fechadoLeads = cnpjLeads.filter(l => l.status_contato === 'Fechado')
      const allFechadoLocked = fechadoLeads.length > 0 && fechadoLeads.every(l => l.comissao_locked)
      return {
        ...first,
        totalValor,
        totalComissao,
        allFechado,
        allFechadoLocked,
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

    // Sorting
    if (sortCol) {
      result = [...result].sort((a, b) => {
        let va: string | number = ''
        let vb: string | number = ''
        switch (sortCol) {
          case 'nome': va = (a.nome || '').toLowerCase(); vb = (b.nome || '').toLowerCase(); break
          case 'valor': va = (a as any).totalValor || Number(a.valor_emenda) || 0; vb = (b as any).totalValor || Number(b.valor_emenda) || 0; break
          case 'orgao': va = (a.orgao_concedente || '').toLowerCase(); vb = (b.orgao_concedente || '').toLowerCase(); break
          case 'local': va = `${a.uf || ''} ${a.municipio || ''}`.toLowerCase(); vb = `${b.uf || ''} ${b.municipio || ''}`.toLowerCase(); break
          case 'status': va = a.status_contato || ''; vb = b.status_contato || ''; break
          case 'vendedor': va = (a.vendedor_nome || '').toLowerCase(); vb = (b.vendedor_nome || '').toLowerCase(); break
          case 'dias': va = a.days_since_last_contact ?? 9999; vb = b.days_since_last_contact ?? 9999; break
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [leads, clientFilter, sortCol, sortDir])

  function isNewLead(createdAt: string | null): boolean {
    if (!createdAt) return false
    const created = new Date(createdAt)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48h ago
    return created > cutoff
  }

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  function toggleExpand(cnpj: string) {
    setExpandedCnpjs(prev => {
      const next = new Set(prev)
      if (next.has(cnpj)) next.delete(cnpj)
      else next.add(cnpj)
      return next
    })
  }

  function handleOpenLead(lead: VendedorProjeto) {
    const pos = window.scrollY
    scrollPositionRef.current = pos
    sessionStorage.setItem('leads_scroll_position', String(pos))
    setSelectedLead(lead)
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

  async function submitFechado(
    leadId: number,
    leadCnpj: string,
    saleData: { valor_venda: number; tipo_vendedor: string; status_contato?: string }
  ) {
    try {
      const targetStatus = saleData.status_contato || 'Fechado'
      const body = {
        id: leadId,
        status_contato: targetStatus,
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
          status_contato: targetStatus,
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
    const a = document.createElement('a')
    a.href = '/api/leads/export-pendentes'
    a.click()
  }

  function exportPendentesCSV() {
    const a = document.createElement('a')
    a.href = '/api/leads/export-pendentes?filter=pendentes'
    a.click()
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Lista de Leads</h1>
        <p className="text-sm text-gray-500 mt-1">
          {sessionUser?.role === 'vendedor'
            ? 'Seus leads atribuídos'
            : 'Todos os projetos dos vendedores'}
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
        {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
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

      <div className="flex gap-2 justify-end">
        {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
          <button
            onClick={exportPendentesCSV}
            className="px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors text-xs"
          >
            Exportar Pendentes CSV
          </button>
        )}
        <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs">
          Exportar CSV
        </button>
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
                  <th onClick={() => handleSort('nome')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Instituição<SortIcon col="nome" /></th>
                  <th onClick={() => handleSort('valor')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Valor<SortIcon col="valor" /></th>
                  <th onClick={() => handleSort('orgao')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Ministério<SortIcon col="orgao" /></th>
                  <th onClick={() => handleSort('local')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Local<SortIcon col="local" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contato</th>
                  <th onClick={() => handleSort('dias')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Ult. Contato<SortIcon col="dias" /></th>
                  <th onClick={() => handleSort('status')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Status<SortIcon col="status" /></th>
                  {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
                    <th onClick={() => handleSort('vendedor')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">
                      {sessionUser?.role === 'coordenador' ? 'SDR' : 'Vendedor'}
                      <SortIcon col="vendedor" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayLeads.map(lead => {
                  const hasContact = lead.telefone || lead.email
                  const isExpanded = expandedCnpjs.has(lead.cnpj)
                  const hasMultipleEmendas = lead.emenda_count > 1
                  const totalComissao = (lead as any).totalComissao || 0
                  const allFechadoLocked = (lead as any).allFechadoLocked || false
                  return (
                  <React.Fragment key={lead.cnpj}>
                  <tr
                    onClick={() => handleOpenLead(lead)}
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
                            {isNewLead(lead.created_at) && (
                              <span className="ml-2 text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-200 font-semibold">
                                NOVO
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-gray-400 mt-0.5 block">{formatCNPJ(lead.cnpj)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {totalComissao > 0 ? (
                        <div>
                          <span className="text-green-600 font-semibold text-sm">
                            {formatCompactCurrency(totalComissao)}
                          </span>
                          {allFechadoLocked && (
                            <span className="inline-block ml-1 text-green-500 align-middle" title="Comissao confirmada">
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z"/></svg>
                            </span>
                          )}
                          <span className="block text-[10px] text-gray-400">
                            comissao{allFechadoLocked ? <span className="ml-1 text-green-500">Confirmada</span> : null}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sigma-neon font-semibold text-sm">
                            {formatCompactCurrency((lead as any).totalValor || Number(lead.valor_emenda) || 0)}
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
                            <div className="flex items-center text-xs text-gray-600 truncate">
                              {lead.principal_telefone_status === 'valido' && (
                                <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1 flex-shrink-0" title="Telefone valido" />
                              )}
                              {lead.principal_telefone_status === 'invalido' && (
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1 flex-shrink-0" title="Telefone invalido" />
                              )}
                              {lead.principal_telefone_status === 'nao_atende' && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1 flex-shrink-0" title="Nao atende" />
                              )}
                              {lead.telefone}
                            </div>
                          )}
                          {lead.email && (
                            <div className="text-xs text-gray-400 truncate">{lead.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500/70">Sem contato</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.days_since_last_contact == null ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Nunca</span>
                      ) : lead.days_since_last_contact <= 2 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{lead.days_since_last_contact}d</span>
                      ) : lead.days_since_last_contact <= 7 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{lead.days_since_last_contact}d</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{lead.days_since_last_contact}d</span>
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
                    {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
                      <td className="px-4 py-3">
                        {sessionUser?.role === 'gestor' ? (
                          <div className="flex flex-col gap-0.5">
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
                            {lead.closer_id && lead.status_contato === 'Aguardando Closer' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200 font-semibold">
                                  CLOSER: {lead.closer_nome || 'Paulo'}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">{lead.vendedor_nome || '-'}</span>
                            {lead.closer_id && lead.status_contato === 'Aguardando Closer' && (
                              <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-200 font-semibold">
                                CLOSER
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  {/* Cascade sub-rows for multiple emendas */}
                  {isExpanded && lead.subLeads.map(sub => (
                    <tr
                      key={sub.id}
                      onClick={() => handleOpenLead(sub)}
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
                        {sub.status_contato === 'Fechado' && (Number(sub.comissao_valor) || 0) > 0 ? (
                          <span className="text-green-600 font-medium text-xs">
                            {formatCompactCurrency((Number(sub.comissao_valor) || 0) + (Number(sub.comissao_bonus) || 0))}
                          </span>
                        ) : (
                          <span className="text-sigma-neon/70 font-medium text-xs">
                            {formatCompactCurrency(Number(sub.valor_emenda) || 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-gray-400 text-xs">{sub.orgao_concedente || '-'}</div>
                      </td>
                      <td className="px-4 py-2" colSpan={sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador' ? 5 : 4}>
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

          <div className="mt-4 text-sm text-gray-500">
            <span>{displayLeads.length} CNPJs ({leads.length} emendas)</span>
          </div>
        </div>
      )}

      <LeadSlideOver
        lead={selectedLead}
        allEmendas={selectedLead ? leads.filter(l => l.cnpj === selectedLead.cnpj) : undefined}
        onClose={() => {
          const pos = scrollPositionRef.current
          sessionStorage.removeItem('leads_scroll_position')
          setSelectedLead(null)
          // Double rAF: first frame React commits the DOM, second frame we restore scroll
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo({ top: pos, behavior: 'instant' })
            })
          })
        }}
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
        userRole={sessionUser?.role || null}
        isExclusivo={saleModal?.tipoVendedor === 'Exclusivo'}
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
