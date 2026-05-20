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
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [monitorCnpj, setMonitorCnpj] = useState('')
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [monitorResult, setMonitorResult] = useState<{ type: 'success' | 'error' | 'conflict'; message: string } | null>(null)
  const [pendingForce, setPendingForce] = useState(false)
  const [distributingExecucao, setDistributingExecucao] = useState(false)
  const [execucaoResult, setExecucaoResult] = useState<{
    distributed: number
    updated: number
    inserted: number
    skipped?: boolean
    vendedores: { nome: string; before: number; assigned: number; after: number }[]
    coordenador?: { nome: string; assigned: number }
  } | null>(null)
  const [showExecucaoModal, setShowExecucaoModal] = useState(false)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads?vendedor_id=unassigned&limit=5000&all=true')
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
      const res = await fetch('/api/leads?limit=5000&all=true')
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
      if (s?.user?.role !== 'gestor' && s?.user?.role !== 'coordenador') {
        window.location.href = '/'
      } else {
        setUserRole(s.user.role)
      }
    }).catch(() => { window.location.href = '/login' })
  }, [])

  useEffect(() => {
    if (userRole === 'gestor' || userRole === 'coordenador') {
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

  // Unique CNPJ counts for display
  const uniqueUnassignedCount = useMemo(() => new Set(leads.map(l => l.cnpj)).size, [leads])
  const uniqueAssignedCount = useMemo(() => new Set(assignedLeads.map(l => l.cnpj)).size, [assignedLeads])

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

  const sortedLeads = useMemo(() => {
    if (!sortCol) return filteredLeads
    return [...filteredLeads].sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortCol) {
        case 'cnpj': va = a.cnpj || ''; vb = b.cnpj || ''; break
        case 'vendedor': va = (a.vendedor_nome || '').toLowerCase(); vb = (b.vendedor_nome || '').toLowerCase(); break
        case 'leads': va = cnpjCounts[a.cnpj] || 0; vb = cnpjCounts[b.cnpj] || 0; break
        case 'nome': va = (a.nome || '').toLowerCase(); vb = (b.nome || '').toLowerCase(); break
        case 'programa': va = (a.nome_programa || '').toLowerCase(); vb = (b.nome_programa || '').toLowerCase(); break
        case 'valor': va = Number(a.valor_emenda) || 0; vb = Number(b.valor_emenda) || 0; break
        case 'uf': va = (a.uf || '').toLowerCase(); vb = (b.uf || '').toLowerCase(); break
        case 'status': va = a.status_contato || ''; vb = b.status_contato || ''; break
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredLeads, sortCol, sortDir, cnpjCounts])

  const uniqueFilteredCount = useMemo(() => new Set(sortedLeads.map(l => l.cnpj)).size, [sortedLeads])

  // Group assigned leads by vendedor for summary cards (unique CNPJs)
  const assignedByVendedor = useMemo(() => {
    const groups: Record<string, { nome: string; cnpjs: Set<string> }> = {}
    for (const l of assignedLeads) {
      const vid = l.vendedor_id || 'unknown'
      if (!groups[vid]) {
        groups[vid] = { nome: l.vendedor_nome || 'Desconhecido', cnpjs: new Set() }
      }
      groups[vid].cnpjs.add(l.cnpj)
    }
    return Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, { nome: v.nome, count: v.cnpjs.size }])
    )
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
    if (selectedLeadIds.size === sortedLeads.length) {
      setSelectedLeadIds(new Set())
    } else {
      setSelectedLeadIds(new Set(sortedLeads.map(l => l.id)))
    }
  }

  async function handleAutoDistribute() {
    if (vendedores.length === 0 || leads.length === 0) return
    setAssigning(true)
    try {
      // Unique unassigned CNPJs, each counted as 1 lead slot
      const uniqueCnpjs = Array.from(new Set(leads.map(l => l.cnpj)))
      // Sort vendedores by current lead_count ASC (least loaded first)
      const sorted = [...vendedores].sort((a, b) => a.lead_count - b.lead_count)
      // Round-robin assignment batches
      const batches: Record<string, string[]> = {}
      sorted.forEach(v => { batches[v.id] = [] })
      uniqueCnpjs.forEach((cnpj, i) => {
        const v = sorted[i % sorted.length]
        batches[v.id].push(cnpj)
      })
      let total = 0
      for (const [vendedorId, cnpjs] of Object.entries(batches)) {
        if (cnpjs.length === 0) continue
        // Collect lead_ids for these CNPJs
        const ids = leads.filter(l => cnpjs.includes(l.cnpj)).map(l => l.id)
        const res = await fetch('/api/leads/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: ids, vendedor_id: vendedorId }),
        })
        if (res.ok) {
          const d = await res.json()
          total += d.assigned_count ?? ids.length
        }
      }
      setToast(`Roleta concluída! ${total} leads distribuídos igualmente entre ${sorted.length} vendedores.`)
      setSelectedLeadIds(new Set())
      fetchLeads()
      fetchAssignedLeads()
      fetchVendedores()
      setTimeout(() => setToast(''), 6000)
    } catch {
      setToast('Erro na distribuição automática')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setAssigning(false)
    }
  }

  async function handleDistribuirExecucao() {
    setDistributingExecucao(true)
    setExecucaoResult(null)
    try {
      const res = await fetch('/api/execucao/distribute', { method: 'POST' })
      const data = await res.json()
      if (res.status === 409) {
        setToast('Distribuicao ja em andamento. Tente novamente em instantes.')
        setTimeout(() => setToast(''), 5000)
        return
      }
      if (!res.ok) {
        setToast(data.error || 'Erro na distribuicao de execucao')
        setTimeout(() => setToast(''), 3000)
        return
      }
      setExecucaoResult(data)
      setShowExecucaoModal(true)
    } catch {
      setToast('Erro de conexao ao distribuir execucao')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setDistributingExecucao(false)
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

  async function handleMonitorCnpj(force = false) {
    const cleaned = monitorCnpj.replace(/\D/g, '')
    if (cleaned.length !== 14) {
      setMonitorResult({ type: 'error', message: 'CNPJ deve ter 14 dígitos' })
      return
    }
    setMonitorLoading(true)
    setMonitorResult(null)
    setPendingForce(false)
    try {
      const res = await fetch('/api/monitorar-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: cleaned, force }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setMonitorResult({ type: 'conflict', message: data.error || 'CNPJ já atribuído a outro vendedor' })
        setPendingForce(true)
      } else if (res.ok) {
        setMonitorResult({ type: 'success', message: data.message || 'CNPJ atribuído com sucesso' })
        setMonitorCnpj('')
        fetchAssignedLeads()
        fetchVendedores()
      } else {
        setMonitorResult({ type: 'error', message: data.error || 'Erro ao atribuir CNPJ' })
      }
    } catch {
      setMonitorResult({ type: 'error', message: 'Erro de conexão' })
    } finally {
      setMonitorLoading(false)
    }
  }

  if (userRole !== 'gestor' && userRole !== 'coordenador') {
    return <div className="flex items-center justify-center py-20 text-gray-500">Verificando permissoes...</div>
  }

  const isLoading = tab === 'unassigned' ? loading : loadingAssigned

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900 dark:text-gray-100">Distribuir Leads</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          {tab === 'unassigned'
            ? 'Atribua leads nao atribuidos aos vendedores'
            : 'Visualize e redistribua leads ja atribuidos'
          }
        </p>
      </div>

      {/* Roleta — balanced auto-distribution */}
      {tab === 'unassigned' && leads.length > 0 && vendedores.length > 0 && (
        <div className="border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/10 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-800">Distribuir Igualmente (Roleta)</p>
            <p className="text-xs text-blue-600 mt-0.5">
              {uniqueUnassignedCount} CNPJs não atribuídos → distribuídos em round-robin entre {vendedores.length} vendedores (~{Math.ceil(uniqueUnassignedCount / vendedores.length)} cada)
            </p>
          </div>
          <button
            onClick={handleAutoDistribute}
            disabled={assigning}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#0072F7] text-white hover:bg-[#0058C4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {assigning ? 'Distribuindo...' : '🎲 Distribuir Igualmente'}
          </button>
        </div>
      )}

      {/* Execution pipeline distribution — gestor only */}
      {userRole === 'gestor' && (
        <div className="border border-green-200 dark:border-green-500/20 bg-green-50/50 dark:bg-green-500/10 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-800">Distribuir Execucao Automaticamente</p>
            <p className="text-xs text-green-600 mt-0.5">
              Atribui leads em execucao ao vendedor com menos leads. Clientes existentes vao ao coordenador.
            </p>
          </div>
          <button
            onClick={handleDistribuirExecucao}
            disabled={distributingExecucao}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {distributingExecucao ? 'Distribuindo...' : 'Distribuir Automaticamente'}
          </button>
        </div>
      )}

      {/* CNPJ Monitoring section - gestor only, assign directly to Paulo Gabriel */}
      {userRole === 'gestor' && (
        <div className="border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-amber-800 mb-3">Adicionar CNPJ Monitorado (Paulo Gabriel)</h2>
          <div className="flex flex-wrap gap-3 items-start">
            <input
              type="text"
              placeholder="CNPJ (somente números ou formatado)"
              value={monitorCnpj}
              onChange={e => { setMonitorCnpj(e.target.value); setMonitorResult(null); setPendingForce(false) }}
              className="w-full sm:flex-1 sm:min-w-[200px] bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-amber-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors"
            />
            <button
              onClick={() => handleMonitorCnpj(false)}
              disabled={monitorLoading || monitorCnpj.replace(/\D/g, '').length !== 14}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {monitorLoading ? 'Atribuindo...' : 'Atribuir a Paulo'}
            </button>
          </div>
          {monitorResult && (
            <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${
              monitorResult.type === 'success'
                ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                : monitorResult.type === 'conflict'
                  ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20'
                  : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
            }`}>
              {monitorResult.message}
              {monitorResult.type === 'conflict' && pendingForce && (
                <button
                  onClick={() => handleMonitorCnpj(true)}
                  disabled={monitorLoading}
                  className="ml-3 text-xs font-medium underline hover:no-underline"
                >
                  Forçar Reatribuição
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-1 w-fit">
        <button
          onClick={() => setTab('unassigned')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'unassigned'
              ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border border-blue-200 dark:border-blue-500/20'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border border-transparent'
          }`}
        >
          Nao Atribuidos
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'unassigned' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
          }`}>
            {uniqueUnassignedCount}
          </span>
        </button>
        <button
          onClick={() => setTab('assigned')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'assigned'
              ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border border-blue-200 dark:border-blue-500/20'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border border-transparent'
          }`}
        >
          Distribuidos
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'assigned' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
          }`}>
            {uniqueAssignedCount}
          </span>
        </button>
      </div>

      {/* Vendedor cards - for unassigned tab: target selection; for assigned tab: summary */}
      {tab === 'unassigned' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {vendedores.map(v => (
            <div
              key={v.id}
              onClick={() => setSelectedVendedorId(v.id)}
              className={`rounded-xl p-3 border cursor-pointer transition-all ${
                selectedVendedorId === v.id
                  ? 'border-[#0072F7] bg-blue-50 dark:bg-blue-500/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{v.nome}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{v.email}</p>
              <p className="text-xs text-[#0072F7] mt-1">{v.lead_count} leads</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
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
          className="w-full sm:flex-1 sm:min-w-[200px] bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
        />
        <select
          value={ufFilter}
          onChange={e => setUfFilter(e.target.value)}
          className="bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
        >
          <option value="">Todas UFs</option>
          {ufs.map(uf => <option key={uf} value={uf!}>{uf}</option>)}
        </select>
        {tab === 'assigned' && (
          <select
            value={filterVendedorId}
            onChange={e => setFilterVendedorId(e.target.value)}
            className="bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
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
        <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-400">
          {extraByCnpj} lead{extraByCnpj > 1 ? 's' : ''} adicional{extraByCnpj > 1 ? 'is' : ''} do mesmo CNPJ ser{extraByCnpj > 1 ? 'ao' : 'a'} incluido{extraByCnpj > 1 ? 's' : ''} automaticamente
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : sortedLeads.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          {tab === 'unassigned'
            ? 'Nenhum lead pendente de atribuicao'
            : filterVendedorId
              ? 'Nenhum lead atribuido a este vendedor'
              : 'Nenhum lead distribuido ainda'
          }
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={sortedLeads.length > 0 && selectedLeadIds.size === sortedLeads.length}
                    onChange={toggleAll}
                    className="rounded border-gray-600 bg-transparent text-blue-500 focus:ring-blue-500/30"
                  />
                </th>
                <th onClick={() => handleSort('cnpj')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">CNPJ<SortIcon col="cnpj" /></th>
                {tab === 'assigned' && (
                  <th onClick={() => handleSort('vendedor')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Vendedor<SortIcon col="vendedor" /></th>
                )}
                <th onClick={() => handleSort('leads')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Leads<SortIcon col="leads" /></th>
                <th onClick={() => handleSort('nome')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Nome<SortIcon col="nome" /></th>
                <th onClick={() => handleSort('programa')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Programa<SortIcon col="programa" /></th>
                <th onClick={() => handleSort('valor')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Valor Emenda<SortIcon col="valor" /></th>
                <th onClick={() => handleSort('uf')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">UF<SortIcon col="uf" /></th>
                <th onClick={() => handleSort('status')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase cursor-pointer hover:text-[#0072F7] select-none">Status<SortIcon col="status" /></th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => toggleLead(lead.id)}
                  className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                    selectedLeadIds.has(lead.id) ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''
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
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{formatCNPJ(lead.cnpj)}</td>
                  {tab === 'assigned' && (
                    <td className="px-3 py-2 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border border-blue-200 dark:border-blue-500/20">
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
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium truncate max-w-[180px]">{lead.nome || '-'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 text-xs truncate max-w-[150px]">{lead.nome_programa || '-'}</td>
                  <td className="px-3 py-2 text-[#0072F7] text-xs">{formatCompactCurrency(lead.valor_emenda)}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{lead.uf || '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {tab === 'assigned' ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        lead.status_contato === 'Fechado'
                          ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                          : lead.status_contato === 'Proposta'
                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                            : lead.status_contato === 'Retorno'
                              ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border border-blue-200 dark:border-blue-500/20'
                              : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700'
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
      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md px-4 py-3 shadow-sm">
        <span className="text-sm text-gray-400 dark:text-gray-500">
          {selectedLeadIds.size > 0
            ? `${selectedLeadIds.size} leads selecionados${extraByCnpj > 0 ? ` (+${extraByCnpj} por CNPJ)` : ''}`
            : tab === 'unassigned'
              ? `${uniqueFilteredCount} leads nao atribuidos`
              : `${uniqueFilteredCount} leads distribuidos`
          }
        </span>
        <div className="flex items-center gap-3">
          {tab === 'assigned' && selectedLeadIds.size > 0 && (
            <button
              onClick={handleUnassign}
              disabled={assigning}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {assigning ? 'Removendo...' : 'Desatribuir'}
            </button>
          )}
          <select
            value={selectedVendedorId}
            onChange={e => setSelectedVendedorId(e.target.value)}
            className="bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
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
        <div className="fixed bottom-6 right-6 max-w-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg text-sm backdrop-blur-md">
          {toast}
        </div>
      )}

      {/* Execucao distribution result modal */}
      {showExecucaoModal && execucaoResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Resultado da Distribuicao (Execucao)</h2>
              <button
                onClick={() => setShowExecucaoModal(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-700">{execucaoResult.distributed}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">CNPJs distribuidos</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-700">{execucaoResult.updated}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Atualizados</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-500/10 rounded-xl p-3">
                <p className="text-2xl font-bold text-purple-700">{execucaoResult.inserted}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Inseridos</p>
              </div>
            </div>

            {execucaoResult.coordenador && execucaoResult.coordenador.assigned > 0 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3">
                <p className="text-sm text-amber-800 dark:text-amber-400">
                  <span className="font-semibold">{execucaoResult.coordenador.assigned}</span> CNPJs de clientes existentes atribuidos ao coordenador <span className="font-semibold">{execucaoResult.coordenador.nome}</span>
                </p>
              </div>
            )}

            {execucaoResult.vendedores.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                    <th className="py-2 font-medium">Vendedor</th>
                    <th className="py-2 font-medium text-center">Antes</th>
                    <th className="py-2 font-medium text-center">Atribuidos</th>
                    <th className="py-2 font-medium text-center">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {execucaoResult.vendedores.map((v, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-2 text-gray-900 dark:text-gray-100">{v.nome}</td>
                      <td className="py-2 text-center text-gray-500 dark:text-gray-400">{v.before}</td>
                      <td className="py-2 text-center font-semibold text-green-700">{v.assigned > 0 ? `+${v.assigned}` : '0'}</td>
                      <td className="py-2 text-center text-gray-900 dark:text-gray-100">{v.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {execucaoResult.distributed === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                Nenhum lead em execucao pendente de distribuicao.
              </p>
            )}

            <button
              onClick={() => setShowExecucaoModal(false)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
