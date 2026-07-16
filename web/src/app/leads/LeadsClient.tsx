'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatCNPJ, formatCompactCurrency, formatCurrency, whatsappMeUrlFromTelefone } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'
import SaleModal from '@/components/SaleModal'
import { CRM_STATUS_SELECT_OPTIONS, formatCrmStatusLabel, isClosedCrmStatus, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'

const STATUS_OPTIONS = CRM_STATUS_SELECT_OPTIONS
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300',
  'Sem Interesse': 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-300',
  'Em Atendimento': 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'Quente': 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-300',
  'Muito Quente': 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  'Proposta Enviada': 'bg-blue-50 dark:bg-blue-500/15 text-[#0072F7]',
  'Em Aprovação': 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'Fechado': 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300',
  'Telefone Invalido': 'bg-gray-50 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400',
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

export default function LeadsClient() {
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
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
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
  }, [search, statusFilter, vendedorFilter])

  useEffect(() => {
    const timer = setTimeout(fetchLeads, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

  const TAG_KEYS: { key: string; label: string; bg: string; text: string; border: string }[] = [
    { key: 'em_execucao', label: 'Em Execução', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { key: 'multi_emenda', label: 'Multi-Emenda', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { key: 'alto_valor', label: 'Alto Valor', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { key: 'novo', label: 'Novo', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { key: 'cliente_existente', label: 'Cliente Existente', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  ]

  function toggleTag(key: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        if (normalizeCrmStatus(l.status_contato) === 'Fechado') {
          return sum + (Number(l.comissao_valor) || 0) + (Number(l.comissao_bonus) || 0)
        }
        return sum
      }, 0)
      const allFechado = cnpjLeads.every(l => normalizeCrmStatus(l.status_contato) === 'Fechado')
      // True if every closed emenda has comissao locked (not just the first emenda)
      const fechadoLeads = cnpjLeads.filter(l => normalizeCrmStatus(l.status_contato) === 'Fechado')
      const allFechadoLocked = fechadoLeads.length > 0 && fechadoLeads.every(l => l.comissao_locked)
      return {
        ...first,
        totalValor,
        totalComissao,
        allFechado,
        allFechadoLocked,
        emenda_count: cnpjLeads.length,
        subLeads: cnpjLeads, // all emendas for cascade (including first)
        // Tags computed client-side
        tag_em_execucao: (first.executed_count ?? 0) > 0,
        tag_multi_emenda: cnpjLeads.length >= 2,
        tag_alto_valor: totalValor >= 500000,
        tag_novo: isNewLead(first.created_at),
        tag_cliente_existente: !!first.is_existing_client,
      }
    })

    // Client filter
    if (clientFilter === 'existing') {
      result = result.filter(l => l.is_existing_client)
    } else if (clientFilter === 'new') {
      result = result.filter(l => !l.is_existing_client)
    }

    // Tag filter
    if (activeTags.size > 0) {
      const tagsArr = Array.from(activeTags)
      result = result.filter(r =>
        tagsArr.some(tag => {
          const field = `tag_${tag}` as keyof typeof r
          return r[field]
        })
      )
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
  }, [leads, clientFilter, sortCol, sortDir, activeTags])

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
    if (sortCol !== col) return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>
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

      // If status is changing to the closed stage, open SaleModal instead of proceeding directly
      if (field === 'status_contato' && isClosedCrmStatus(value)) {
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
      alert('Erro de conexão ao salvar. Recarregue a página e tente novamente.')
    }
  }

  async function submitFechado(
    leadId: number,
    leadCnpj: string,
    saleData: { valor_venda: number; tipo_vendedor: string; status_contato?: string }
  ) {
    try {
      const targetStatus = saleData.status_contato || 'Vendas Concluídas'
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

  const isCoordinator = sessionUser?.role === 'coordenador'
  const canExportCSV = sessionUser?.role === 'gestor' || sessionUser?.role === 'admin' || isCoordinator
  const coordinatorHasCommercialFilter = vendedorFilter !== '' && vendedorFilter !== 'unassigned'
  const exportDisabled = isCoordinator && !coordinatorHasCommercialFilter

  function buildExportHref(kind?: 'pendentes') {
    const params = new URLSearchParams()
    if (kind === 'pendentes') params.set('filter', 'pendentes')
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
    const query = params.toString()
    return query ? `/api/leads/export-pendentes?${query}` : '/api/leads/export-pendentes'
  }

  function exportCSV() {
    if (exportDisabled) {
      alert('Selecione um comercial para exportar.')
      return
    }
    const a = document.createElement('a')
    a.href = buildExportHref()
    a.click()
  }

  function exportPendentesCSV() {
    if (exportDisabled) {
      alert('Selecione um comercial para exportar pendentes.')
      return
    }
    const a = document.createElement('a')
    a.href = buildExportHref('pendentes')
    a.click()
  }

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900 dark:text-gray-100">Lista de Leads</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#0072F7] transition-colors"
      />

      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#0072F7]">
          <option value="">Todos Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
          <>
            <select value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#0072F7]">
              <option value="">Todos Vendedores</option>
              <option value="unassigned">Não atribuídos</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
            </select>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#0072F7]">
              <option value="">Todos Clientes</option>
              <option value="existing">Clientes Existentes</option>
              <option value="new">Novos Clientes</option>
            </select>
          </>
        )}
      </div>

      {/* Tag filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-1">Tags:</span>
        {TAG_KEYS.map(tag => {
          const active = activeTags.has(tag.key)
          return (
            <button
              key={tag.key}
              onClick={() => toggleTag(tag.key)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? `${tag.bg} ${tag.text} ${tag.border} ring-2 ring-offset-1 ring-current`
                  : 'bg-gray-50 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {tag.label}
              {active && (
                <span className="ml-1 text-[10px]">&times;</span>
              )}
            </button>
          )
        })}
        {activeTags.size > 0 && (
          <button
            onClick={() => setActiveTags(new Set())}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline ml-1"
          >
            Limpar
          </button>
        )}
      </div>

      {/* mirrors canExportContacts() in dal.ts */}
      {canExportCSV && (
        <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
          <button
            onClick={exportPendentesCSV}
            disabled={exportDisabled}
            title={exportDisabled ? 'Selecione um comercial para exportar.' : undefined}
            className="px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-500/15 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Exportar Pendentes CSV
          </button>
          <button
            onClick={exportCSV}
            disabled={exportDisabled}
            title={exportDisabled ? 'Selecione um comercial para exportar.' : undefined}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Exportar CSV
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-400 dark:text-gray-500">Carregando leads...</div>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-[1050px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th onClick={() => handleSort('nome')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Instituição<SortIcon col="nome" /></th>
                  <th onClick={() => handleSort('valor')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Valor<SortIcon col="valor" /></th>
                  <th onClick={() => handleSort('orgao')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Ministério<SortIcon col="orgao" /></th>
                  <th onClick={() => handleSort('local')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Local<SortIcon col="local" /></th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Contato</th>
                  <th onClick={() => handleSort('dias')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Ult. Contato<SortIcon col="dias" /></th>
                  <th onClick={() => handleSort('status')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">Status<SortIcon col="status" /></th>
                  {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
                    <th onClick={() => handleSort('vendedor')} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                      Responsável
                      <SortIcon col="vendedor" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayLeads.map(lead => {
                  const hasContact = lead.telefone || lead.email
                  const contatoWaUrl = lead.telefone ? whatsappMeUrlFromTelefone(lead.telefone) : null
                  const isExpanded = expandedCnpjs.has(lead.cnpj)
                  const hasMultipleEmendas = lead.emenda_count > 1
                  const totalComissao = (lead as any).totalComissao || 0
                  const allFechadoLocked = (lead as any).allFechadoLocked || false
                  return (
                  <React.Fragment key={lead.cnpj}>
                  <tr
                    onClick={() => handleOpenLead(lead)}
                    className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                      lead.is_max_priority ? 'bg-red-50 dark:bg-red-500/10' :
                      !hasContact ? 'bg-red-50/50 dark:bg-red-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <div className="flex items-start gap-1.5">
                        {hasMultipleEmendas && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(lead.cnpj) }}
                            className="mt-0.5 text-gray-400 dark:text-gray-500 hover:text-[#0072F7] transition-colors text-xs flex-shrink-0"
                            title={`${lead.emenda_count} emendas`}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-900 dark:text-gray-100 font-medium text-sm leading-tight whitespace-normal break-words">
                              {lead.nome || '-'}
                            </span>
                            <a
                              href={`/lead/${encodeURIComponent(lead.cnpj)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-[#0072F7] transition-colors"
                              title="Abrir em nova aba"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                            </a>
                            {lead.is_existing_client && (
                              <span className="text-[10px] bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/30">
                                CLIENTE
                              </span>
                            )}
                            {isNewLead(lead.created_at) && (
                              <span className="text-[10px] bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-500/30 font-semibold">
                                NOVO
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 block">{formatCNPJ(lead.cnpj)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {totalComissao > 0 ? (
                        <div>
                          <span className="text-green-600 font-semibold text-sm">
                            {formatCompactCurrency(totalComissao)}
                          </span>
                          {allFechadoLocked && (
                            <span className="inline-block ml-1 text-green-500 align-middle" title="Comissão confirmada">
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z"/></svg>
                            </span>
                          )}
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                            comissao{allFechadoLocked ? <span className="ml-1 text-green-500">Confirmada</span> : null}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-sigma-neon font-semibold text-sm">
                            {formatCompactCurrency((lead as any).totalValor || Number(lead.valor_emenda) || 0)}
                          </span>
                          {hasMultipleEmendas && (
                            <span className="ml-1 text-gray-400 dark:text-gray-500 text-xs">({lead.emenda_count})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <div className="text-gray-600 dark:text-gray-300 text-xs leading-tight whitespace-normal break-words">{lead.orgao_concedente || '-'}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-gray-600 dark:text-gray-300 text-xs">
                        {lead.uf && lead.municipio ? `${lead.municipio}, ${lead.uf}` : lead.uf || lead.municipio || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      {hasContact ? (
                        <div className="space-y-0.5">
                          {lead.telefone && (
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-300 truncate">
                              {lead.principal_telefone_status === 'valido' && (
                                <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1 flex-shrink-0" title="Telefone valido" />
                              )}
                              {lead.principal_telefone_status === 'invalido' && (
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1 flex-shrink-0" title="Telefone invalido" />
                              )}
                              {lead.principal_telefone_status === 'nao_atende' && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1 flex-shrink-0" title="Nao atende" />
                              )}
                              {contatoWaUrl ? (
                                <a
                                  href={contatoWaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-green-600 hover:text-green-700 truncate"
                                  title="Conversar no WhatsApp"
                                >
                                  {lead.telefone}
                                </a>
                              ) : (
                                <span className="truncate">{lead.telefone}</span>
                              )}
                            </div>
                          )}
                          {lead.email && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{lead.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500/70">Sem contato</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {lead.days_since_last_contact == null ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">Nunca</span>
                      ) : lead.days_since_last_contact <= 2 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{lead.days_since_last_contact}d</span>
                      ) : lead.days_since_last_contact <= 7 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{lead.days_since_last_contact}d</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300">{lead.days_since_last_contact}d</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={formatCrmStatusLabel(lead.status_contato)}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateLead(lead.id, 'status_contato', e.target.value)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border-0 cursor-pointer ${STATUS_COLORS[normalizeCrmStatus(lead.status_contato)] || STATUS_COLORS['Não Contatado']}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {(sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador') && (
                      <td className="px-3 py-2.5">
                        {sessionUser?.role === 'gestor' ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{lead.vendedor_nome || '-'}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAssignmentModal({
                                    cnpj: lead.cnpj,
                                    nome: lead.nome,
                                    currentVendedor: lead.vendedor_nome || null
                                  })
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-50 hover:text-[#0072F7] transition-colors"
                              >
                                {lead.vendedor_nome ? '↻' : '+'}
                              </button>
                            </div>
                            {lead.closer_id && normalizeCrmStatus(lead.status_contato) === 'Em Aprovação' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/30 font-semibold">
                                  CLOSER: {lead.closer_nome || 'Paulo'}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{lead.vendedor_nome || '-'}</span>
                            {lead.closer_id && normalizeCrmStatus(lead.status_contato) === 'Em Aprovação' && (
                              <span className="text-[10px] bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-500/30 font-semibold">
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
                      className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2 pl-10">
                        <div className="text-xs">
                          <span className="text-gray-400 dark:text-gray-500 mr-1">↳</span>
                          <span className="text-amber-600 font-medium">{sub.parlamentar || '-'}</span>
                          {sub.nr_emenda && (
                            <span className="text-gray-400 dark:text-gray-500 ml-1.5 text-[10px]">#{sub.nr_emenda}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {normalizeCrmStatus(sub.status_contato) === 'Fechado' && (Number(sub.comissao_valor) || 0) > 0 ? (
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
                        <div className="text-gray-400 dark:text-gray-500 text-xs">{sub.orgao_concedente || '-'}</div>
                      </td>
                      <td className="px-4 py-2" colSpan={sessionUser?.role === 'gestor' || sessionUser?.role === 'coordenador' ? 5 : 4}>
                        <select
                          value={formatCrmStatusLabel(sub.status_contato)}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateLead(sub.id, 'status_contato', e.target.value)}
                          className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STATUS_COLORS[normalizeCrmStatus(sub.status_contato)] || STATUS_COLORS['Não Contatado']}`}
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

          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
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
        isExclusivo={saleModal?.tipoVendedor === 'In-Sites Sells' || saleModal?.tipoVendedor === 'Exclusivo'}
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
