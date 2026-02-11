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

export default function DistribuirPage() {
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set())
  const [selectedVendedorId, setSelectedVendedorId] = useState('')
  const [search, setSearch] = useState('')
  const [ufFilter, setUfFilter] = useState('')
  const [loading, setLoading] = useState(true)
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
      fetchVendedores()
    }
  }, [userRole, fetchLeads, fetchVendedores])

  // Count leads per CNPJ
  const cnpjCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of leads) {
      counts[l.cnpj] = (counts[l.cnpj] || 0) + 1
    }
    return counts
  }, [leads])

  // Compute extra leads that would be auto-included via CNPJ grouping
  const extraByCnpj = useMemo(() => {
    const selectedCnpjs = new Set<string>()
    for (const lead of leads) {
      if (selectedLeadIds.has(lead.id)) {
        selectedCnpjs.add(lead.cnpj)
      }
    }
    let extra = 0
    for (const lead of leads) {
      if (!selectedLeadIds.has(lead.id) && selectedCnpjs.has(lead.cnpj)) {
        extra++
      }
    }
    return extra
  }, [leads, selectedLeadIds])

  // Filtered leads
  const filteredLeads = leads.filter(lead => {
    if (search) {
      const s = search.toLowerCase()
      if (!lead.cnpj.includes(s) && !(lead.nome || '').toLowerCase().includes(s)) return false
    }
    if (ufFilter && lead.uf !== ufFilter) return false
    return true
  })

  const ufs = Array.from(new Set(leads.map(l => l.uf).filter((v): v is string => Boolean(v)))).sort()

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
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const total = data.assigned_count ?? selectedLeadIds.size
        const extra = data.extra_by_cnpj ?? 0
        const warnings: string[] = data.warnings ?? []
        let msg = `${total} leads atribuidos com sucesso!`
        if (extra > 0) {
          msg += ` (${extra} adicionais por agrupamento CNPJ)`
        }
        if (warnings.length > 0) {
          msg += ` | Avisos: ${warnings.join('; ')}`
        }
        setToast(msg)
        setSelectedLeadIds(new Set())
        fetchLeads()
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

  if (userRole !== 'gestor') {
    return <div className="flex items-center justify-center py-20 text-gray-500">Verificando permissoes...</div>
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">Distribuir Leads</h1>
        <p className="text-sm text-gray-400 mt-1">Atribua leads nao atribuidos aos vendedores</p>
      </div>

      {/* Vendedor cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {vendedores.map(v => (
          <div
            key={v.id}
            onClick={() => setSelectedVendedorId(v.id)}
            className={`rounded-xl p-3 border cursor-pointer transition-all ${
              selectedVendedorId === v.id
                ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                : 'border-white/5 bg-white/[0.02] hover:border-white/10'
            }`}
          >
            <p className="text-sm font-medium text-white truncate">{v.nome}</p>
            <p className="text-xs text-gray-400 mt-0.5">{v.email}</p>
            <p className="text-xs text-cyan-400 mt-1">{v.lead_count} leads</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por CNPJ ou nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-sigma-navy-card border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
        <select
          value={ufFilter}
          onChange={e => setUfFilter(e.target.value)}
          className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="">Todas UFs</option>
          {ufs.map(uf => <option key={uf} value={uf!}>{uf}</option>)}
        </select>
      </div>

      {/* CNPJ grouping note */}
      {extraByCnpj > 0 && selectedLeadIds.size > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-2.5 text-sm text-cyan-300">
          {extraByCnpj} lead{extraByCnpj > 1 ? 's' : ''} adicional{extraByCnpj > 1 ? 'is' : ''} do mesmo CNPJ ser{extraByCnpj > 1 ? 'ao' : 'a'} incluido{extraByCnpj > 1 ? 's' : ''} automaticamente
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-sigma-navy-light">
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && selectedLeadIds.size === filteredLeads.length}
                    onChange={toggleAll}
                    className="rounded border-gray-600 bg-transparent text-cyan-500 focus:ring-cyan-500/30"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">CNPJ</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Leads</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nome</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Programa</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Valor Global</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Municipio</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => toggleLead(lead.id)}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${
                    selectedLeadIds.has(lead.id) ? 'bg-cyan-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-gray-600 bg-transparent text-cyan-500 focus:ring-cyan-500/30"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-300">{formatCNPJ(lead.cnpj)}</td>
                  <td className="px-3 py-2 text-xs">
                    {cnpjCounts[lead.cnpj] > 1 ? (
                      <span className="text-cyan-400 font-medium">{cnpjCounts[lead.cnpj]} leads</span>
                    ) : (
                      <span className="text-gray-500">1</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white font-medium truncate max-w-[180px]">{lead.nome || '-'}</td>
                  <td className="px-3 py-2 text-gray-300 text-xs truncate max-w-[150px]">{lead.nome_programa || '-'}</td>
                  <td className="px-3 py-2 text-cyan-400 text-xs">{formatCompactCurrency(lead.valor_global)}</td>
                  <td className="px-3 py-2 text-gray-300">{lead.uf || '-'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[120px]">{lead.municipio || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-white/10 bg-gray-950/90 backdrop-blur-md px-4 py-3">
        <span className="text-sm text-gray-400">
          {selectedLeadIds.size > 0
            ? `${selectedLeadIds.size} leads selecionados${extraByCnpj > 0 ? ` (+${extraByCnpj} por CNPJ)` : ''}`
            : `${filteredLeads.length} leads nao atribuidos`
          }
        </span>
        <div className="flex items-center gap-3">
          <select
            value={selectedVendedorId}
            onChange={e => setSelectedVendedorId(e.target.value)}
            className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">Selecione vendedor...</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={selectedLeadIds.size === 0 || !selectedVendedorId || assigning}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 text-gray-950 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {assigning ? 'Atribuindo...' : `Atribuir ${selectedLeadIds.size + extraByCnpj} leads`}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 max-w-md bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 px-4 py-2 rounded-lg text-sm backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  )
}
