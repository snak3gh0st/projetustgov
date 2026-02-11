'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { formatCNPJ, formatCompactCurrency, formatCurrency } from '@/lib/format'
import type { VendedorProjeto, ClienteAgrupado, DashboardStats } from '@/lib/types'
import BrazilHeatmap from '@/components/BrazilHeatmap'
import { CategoryDonut, TopStatesChart, ExecutionChart, VendedorPerformance } from '@/components/DashboardCharts'

const CATEGORIAS = ['Novo', 'Contactado', 'Proposta', 'Retorno'] as const
const CAT_COLORS: Record<string, string> = {
  'Novo': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Contactado': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Proposta': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Retorno': 'bg-green-500/20 text-green-400 border-green-500/30',
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

// --- Enhanced Dashboard Types ---
interface EnhancedData {
  totals: { projetos: number; clientes: number; volume: number }
  byUf: { uf: string; count: number; valor_global: number }[]
  byVendedor: { nome: string; vendedor_id: string; projetos: number; clientes: number; valor_global: number; propostas: number }[]
  byCategoria: { categoria: string; count: number }[]
  topClients: { cnpj: string; nome: string; uf: string; projetos: number; valor_global_total: number; perc_liberado: number }[]
  execDist: { range: string; count: number; valor_global: number }[]
}

export default function SalesDashboard() {
  // --- Enhanced data ---
  const [enhanced, setEnhanced] = useState<EnhancedData | null>(null)
  const [loadingEnhanced, setLoadingEnhanced] = useState(true)

  // --- CRM state ---
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([])
  const [selectedVendedorId, setSelectedVendedorId] = useState<string>('')
  const [projetos, setProjetos] = useState<VendedorProjeto[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategoria, setSelectedCategoria] = useState('all')
  const [expandedCnpjs, setExpandedCnpjs] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [activeTab, setActiveTab] = useState<'overview' | 'crm'>('overview')

  // Edit modal
  const [editingProjeto, setEditingProjeto] = useState<VendedorProjeto | null>(null)
  const [editCategoria, setEditCategoria] = useState('')
  const [editObs, setEditObs] = useState('')
  const [saving, setSaving] = useState(false)

  // --- Load enhanced dashboard data ---
  useEffect(() => {
    fetch('/api/dashboard-enhanced')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setEnhanced(data)
      })
      .catch(() => {})
      .finally(() => setLoadingEnhanced(false))
  }, [])

  // --- Load vendedores ---
  useEffect(() => {
    fetch('/api/vendedores')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setVendedores(data)
          if (data.length > 0) setSelectedVendedorId(data[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // --- Load projects when vendedor changes ---
  const fetchProjetos = useCallback(async () => {
    if (!selectedVendedorId) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('vendedor_id', selectedVendedorId)
    if (searchTerm) params.set('search', searchTerm)
    if (selectedCategoria !== 'all') params.set('status_contato', selectedCategoria)

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setProjetos(data)
        const uniqueCnpjs = new Set(data.map((p: VendedorProjeto) => p.cnpj))
        const vol = data.reduce((sum: number, p: VendedorProjeto) => sum + (Number(p.valor_global) || 0), 0)
        setStats({
          total_clientes: uniqueCnpjs.size,
          total_projetos: data.length,
          volume_financeiro: vol,
          por_categoria: {
            'Novo': data.filter((p: VendedorProjeto) => p.status_contato === 'Novo' || !p.status_contato).length,
            'Contactado': data.filter((p: VendedorProjeto) => p.status_contato === 'Contactado').length,
            'Proposta': data.filter((p: VendedorProjeto) => p.status_contato === 'Proposta').length,
            'Retorno': data.filter((p: VendedorProjeto) => p.status_contato === 'Retorno').length,
          },
        })
      }
    } catch (err) {
      console.error('Failed to fetch:', err)
    }
    setLoading(false)
  }, [selectedVendedorId, searchTerm, selectedCategoria])

  useEffect(() => {
    if (activeTab === 'crm') {
      const timer = setTimeout(fetchProjetos, 300)
      return () => clearTimeout(timer)
    }
  }, [fetchProjetos, activeTab])

  // --- Group by CNPJ ---
  const clientesAgrupados = useMemo(() => {
    const mapa = new Map<string, ClienteAgrupado>()
    projetos.forEach(p => {
      if (!mapa.has(p.cnpj)) {
        mapa.set(p.cnpj, {
          cnpj: p.cnpj, nome: p.nome, email: p.email || '', telefone: p.telefone || '',
          uf: p.uf || '', municipio: p.municipio || '', projetos: [],
          totalProjetos: 0, valorGlobal: 0,
        })
      }
      const c = mapa.get(p.cnpj)!
      c.projetos.push(p)
      c.totalProjetos = c.projetos.length
      c.valorGlobal += Number(p.valor_global) || 0
    })
    return Array.from(mapa.values()).sort((a, b) => b.valorGlobal - a.valorGlobal)
  }, [projetos])

  const paginatedClientes = useMemo(() => clientesAgrupados.slice((page - 1) * pageSize, page * pageSize), [clientesAgrupados, page])
  const totalPages = Math.ceil(clientesAgrupados.length / pageSize)

  function toggleExpanded(cnpj: string) {
    setExpandedCnpjs(prev => { const n = new Set(prev); n.has(cnpj) ? n.delete(cnpj) : n.add(cnpj); return n })
  }
  function openEditModal(p: VendedorProjeto) {
    setEditingProjeto(p); setEditCategoria(p.status_contato || 'Novo'); setEditObs(p.observacoes || '')
  }
  async function saveEdit() {
    if (!editingProjeto) return
    setSaving(true)
    try {
      await fetch(`/api/leads/${encodeURIComponent(editingProjeto.cnpj)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingProjeto.id, status_contato: editCategoria, observacoes: editObs }),
      })
      setEditingProjeto(null)
      fetchProjetos()
    } catch (err) { console.error('Save error:', err) }
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-white">Dashboard de Vendas</h1>
          <p className="text-sm text-gray-400 mt-1">CRM - Visao geral e gerenciamento de projetos</p>
        </div>
        {/* Tab switcher */}
        <div className="flex bg-sigma-navy-card border border-white/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-sigma-neon/20 text-sigma-neon' : 'text-gray-400 hover:text-white'}`}
          >
            Visao Geral
          </button>
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'crm' ? 'bg-sigma-neon/20 text-sigma-neon' : 'text-gray-400 hover:text-white'}`}
          >
            CRM Vendedor
          </button>
        </div>
      </div>

      {/* ============= OVERVIEW TAB ============= */}
      {activeTab === 'overview' && (
        <>
          {loadingEnhanced ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-sigma-neon/30 border-t-sigma-neon rounded-full animate-spin" />
                <span className="text-gray-500 text-sm">Carregando dados...</span>
              </div>
            </div>
          ) : enhanced ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-sigma-neon/5 rounded-bl-full" />
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Total Projetos</p>
                  <p className="text-3xl font-heading font-bold text-white mt-2">{enhanced.totals.projetos.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-gray-500 mt-1">{enhanced.byUf.length} estados</p>
                </div>
                <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-bl-full" />
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Clientes Unicos</p>
                  <p className="text-3xl font-heading font-bold text-blue-400 mt-2">{enhanced.totals.clientes.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-gray-500 mt-1">por CNPJ</p>
                </div>
                <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-bl-full" />
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Volume Financeiro</p>
                  <p className="text-3xl font-heading font-bold text-sigma-neon mt-2">{formatCompactCurrency(enhanced.totals.volume)}</p>
                  <p className="text-xs text-gray-500 mt-1">valor global</p>
                </div>
                <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-bl-full" />
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Vendedores</p>
                  <p className="text-3xl font-heading font-bold text-purple-400 mt-2">{enhanced.byVendedor.length}</p>
                  <p className="text-xs text-gray-500 mt-1">ativos</p>
                </div>
              </div>

              {/* Row: Map + Category Donut */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <BrazilHeatmap data={enhanced.byUf.map(u => ({ uf: u.uf, count: Number(u.count), saldo: Number(u.valor_global) }))} />
                </div>
                <div className="space-y-4">
                  <CategoryDonut data={enhanced.byCategoria.map(c => ({ name: c.categoria, value: Number(c.count) }))} />
                  <VendedorPerformance data={enhanced.byVendedor.map(v => ({
                    nome: v.nome, projetos: Number(v.projetos), clientes: Number(v.clientes),
                    saldo: Number(v.valor_global), propostas: Number(v.propostas),
                  }))} />
                </div>
              </div>

              {/* Row: Top States + Execution Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopStatesChart data={enhanced.byUf.map(u => ({ uf: u.uf, count: Number(u.count), saldo: Number(u.valor_global) }))} />
                <ExecutionChart data={enhanced.execDist.map(e => ({ range: e.range, count: Number(e.count), saldo: Number(e.valor_global) }))} />
              </div>

              {/* Top 10 Clients Table */}
              <div className="bg-sigma-navy-card border border-white/5 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-white">Top 10 Clientes por Volume</h3>
                  <p className="text-xs text-gray-500">Maiores valores globais</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sigma-navy-light">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Projetos</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Valor Global</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">% Liberado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enhanced.topClients.map((c, i) => (
                        <tr key={c.cnpj} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-bold ${
                              i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                              i === 1 ? 'bg-gray-400/20 text-gray-300' :
                              i === 2 ? 'bg-orange-500/20 text-orange-400' :
                              'bg-white/5 text-gray-500'
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-white font-medium truncate max-w-[250px]">{c.nome}</div>
                            <div className="text-xs text-gray-500 font-mono">{formatCNPJ(c.cnpj)}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-300">{c.uf || '-'}</td>
                          <td className="px-4 py-3 text-gray-300">{c.projetos}</td>
                          <td className="px-4 py-3 text-sigma-neon font-semibold">{formatBRL(Number(c.valor_global_total))}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-sigma-navy-light rounded-full overflow-hidden">
                                <div className="h-full bg-sigma-neon rounded-full" style={{ width: `${Math.min(Number(c.perc_liberado), 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-400">{Number(c.perc_liberado).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-gray-500">Erro ao carregar dados</div>
          )}
        </>
      )}

      {/* ============= CRM TAB ============= */}
      {activeTab === 'crm' && (
        <>
          {/* Vendedor selector + Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase mb-2">Selecionar Vendedor</p>
              <select
                value={selectedVendedorId}
                onChange={e => { setSelectedVendedorId(e.target.value); setPage(1) }}
                className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sigma-neon/50"
              >
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>

            {stats && (
              <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase mb-2">Estatisticas</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Clientes:</span>
                    <span className="text-white font-semibold">{stats.total_clientes}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Volume:</span>
                    <span className="text-sigma-neon font-semibold">{formatCompactCurrency(stats.volume_financeiro)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Propostas:</span>
                    <span className="text-amber-400 font-semibold">{stats.por_categoria.Proposta}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Novos:</span>
                    <span className="text-yellow-400 font-semibold">{stats.por_categoria.Novo}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Retorno:</span>
                    <span className="text-green-400 font-semibold">{stats.por_categoria.Retorno}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Projetos:</span>
                    <span className="text-white font-semibold">{stats.total_projetos}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1) }}
              className="flex-1 bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon/50"
            />
            <select
              value={selectedCategoria}
              onChange={e => { setSelectedCategoria(e.target.value); setPage(1) }}
              className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sigma-neon/50"
            >
              <option value="all">Todos status</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Client list */}
          <div className="bg-sigma-navy-card border border-white/5 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm font-medium text-gray-300">Clientes e Projetos</p>
                <p className="text-xs text-gray-500">{clientesAgrupados.length} clientes, {projetos.length} projetos</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-sigma-neon/30 border-t-sigma-neon rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedClientes.map(cliente => {
                  const isExpanded = expandedCnpjs.has(cliente.cnpj)
                  return (
                    <div key={cliente.cnpj} className="border border-white/10 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleExpanded(cliente.cnpj)}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white truncate">{cliente.nome}</h3>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="font-mono">{formatCNPJ(cliente.cnpj)}</span>
                              {cliente.uf && <span>{cliente.municipio ? `${cliente.municipio}, ${cliente.uf}` : cliente.uf}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-sigma-neon">{formatBRL(cliente.valorGlobal)}</p>
                            <p className="text-xs text-gray-500">{cliente.totalProjetos} proj.</p>
                          </div>
                          {/* Contact icons */}
                          <div className="flex gap-1">
                            {cliente.telefone && (
                              <a href={`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener"
                                onClick={e => e.stopPropagation()}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors text-xs" title="WhatsApp">
                                W
                              </a>
                            )}
                            {cliente.email && (
                              <a href={`mailto:${cliente.email}`}
                                onClick={e => e.stopPropagation()}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs" title="Email">
                                @
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-white/10 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-sigma-navy-light">
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Programa</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Orgao</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Valor Global</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Situacao</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Status</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Obs</th>
                                <th className="px-3 py-2 text-left text-gray-400 uppercase">Acao</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cliente.projetos.map(p => (
                                <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                                  <td className="px-3 py-2">
                                    {p.link_externo ? (
                                      <a href={p.link_externo} target="_blank" rel="noopener" className="text-blue-400 hover:underline truncate max-w-[150px] block">{p.nome_programa || p.nr_convenio || '-'}</a>
                                    ) : <span className="text-gray-300 truncate max-w-[150px] block">{p.nome_programa || p.nr_convenio || '-'}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-gray-400 truncate max-w-[150px]">{p.orgao_concedente || 'N/A'}</td>
                                  <td className="px-3 py-2 text-sigma-neon">{formatBRL(Number(p.valor_global) || 0)}</td>
                                  <td className="px-3 py-2 text-gray-400">{p.situacao || '-'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${CAT_COLORS[p.status_contato] || CAT_COLORS['Novo']}`}>
                                      {p.status_contato || 'Novo'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{p.observacoes || '-'}</td>
                                  <td className="px-3 py-2">
                                    <button onClick={e => { e.stopPropagation(); openEditModal(p) }}
                                      className="text-xs text-sigma-neon hover:underline">Editar</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10 text-sm text-gray-400">
                <span>Pagina {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="px-3 py-1 border border-white/10 rounded hover:bg-white/5 disabled:opacity-30">&#8592;</button>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                    className="px-3 py-1 border border-white/10 rounded hover:bg-white/5 disabled:opacity-30">&#8594;</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingProjeto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditingProjeto(null)}>
          <div className="bg-sigma-navy-card border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-heading font-semibold text-white">Editar Projeto</h3>
              <p className="text-xs text-gray-500">Programa: {editingProjeto.nome_programa || editingProjeto.nr_convenio || '-'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1">Status</label>
              <select value={editCategoria} onChange={e => setEditCategoria(e.target.value)}
                className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1">Observacoes</label>
              <textarea value={editObs} onChange={e => setEditObs(e.target.value)}
                placeholder="Adicione observacoes..."
                rows={3}
                className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingProjeto(null)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/5">Cancelar</button>
              <button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-sigma-neon/20 text-sigma-neon rounded-lg text-sm hover:bg-sigma-neon/30 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
