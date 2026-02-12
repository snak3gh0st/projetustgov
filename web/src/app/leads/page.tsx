'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatCNPJ, formatCompactCurrency, formatParlamentarSummary } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'

const STATUS_OPTIONS = ['Não Contatado', 'Ainda Não', 'Retorno', 'Proposta', 'Fechado']
const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-gray-500/20 text-gray-400',
  'Ainda Não': 'bg-red-500/20 text-red-400',
  'Retorno': 'bg-amber-500/20 text-amber-400',
  'Proposta': 'bg-blue-500/20 text-blue-400',
  'Fechado': 'bg-green-500/20 text-green-400',
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

  // Group leads by CNPJ for display
  const displayLeads = useMemo(() => {
    const leadsByCnpj = leads.reduce((acc, lead) => {
      if (!acc[lead.cnpj]) {
        acc[lead.cnpj] = []
      }
      acc[lead.cnpj].push(lead)
      return acc
    }, {} as Record<string, VendedorProjeto[]>)

    return Object.entries(leadsByCnpj).map(([cnpj, cnpjLeads]) => {
      const first = cnpjLeads[0]
      return {
        ...first,
        emenda_count: cnpjLeads.length,
        total_valor_emendas: cnpjLeads.reduce((sum, l) => sum + (Number(l.valor_emenda) || 0), 0),
        parlamentares: cnpjLeads.map(l => l.parlamentar)
      }
    })
  }, [leads])

  async function updateLead(id: number, field: string, value: string) {
    try {
      const lead = leads.find(l => l.id === id)
      if (!lead) return
      await fetch(`/api/leads/${encodeURIComponent(lead.cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      })
      setLeads(prev => prev.map(l =>
        l.id === id ? { ...l, [field]: value } : l
      ))
    } catch (err) {
      console.error('Failed to update lead:', err)
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
        <h1 className="font-heading text-2xl font-bold text-white">Lista de Leads</h1>
        <p className="text-sm text-gray-400 mt-1">
          {sessionUser?.role === 'vendedor' ? 'Seus leads atribuídos' : 'Todos os projetos dos vendedores'}
        </p>
      </div>

      <input
        type="text"
        placeholder="Buscar por CNPJ ou nome..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-sigma-navy-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon/50 transition-colors"
      />

      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50">
          <option value="">Todos Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {sessionUser?.role === 'gestor' && (
          <select value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)} className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50">
            <option value="">Todos Vendedores</option>
            <option value="unassigned">Não atribuídos</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-sigma-navy-light">
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-400 uppercase w-8"></th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">CNPJ</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nome</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Valor Emenda</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Parlamentar</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Link</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ministerio</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Municipio</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Telefone</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  {sessionUser?.role === 'gestor' && (
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Vendedor</th>
                  )}
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Obs</th>
                  {sessionUser?.role === 'gestor' && (
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayLeads.map(lead => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="border-b border-white/5 hover:bg-white/5 hover:border-l-2 hover:border-l-sigma-neon transition-colors cursor-pointer">
                    <td className="px-2 py-2">
                      {lead.is_max_priority && (
                        <div
                          className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                          title="MÁXIMA PRIORIDADE - Nunca executou convênio"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-gray-300">
                        {formatCNPJ(lead.cnpj)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white font-medium truncate max-w-[180px]">
                      {lead.nome || '-'}
                      {lead.is_existing_client && sessionUser?.role === 'gestor' && (
                        <span className="ml-2 text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">
                          CLIENTE EXISTENTE
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sigma-neon font-medium text-xs whitespace-nowrap">
                      {formatCompactCurrency(lead.total_valor_emendas || 0)}
                      {lead.emenda_count > 1 && (
                        <span className="ml-1 text-gray-500 text-xs">({lead.emenda_count})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300 text-xs truncate max-w-[140px]">
                      {formatParlamentarSummary(lead.parlamentares || [])}
                    </td>
                    <td className="px-3 py-2">
                      {lead.link_externo ? (
                        <a
                          href={lead.link_externo}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-cyan-400 hover:text-cyan-300 text-xs underline"
                        >
                          Ver
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-300 text-xs truncate max-w-[140px]">{lead.orgao_concedente || '-'}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{lead.uf || '-'}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs truncate max-w-[120px]">{lead.municipio || '-'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={lead.telefone || ''}
                        placeholder="..."
                        onClick={e => e.stopPropagation()}
                        onBlur={e => {
                          if (e.target.value !== (lead.telefone || '')) {
                            updateLead(lead.id, 'telefone', e.target.value)
                          }
                        }}
                        className="bg-transparent border-b border-white/10 text-xs text-gray-300 w-24 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="email"
                        defaultValue={lead.email || ''}
                        placeholder="..."
                        onClick={e => e.stopPropagation()}
                        onBlur={e => {
                          if (e.target.value !== (lead.email || '')) {
                            updateLead(lead.id, 'email', e.target.value)
                          }
                        }}
                        className="bg-transparent border-b border-white/10 text-xs text-gray-300 w-28 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={lead.status_contato || 'Ainda Não'}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateLead(lead.id, 'status_contato', e.target.value)}
                        className={`text-xs rounded px-2 py-1 border-0 cursor-pointer ${STATUS_COLORS[lead.status_contato] || STATUS_COLORS['Ainda Não']}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    {sessionUser?.role === 'gestor' && (
                      <td className="px-3 py-2 text-gray-400 text-xs">{lead.vendedor_nome || '-'}</td>
                    )}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={lead.observacoes || ''}
                        placeholder="..."
                        onClick={e => e.stopPropagation()}
                        onBlur={e => {
                          if (e.target.value !== (lead.observacoes || '')) {
                            updateLead(lead.id, 'observacoes', e.target.value)
                          }
                        }}
                        className="bg-transparent border-b border-white/10 text-xs text-gray-300 w-24 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
                      />
                    </td>
                    {sessionUser?.role === 'gestor' && (
                      <td className="px-3 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setAssignmentModal({
                              cnpj: lead.cnpj,
                              nome: lead.nome,
                              currentVendedor: lead.vendedor_nome || null
                            })
                          }}
                          className="text-xs px-2 py-1 rounded bg-sigma-neon/20 text-sigma-neon hover:bg-sigma-neon/30 transition-colors"
                        >
                          Atribuir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>{displayLeads.length} CNPJs ({leads.length} emendas)</span>
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-xs">
              Exportar CSV
            </button>
          </div>
        </div>
      )}

      <LeadSlideOver lead={selectedLead} onClose={() => setSelectedLead(null)} />

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
    </div>
  )
}
