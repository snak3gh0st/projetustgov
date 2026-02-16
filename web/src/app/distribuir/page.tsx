'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'

interface Vendedor {
  id: string
  nome: string
  email: string
  lead_count: number
}

type Tab = 'unassigned' | 'assigned'

export default function DistribuirPage() {
  const [tab, setTab] = useState<Tab>('unassigned')
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [assignedLeads, setAssignedLeads] = useState<VendedorProjeto[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set())
  const [selectedVendedorId, setSelectedVendedorId] = useState('')
  const [filterVendedorId, setFilterVendedorId] = useState('')
  const [search, setSearch] = useState('')
  const [ufFilter, setUfFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingAssigned, setLoadingAssigned] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [toast, setToast] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads?vendedor_id=unassigned&limit=5000')
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAssignedLeads = useCallback(async () => {
    setLoadingAssigned(true)
    try {
      const res = await fetch('/api/leads?limit=5000')
      const data = await res.json()
      const assigned = (Array.isArray(data) ? data : []).filter(
        (l: VendedorProjeto) => l.vendedor_id !== null
      )
      setAssignedLeads(assigned)
    } catch (err) {
      console.error('Failed to fetch assigned leads:', err)
    } finally {
      setLoadingAssigned(false)
    }
  }, [])

  const fetchVendedores = useCallback(async () => {
    try {
      const res = await fetch('/api/vendedores')
      if (res.ok) {
        const data = await res.json()
        setVendedores(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to fetch vendedores:', err)
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(s => {
      if (s?.user?.role !== 'gestor') {
        window.location.href = '/'
      } else {
        setUserRole('gestor')
      }
    }).catch(() => { window.location.href = '/login' })
  }, [])

  useEffect(() => {
    if (userRole === 'gestor') {
      fetchLeads()
      fetchAssignedLeads()
      fetchVendedores()
    }
  }, [userRole, fetchLeads, fetchAssignedLeads, fetchVendedores])

  // Clear selection when switching tabs
  useEffect(() => {
    setSelectedLeadIds(new Set())
    setSelectedVendedorId('')
    setSearch('')
    setUfFilter('')
  }, [tab])

  // Active leads based on tab
  const activeLeads = tab === 'unassigned' ? leads : assignedLeads

  // Count leads per CNPJ
  const cnpjCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of activeLeads) {
      counts[l.cnpj] = (counts[l.cnpj] || 0) + 1
    }
    return counts
  }, [activeLeads])

  // Compute extra leads that would be auto-included via CNPJ grouping
  const extraByCnpj = useMemo(() => {
    const selectedCnpjs = new Set<string>()
    for (const lead of activeLeads) {
      if (selectedLeadIds.has(lead.id)) {
        selectedCnpjs.add(lead.cnpj)
      }
    }
    let extra = 0
    for (const lead of activeLeads) {
      if (!selectedLeadIds.has(lead.id) && selectedCnpjs.has(lead.cnpj)) {
        extra++
      }
    }
    return extra
  }, [activeLeads, selectedLeadIds])

  // Filtered leads
  const filteredLeads = activeLeads.filter(lead => {
    if (search) {
      const s = search.toLowerCase()
      if (!lead.cnpj.includes(s) && !(lead.nome || '').toLowerCase().includes(s)) return false
    }
    if (ufFilter && lead.uf !== ufFilter) return false
    if (tab === 'assigned' && filterVendedorId && lead.vendedor_id !== filterVendedorId) return false
    return true
  })

  const ufs = Array.from(new Set(activeLeads.map(l => l.uf).filter((v): v is string => Boolean(v)))).sort()

  // Group assigned leads by vendedor for summary cards
  const assignedByVendedor = useMemo(() => {
    const groups: Record<string, { nome: string; count: number }> = {}
    for (const l of assignedLeads) {
      const vid = l.vendedor_id || 'unknown'
      if (!groups[vid]) {
        groups[vid] = { nome: l.vendedor_nome || 'Desconhecido', count: 0 }
      }
      groups[vid].count++
    }
    return groups
  }, [assignedLeads])

  function toggleLead(id: number) {
    setSelectedLeadIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map(l => l.id)))
    }
  }

  async function handleAssign() {
    if (selectedLeadIds.size === 0 || !selectedVendedorId) return
    setAssigning(true)
    try {
      const res = await fetch('/api/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: Array.from(selectedLeadIds),
          vendedor_id: selectedVendedorId,
          ...(tab === 'assigned' ? { reassign: true } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const total = data.assigned_count ?? selectedLeadIds.size
        const extra = data.extra_by_cnpj ?? 0
        const warnings: string[] = data.warnings ?? []
        const action = tab === 'assigned' ? 'redistribuidos' : 'atribuidos'
        let msg = `${total} leads ${action} com sucesso!`
        if (extra > 0) {
          msg += ` (${extra} adicionais por agrupamento CNPJ)`
        }
        if (warnings.length > 0) {
          msg += ` | Avisos: ${warnings.join('; ')}`
        }
        setToast(msg)
        setSelectedLeadIds(new Set())
        fetchLeads()
        fetchAssignedLeads()
        fetchVendedores()
        setTimeout(() => setToast(''), 5000)
      } else {
        setToast('Erro ao atribuir leads')
        setTimeout(() => setToast(''), 3000)
      }
    } catch {
      setToast('Erro ao atribuir leads')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setAssigning(false)
    }
  }

  async function handleUnassign() {
    if (selectedLeadIds.size === 0) return
    setAssigning(true)
    try {
      // Get unique CNPJs from selected leads
      const selectedCnpjs = new Set<string>()
      for (const lead of assignedLeads) {
        if (selectedLeadIds.has(lead.id)) {
          selectedCnpjs.add(lead.cnpj)
        }
      }
      const cnpjArray = Array.from(selectedCnpjs)

      let totalUnassigned = 0
      for (const cnpj of cnpjArray) {
        const res = await fetch('/api/leads/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cnpj, unassign: true }),
        })
        if (res.ok) totalUnassigned++
      }

      setToast(`${totalUnassigned} CNPJ(s) desatribuidos com sucesso!`)
      setSelectedLeadIds(new Set())
      fetchLeads()
      fetchAssignedLeads()
      fetchVendedores()
      setTimeout(() => setToast(''), 5000)
    } catch {
      setToast('Erro ao desatribuir leads')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setAssigning(false)
    }
  }

  if (userRole !== 'gestor') {
    return <div className="flex items-center justify-center py-20 text-gray-500">Verificando permissoes...</div>
  }

  const isLoading = tab === 'unassigned' ? loading : loadingAssigned

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Distribuir Leads</h1>
        <p className="text-sm text-gray-400 mt-1">
          {tab === 'unassigned'
            ? 'Atribua leads nao atribuidos aos vendedores'
            : 'Visualize e redistribua leads ja atribuidos'
          }
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-50 border border-gray-200 p-1 w-fit">
        <button
          onClick={() => setTab('unassigned')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'unassigned'
              ? 'bg-blue-50 text-[#0072F7] border border-blue-200'
              : 'text-gray-400 hover:text-gray-800 border border-transparent'
          }`}
        >
          Nao Atribuidos
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'unassigned' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'
          }`}>
            {leads.length}
          </span>
        </button>
        <button
          onClick={() => setTab('assigned')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'assigned'
              ? 'bg-blue-50 text-[#0072F7] border border-blue-200'
              : 'text-gray-400 hover:text-gray-800 border border-transparent'
          }`}
        >
          Distribuidos
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'assigned' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'
          }`}>
            {assignedLeads.length}
          </span>
        </button>
      </div>

      {/* Vendedor cards - for unassigned tab: target selection; for assigned tab: summary */}
      {tab === 'unassigned' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {vendedores.map(v => (
            <div
              key={v.id}
              onClick={() => setSelectedVendedorId(v.id)}
              className={`rounded-xl p-3 border cursor-pointer transition-all ${
                selectedVendedorId === v.id
                  ? 'border-[#0072F7] bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 truncate">{v.nome}</p>
              <p className="text-xs text-gray-400 mt-0.5">{v.email}</p>
              <p className="text-xs text-[#0072F7] mt-1">{v.lead_count} leads</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {vendedores.map(v => {
            const info = assignedByVendedor[v.id]
            const count = info?.count || 0
            const isFiltered = filterVendedorId === v.id
            return (
              <div
                key={v.id}
                onClick={() => setFilterVendedorId(isFiltered ? '' : v.id)}
                className={`rounded-xl p-3 border cursor-pointer transition-all ${
                  isFiltered
                    ? 'border-[#0072F7] bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{v.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">{v.email}</p>
                <p className="text-xs text-[#0072F7] mt-1">{count} leads atribuidos</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por CNPJ ou nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
        />
        <select
          value={ufFilter}
          onChange={e => setUfFilter(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
        >
          <option value="">Todas UFs</option>
          {ufs.map(uf => <option key={uf} value={uf!}>{uf}</option>)}
        </select>
        {tab === 'assigned' && (
          <select
            value={filterVendedorId}
            onChange={e => setFilterVendedorId(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
          >
            <option value="">Todos Vendedores</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        )}
      </div>

      {/* CNPJ grouping note */}
      {extraByCnpj > 0 && selectedLeadIds.size > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2.5 text-sm text-blue-700">
          {extraByCnpj} lead{extraByCnpj > 1 ? 's' : ''} adicional{extraByCnpj > 1 ? 'is' : ''} do mesmo CNPJ ser{extraByCnpj > 1 ? 'ao' : 'a'} incluido{extraByCnpj > 1 ? 's' : ''} automaticamente
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          {tab === 'unassigned'
            ? 'Nenhum lead pendente de atribuicao'
            : filterVendedorId
              ? 'Nenhum lead atribuido a este vendedor'
              : 'Nenhum lead distribuido ainda'
          }
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && selectedLeadIds.size === filteredLeads.length}
                    onChange={toggleAll}
                    className="rounded border-gray-600 bg-transparent text-blue-500 focus:ring-blue-500/30"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">CNPJ</th>
                {tab === 'assigned' && (
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Vendedor</th>
                )}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Leads</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nome</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Programa</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Valor Emenda</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => toggleLead(lead.id)}
                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer ${
                    selectedLeadIds.has(lead.id) ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-gray-600 bg-transparent text-blue-500 focus:ring-blue-500/30"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">{formatCNPJ(lead.cnpj)}</td>
                  {tab === 'assigned' && (
                    <td className="px-3 py-2 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-[#0072F7] border border-blue-200">
                        {lead.vendedor_nome || '-'}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs">
                    {cnpjCounts[lead.cnpj] > 1 ? (
                      <span className="text-[#0072F7] font-medium">{cnpjCounts[lead.cnpj]} leads</span>
                    ) : (
                      <span className="text-gray-500">1</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[180px]">{lead.nome || '-'}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[150px]">{lead.nome_programa || '-'}</td>
                  <td className="px-3 py-2 text-[#0072F7] text-xs">{formatCompactCurrency(lead.valor_emenda)}</td>
                  <td className="px-3 py-2 text-gray-600">{lead.uf || '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {tab === 'assigned' ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        lead.status_contato === 'Fechado'
                          ? 'bg-green-50 text-green-600 border border-green-200'
                          : lead.status_contato === 'Proposta'
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : lead.status_contato === 'Retorno'
                              ? 'bg-blue-50 text-[#0072F7] border border-blue-200'
                              : 'bg-gray-50 text-gray-400 border border-gray-200'
                      }`}>
                        {lead.status_contato}
                      </span>
                    ) : (
                      <span className="text-gray-500">{lead.municipio || '-'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white/90 backdrop-blur-md px-4 py-3 shadow-sm">
        <span className="text-sm text-gray-400">
          {selectedLeadIds.size > 0
            ? `${selectedLeadIds.size} leads selecionados${extraByCnpj > 0 ? ` (+${extraByCnpj} por CNPJ)` : ''}`
            : tab === 'unassigned'
              ? `${filteredLeads.length} leads nao atribuidos`
              : `${filteredLeads.length} leads distribuidos`
          }
        </span>
        <div className="flex items-center gap-3">
          {tab === 'assigned' && selectedLeadIds.size > 0 && (
            <button
              onClick={handleUnassign}
              disabled={assigning}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {assigning ? 'Removendo...' : 'Desatribuir'}
            </button>
          )}
          <select
            value={selectedVendedorId}
            onChange={e => setSelectedVendedorId(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
          >
            <option value="">{tab === 'assigned' ? 'Redistribuir para...' : 'Selecione vendedor...'}</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={selectedLeadIds.size === 0 || !selectedVendedorId || assigning}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#0072F7] text-white hover:bg-[#0058C4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {assigning
              ? (tab === 'assigned' ? 'Redistribuindo...' : 'Atribuindo...')
              : tab === 'assigned'
                ? `Redistribuir ${selectedLeadIds.size + extraByCnpj} leads`
                : `Atribuir ${selectedLeadIds.size + extraByCnpj} leads`
            }
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 max-w-md bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  )
}
