'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'
import SaleModal from '@/components/SaleModal'
import WhatsAppAction from '@/components/WhatsAppAction'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  FilterChip,
  LastContactBadge,
  OpenCardLink,
  PhoneStatusDot,
  SortHeader,
  StatusSelect,
  TAG_TONE,
  Tag,
  inputClass,
  selectClass,
  thClass,
} from '@/components/leads/list-ui'
import { CRM_STATUS_SELECT_OPTIONS, formatCrmStatusLabel, isClosedCrmStatus, isManagementCrmStatus, normalizeCrmStatus } from '@/lib/crm-catalog'
import { canEditLeads, canReopenClosedSale, hasTeamCommercialView } from '@/lib/roles'
import { abreModalDeVenda } from '@/lib/lead-timeline'

const STATUS_OPTIONS = CRM_STATUS_SELECT_OPTIONS

const TAG_KEYS: { key: string; label: string; tone: keyof typeof TAG_TONE }[] = [
  { key: 'em_execucao', label: 'Em execução', tone: 'emerald' },
  { key: 'multi_emenda', label: 'Várias emendas', tone: 'sky' },
  { key: 'alto_valor', label: 'Alto valor', tone: 'violet' },
  { key: 'novo', label: 'Novo', tone: 'amber' },
  { key: 'cliente_existente', label: 'Cliente', tone: 'rose' },
]

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

// Aba Aprovação da página Leads: emendas agrupadas por CNPJ.
export default function LeadsClient() {
  const toast = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [selectedLead, setSelectedLead] = useState<VendedorProjeto | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status_contato') || '')
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [recentOnly, setRecentOnly] = useState(() => ['recent', 'latest'].includes(searchParams.get('sync') ?? ''))
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
    contratoAssinado: boolean
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
    if (sessionUser?.role === 'gestor' || sessionUser?.role === 'diretoria' || sessionUser?.role === 'coordenador') {
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
    if (recentOnly) params.set('sync', 'recent')
    params.set('limit', '10000')

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
      toast.error('Não foi possível carregar os leads. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, vendedorFilter, recentOnly, toast])

  useEffect(() => {
    const timer = setTimeout(fetchLeads, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

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
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
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
      if (field === 'status_contato' && abreModalDeVenda(lead.status_contato, value)) {
        setSaleModal({
          leadId: id,
          leadCnpj: lead.cnpj,
          leadNome: lead.nome || 'Sem nome',
          tipoVendedor: lead.tipo_vendedor,
          contratoAssinado: !!lead.contrato_assinado,
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
        toast.error(`Não foi possível atualizar: ${errData.error || 'falha no servidor'}.`)
        return
      }
      const data = await res.json().catch(() => ({}))
      setLeads(prev => prev.map(l =>
        l.id === id ? {
          ...l,
          [field]: data.status_contato ?? value,
          ...(data.venda_etapa != null ? { venda_etapa: data.venda_etapa } : {}),
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : l
      ))
    } catch (err) {
      console.error('Failed to update lead:', err)
      toast.error('Sem conexão para salvar. Recarregue a página e tente de novo.')
    }
  }

  async function submitFechado(
    leadId: number,
    leadCnpj: string,
    saleData: { valor_venda: number; status_contato?: string; contrato_assinado?: boolean; tipo_servico: string }
  ) {
    try {
      const targetStatus = saleData.status_contato || 'Vendas Aprovação'
      const body: Record<string, unknown> = {
        id: leadId,
        status_contato: targetStatus,
        valor_venda: saleData.valor_venda,
        tipo_servico: saleData.tipo_servico,
      }
      if (saleData.contrato_assinado !== undefined) {
        body.contrato_assinado = saleData.contrato_assinado
      }
      const res = await fetch(`/api/leads/${encodeURIComponent(leadCnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error(`Não foi possível registrar a venda: ${errData.error || 'falha no servidor'}.`)
        return
      }
      const data = await res.json().catch(() => ({}))
      setLeads(prev => prev.map(l =>
        l.id === leadId ? {
          ...l,
          status_contato: targetStatus,
          valor_venda: saleData.valor_venda,
          tipo_servico: saleData.tipo_servico as VendedorProjeto['tipo_servico'],
          ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
          ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
          ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
        } : l
      ))
      setSaleModal(null)
    } catch (err) {
      console.error('Failed to submit fechado:', err)
      toast.error('Sem conexão para registrar a venda. Tente de novo.')
    }
  }

  const role = sessionUser?.role
  const isCoordinator = role === 'coordenador'
  const showsOwner = hasTeamCommercialView(role) || isCoordinator
  const canAssign = hasTeamCommercialView(role)
  const canEdit = canEditLeads(role ?? '')
  // Venda fechada só volta atrás pela gestão; os demais veem o status travado.
  const statusLocked = (status: string | null | undefined) =>
    !canEdit || (normalizeCrmStatus(status) === 'Fechado' && !canReopenClosedSale(role ?? ''))
  const statusOptions = role === 'vendedor' || isCoordinator ? STATUS_OPTIONS.filter(s => !isManagementCrmStatus(s)) : STATUS_OPTIONS
  const canExportCSV = hasTeamCommercialView(role) || role === 'admin' || isCoordinator
  const coordinatorHasCommercialFilter = vendedorFilter !== '' && vendedorFilter !== 'unassigned'
  const exportDisabled = isCoordinator && !coordinatorHasCommercialFilter
  const hasFilters = !!(search || statusFilter || vendedorFilter || clientFilter || activeTags.size > 0 || recentOnly)
  const sortProps = { sortCol, sortDir, onSort: handleSort }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setVendedorFilter('')
    setClientFilter('')
    setActiveTags(new Set())
    setRecentOnly(false)
    router.replace('/leads')
  }

  function buildExportHref(kind?: 'pendentes') {
    const params = new URLSearchParams()
    if (kind === 'pendentes') params.set('filter', 'pendentes')
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
    const query = params.toString()
    return query ? `/api/leads/export-pendentes?${query}` : '/api/leads/export-pendentes'
  }

  function download(kind?: 'pendentes') {
    if (exportDisabled) {
      toast.show('Escolha um comercial no filtro para exportar.')
      return
    }
    const a = document.createElement('a')
    a.href = buildExportHref(kind)
    a.click()
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:min-w-[240px] sm:flex-1">
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="search"
            aria-label="Buscar por CNPJ ou nome"
            placeholder="Buscar por CNPJ ou nome"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {showsOwner && (
          <>
            <select aria-label="Vendedor" value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)} className={selectClass}>
              <option value="">Todos os vendedores</option>
              <option value="unassigned">Sem dono</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
            </select>
            <select aria-label="Tipo de cliente" value={clientFilter} onChange={e => setClientFilter(e.target.value)} className={selectClass}>
              <option value="">Clientes e novos</option>
              <option value="existing">Só clientes</option>
              <option value="new">Só novos</option>
            </select>
          </>
        )}
      </div>

      {recentOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span>
            <strong>Entradas dos últimos 7 dias:</strong>{' '}
            {loading ? 'carregando…' : `${displayLeads.length} instituições, ${leads.length} emendas`}.
            {' '}Responsáveis existentes são preservados; Rooger decide mudanças na distribuição.
          </span>
          <Button size="sm" variant="ghost" onClick={clearFilters}>Ver todos</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-xs text-ink-3">Tags</span>
        {TAG_KEYS.map(tag => (
          <FilterChip
            key={tag.key}
            label={tag.label}
            active={activeTags.has(tag.key)}
            activeClass={TAG_TONE[tag.tone]}
            onClick={() => toggleTag(tag.key)}
          />
        ))}
        {activeTags.size > 0 && (
          <button type="button" onClick={() => setActiveTags(new Set())} className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Limpar tags
          </button>
        )}
        {/* mirrors canExportContacts() in dal.ts */}
        {canExportCSV && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => download('pendentes')} disabled={exportDisabled} title={exportDisabled ? 'Escolha um comercial no filtro para exportar.' : undefined}>
              Exportar pendentes
            </Button>
            <Button size="sm" onClick={() => download()} disabled={exportDisabled} title={exportDisabled ? 'Escolha um comercial no filtro para exportar.' : undefined}>
              Exportar CSV
            </Button>
          </div>
        )}
      </div>

      {loading && leads.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <SkeletonRows rows={8} />
        </div>
      ) : displayLeads.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title={hasFilters ? 'Nenhum lead com esses filtros' : role === 'vendedor' ? 'Você ainda não tem leads' : 'Nenhum lead no funil de aprovação'}
            description={hasFilters ? 'Tire algum filtro para ver mais resultados.' : role === 'vendedor' ? 'Quando o gestor distribuir leads para você, eles aparecem aqui.' : 'Os leads chegam pela sincronização diária das emendas.'}
            action={hasFilters ? <Button size="sm" onClick={clearFilters}>Limpar filtros</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <div className={`relative overflow-x-auto rounded-xl border border-line bg-surface transition-opacity duration-fast ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b border-line bg-raised/60">
                <tr>
                  <SortHeader col="nome" label="Instituição" {...sortProps} />
                  <SortHeader col="valor" label="Valor" {...sortProps} />
                  <SortHeader col="orgao" label="Ministério" {...sortProps} />
                  <SortHeader col="local" label="Local" {...sortProps} />
                  <th className={thClass}>Contato</th>
                  <SortHeader col="dias" label="Último contato" {...sortProps} />
                  <SortHeader col="status" label="Status" {...sortProps} />
                  {showsOwner && <SortHeader col="vendedor" label="Responsável" {...sortProps} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {displayLeads.map(lead => {
                  const hasContact = lead.telefone || lead.email
                  const isExpanded = expandedCnpjs.has(lead.cnpj)
                  const hasMultipleEmendas = lead.emenda_count > 1
                  const totalComissao = lead.totalComissao || 0
                  const allFechadoLocked = lead.allFechadoLocked || false
                  const showCloser = !!lead.closer_id && normalizeCrmStatus(lead.status_contato) === 'Em Aprovação'
                  return (
                  <React.Fragment key={lead.cnpj}>
                  <tr
                    onClick={() => handleOpenLead(lead)}
                    className={`cursor-pointer align-top transition-colors duration-fast hover:bg-raised ${
                      lead.is_max_priority ? 'bg-red-50/70 dark:bg-red-500/[0.08]' :
                      !hasContact ? 'bg-red-50/40 dark:bg-red-500/[0.05]' : ''
                    }`}
                  >
                    <td className="max-w-[300px] px-3 py-2.5">
                      <div className="flex items-start gap-1.5">
                        {hasMultipleEmendas && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(lead.cnpj) }}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Esconder' : 'Mostrar'} as ${lead.emenda_count} emendas`}
                            className="mt-0.5 shrink-0 rounded p-0.5 text-ink-3 transition-colors duration-fast hover:bg-line/60 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                          >
                            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 transition-transform duration-base ease-out-quart ${isExpanded ? 'rotate-90' : ''}`}>
                              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium leading-snug text-ink">{lead.nome || 'Sem nome'}</span>
                            <OpenCardLink cnpj={lead.cnpj} />
                            {lead.is_existing_client && <Tag tone="rose">Cliente</Tag>}
                            {(recentOnly || isNewLead(lead.created_at)) && <Tag tone="amber">Novo</Tag>}
                          </div>
                          <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{formatCNPJ(lead.cnpj)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {totalComissao > 0 ? (
                        <div>
                          <span className="font-semibold tabular text-emerald-700 dark:text-emerald-300">{formatCompactCurrency(totalComissao)}</span>
                          <span className="block text-[11px] text-ink-3">
                            Comissão{allFechadoLocked ? ' confirmada' : ''}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-semibold tabular text-ink">{formatCompactCurrency(lead.totalValor || Number(lead.valor_emenda) || 0)}</span>
                          {hasMultipleEmendas && <span className="ml-1 text-xs text-ink-3">({lead.emenda_count})</span>}
                        </div>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 text-xs leading-snug text-ink-2">{lead.orgao_concedente || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-2">
                      {lead.uf && lead.municipio ? `${lead.municipio}, ${lead.uf}` : lead.uf || lead.municipio || '-'}
                    </td>
                    <td className="max-w-[210px] px-3 py-2.5">
                      {hasContact ? (
                        <div className="space-y-0.5">
                          {lead.telefone && (
                            <div className="flex items-center gap-1 truncate text-xs text-ink-2">
                              <PhoneStatusDot status={lead.principal_telefone_status} />
                              <span className="truncate">{lead.telefone}</span>
                              <WhatsAppAction telefone={lead.telefone} cnpj={lead.cnpj} compact label="WA" onClick={e => e.stopPropagation()} />
                            </div>
                          )}
                          {lead.email && <div className="truncate text-xs text-ink-3">{lead.email}</div>}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-red-700 dark:text-red-300">Sem contato</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5"><LastContactBadge days={lead.days_since_last_contact} /></td>
                    <td className="px-3 py-2.5">
                      <StatusSelect
                        ariaLabel={`Status de ${lead.nome || formatCNPJ(lead.cnpj)}`}
                        status={normalizeCrmStatus(lead.status_contato)}
                        label={formatCrmStatusLabel(lead.status_contato, lead.venda_etapa)}
                        options={statusOptions}
                        disabled={statusLocked(lead.status_contato)}
                        onChange={value => updateLead(lead.id, 'status_contato', value)}
                      />
                    </td>
                    {showsOwner && (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
                            {lead.vendedor_nome || <span className="text-ink-3">Sem dono</span>}
                            {canAssign && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAssignmentModal({ cnpj: lead.cnpj, nome: lead.nome, currentVendedor: lead.vendedor_nome || null })
                                }}
                                className="rounded px-1 text-xs font-medium text-accent-ink opacity-70 transition-opacity duration-fast hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50"
                              >
                                {lead.vendedor_nome ? 'Trocar' : 'Atribuir'}
                              </button>
                            )}
                          </div>
                          {showCloser && <Tag tone="violet">{canAssign ? `Closer: ${lead.closer_nome || 'Paulo'}` : 'Closer'}</Tag>}
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Emendas do mesmo CNPJ */}
                  {isExpanded && lead.subLeads.map(sub => (
                    <tr
                      key={sub.id}
                      onClick={() => handleOpenLead(sub)}
                      className="cursor-pointer bg-raised/40 transition-colors duration-fast hover:bg-raised"
                    >
                      <td className="px-3 py-2 pl-10">
                        <div className="text-xs">
                          <span className="font-medium text-ink">{sub.parlamentar || 'Sem parlamentar'}</span>
                          {sub.nr_emenda && <span className="ml-1.5 text-[11px] text-ink-3">#{sub.nr_emenda}</span>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs tabular">
                        {normalizeCrmStatus(sub.status_contato) === 'Fechado' && (Number(sub.comissao_valor) || 0) > 0 ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">
                            {formatCompactCurrency((Number(sub.comissao_valor) || 0) + (Number(sub.comissao_bonus) || 0))}
                          </span>
                        ) : (
                          <span className="font-medium text-ink-2">{formatCompactCurrency(Number(sub.valor_emenda) || 0)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-3">{sub.orgao_concedente || '-'}</td>
                      <td className="px-3 py-2" colSpan={showsOwner ? 5 : 4}>
                        <StatusSelect
                          ariaLabel={`Status da emenda ${sub.nr_emenda || sub.id}`}
                          status={normalizeCrmStatus(sub.status_contato)}
                          label={formatCrmStatusLabel(sub.status_contato, sub.venda_etapa)}
                          options={statusOptions}
                          disabled={statusLocked(sub.status_contato)}
                          onChange={value => updateLead(sub.id, 'status_contato', value)}
                        />
                      </td>
                    </tr>
                  ))}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-ink-3">
            {displayLeads.length.toLocaleString('pt-BR')} CNPJs ({leads.length.toLocaleString('pt-BR')} emendas)
          </p>
        </>
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
        canModify={canEdit}
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
        userRole={role || null}
        isExclusivo={saleModal?.tipoVendedor === 'In-Sites Sells' || saleModal?.tipoVendedor === 'Exclusivo'}
        leadContratoAssinado={saleModal?.contratoAssinado}
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
