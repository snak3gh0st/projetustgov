'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { formatCurrency, formatCNPJ, formatCompactCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'

interface ConvenioMonitoramento extends VendedorProjeto {
  prioridade: string
  perc_execucao: number
}

interface MonitoramentoStats {
  total_monitorados: number
  total_saldo: number
  alta_prioridade: number
  media_prioridade: number
  baixa_prioridade: number
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; bar: string; dot: string }> = {
  Alta: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-500', bar: 'bg-red-500' },
  Media: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', bar: 'bg-amber-500' },
  Baixa: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-500' },
}

export default function MonitoramentoPage() {
  const [convenios, setConvenios] = useState<ConvenioMonitoramento[]>([])
  const [stats, setStats] = useState<MonitoramentoStats>({
    total_monitorados: 0,
    total_saldo: 0,
    alta_prioridade: 0,
    media_prioridade: 0,
    baixa_prioridade: 0,
  })
  const [filters, setFilters] = useState({
    prioridade: '',
    valor_min: 0,
    uf: '',
    search: '',
  })
  const [selectedConvenio, setSelectedConvenio] = useState<ConvenioMonitoramento | null>(null)
  const [loading, setLoading] = useState(true)
  const [ufs, setUfs] = useState<string[]>([])
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedValor, setDebouncedValor] = useState(0)
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSearchChange = useCallback((value: string) => {
    setFilters(f => ({ ...f, search: value }))
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => setDebouncedSearch(value), 500)
  }, [])

  const handleValorChange = useCallback((value: number) => {
    setFilters(f => ({ ...f, valor_min: value }))
    if (valorTimeout.current) clearTimeout(valorTimeout.current)
    valorTimeout.current = setTimeout(() => setDebouncedValor(value), 500)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.prioridade) params.append('prioridade', filters.prioridade)
    if (debouncedValor > 0) params.append('valor_min', debouncedValor.toString())
    if (filters.uf) params.append('uf', filters.uf)
    if (debouncedSearch) params.append('search', debouncedSearch)

    fetch(`/api/monitoramento?${params}`)
      .then(r => r.json())
      .then(data => {
        const items: ConvenioMonitoramento[] = data.convenios || []
        setConvenios(items)
        setStats(data.stats || { total_monitorados: 0, total_saldo: 0, alta_prioridade: 0, media_prioridade: 0, baixa_prioridade: 0 })
        if (!filters.uf) {
          const uniqueUfs = Array.from(new Set(items.map(c => c.uf).filter((v): v is string => Boolean(v)))).sort()
          setUfs(uniqueUfs)
        }
      })
      .catch(err => console.error('Monitoramento fetch error:', err))
      .finally(() => setLoading(false))
  }, [filters.prioridade, filters.uf, debouncedSearch, debouncedValor])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedConvenio(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

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

  const sortedConvenios = useMemo(() => {
    if (!sortCol) return convenios
    return [...convenios].sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortCol) {
        case 'nome': va = (a.nome || '').toLowerCase(); vb = (b.nome || '').toLowerCase(); break
        case 'programa': va = (a.nome_programa || '').toLowerCase(); vb = (b.nome_programa || '').toLowerCase(); break
        case 'uf': va = (a.uf || '').toLowerCase(); vb = (b.uf || '').toLowerCase(); break
        case 'valor': va = Number(a.valor_emenda) || 0; vb = Number(b.valor_emenda) || 0; break
        case 'parlamentar': va = (a.parlamentar || '').toLowerCase(); vb = (b.parlamentar || '').toLowerCase(); break
        case 'prioridade': {
          const order: Record<string, number> = { 'Alta': 3, 'Media': 2, 'Baixa': 1 }
          va = order[a.prioridade] || 0; vb = order[b.prioridade] || 0; break
        }
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [convenios, sortCol, sortDir])

  const priorityButtons = [
    { label: 'Todos', value: '' },
    { label: 'Alta', value: 'Alta' },
    { label: 'Media', value: 'Media' },
    { label: 'Baixa', value: 'Baixa' },
  ]

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Monitoramento Financeiro</h1>
        <p className="text-sm text-gray-400 mt-1">
          Acompanhamento de valores de emendas e execucao financeira dos leads
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Monitorados" value={stats.total_monitorados.toLocaleString('pt-BR')} accent="blue" />
        <StatCard label="Total em Valores" value={formatCompactCurrency(stats.total_saldo)} accent="blue" />
        <StatCard label="Alta Prioridade" value={String(stats.alta_prioridade)} accent="red" />
        <StatCard label="Media Prioridade" value={String(stats.media_prioridade)} accent="amber" />
        <StatCard label="Baixa Prioridade" value={String(stats.baixa_prioridade)} accent="emerald" />
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1">
            {priorityButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => setFilters(f => ({ ...f, prioridade: btn.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.prioridade === btn.value
                    ? 'bg-[#0072F7] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Valor min:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">R$</span>
              <input
                type="number"
                value={filters.valor_min}
                onChange={e => handleValorChange(Number(e.target.value) || 0)}
                className="w-32 bg-gray-100 border border-gray-300 rounded-lg pl-8 pr-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-[#0072F7]"
              />
            </div>
          </div>

          <select
            value={filters.uf}
            onChange={e => setFilters(f => ({ ...f, uf: e.target.value }))}
            className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-[#0072F7]"
          >
            <option value="">Todos os Estados</option>
            {ufs.map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ"
            value={filters.search}
            onChange={e => handleSearchChange(e.target.value)}
            className="flex-1 min-w-[180px] bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7]"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando dados...</div>
        </div>
      ) : convenios.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          Nenhum lead encontrado com os filtros selecionados
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th onClick={() => handleSort('nome')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">Organizacao<SortIcon col="nome" /></th>
                <th onClick={() => handleSort('programa')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">Programa<SortIcon col="programa" /></th>
                <th onClick={() => handleSort('uf')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">UF<SortIcon col="uf" /></th>
                <th onClick={() => handleSort('valor')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">Valor Emenda<SortIcon col="valor" /></th>
                <th onClick={() => handleSort('parlamentar')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">Parlamentar<SortIcon col="parlamentar" /></th>
                <th onClick={() => handleSort('prioridade')} className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase cursor-pointer hover:text-[#0072F7] select-none">Prioridade<SortIcon col="prioridade" /></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Acao</th>
              </tr>
            </thead>
            <tbody>
              {sortedConvenios.map((c, i) => {
                const colors = PRIORITY_COLORS[c.prioridade] || PRIORITY_COLORS['Media']
                return (
                  <tr
                    key={c.id || i}
                    className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[250px]">
                      {c.nome ? (c.nome.length > 50 ? c.nome.slice(0, 50) + '...' : c.nome) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]">
                      {c.nome_programa ? (c.nome_programa.length > 40 ? c.nome_programa.slice(0, 40) + '...' : c.nome_programa) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{c.uf || '-'}</td>
                    <td className="px-3 py-2 text-[#0072F7] font-medium">{formatCompactCurrency(c.valor_emenda || c.saldo_conta || 0)}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]">{c.parlamentar || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {c.prioridade}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedConvenio(c)}
                        className="text-xs text-[#0072F7] hover:text-blue-700 transition-colors"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedConvenios.length > 0 && (
        <p className="text-xs text-gray-500 text-right">{sortedConvenios.length} leads encontrados</p>
      )}

      {selectedConvenio && (
        <DetailModal convenio={selectedConvenio} onClose={() => setSelectedConvenio(null)} />
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const borderColor = accent === 'blue' ? 'border-blue-200' : accent === 'red' ? 'border-red-200' : accent === 'amber' ? 'border-amber-200' : 'border-emerald-200'
  const valueColor = accent === 'blue' ? 'text-[#0072F7]' : accent === 'red' ? 'text-red-500' : accent === 'amber' ? 'text-amber-600' : 'text-emerald-600'
  const dotColor = accent === 'blue' ? 'bg-[#0072F7]' : accent === 'red' ? 'bg-red-500' : accent === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className={`bg-white border border-gray-200 shadow-sm ${borderColor} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      </div>
      <p className={`text-xl font-bold mt-1 ${valueColor}`}>{value}</p>
    </div>
  )
}

function DetailModal({ convenio, onClose }: { convenio: ConvenioMonitoramento; onClose: () => void }) {
  const colors = PRIORITY_COLORS[convenio.prioridade] || PRIORITY_COLORS['Media']
  const valorPrincipal = convenio.valor_emenda || convenio.saldo_conta || 0

  const priorityExplanations: Record<string, string> = {
    Alta: 'Alta prioridade - Valor elevado de emenda',
    Media: 'Media prioridade - Valor moderado de emenda',
    Baixa: 'Baixa prioridade - Valor menor de emenda',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div
        className="relative bg-white border border-gray-200 shadow-lg rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{convenio.nome || 'Organizacao'}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{convenio.cnpj ? formatCNPJ(convenio.cnpj) : '-'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-800 transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-5">
          <Section title="Informacoes Basicas">
            <InfoRow label="Nome" value={convenio.nome} />
            <InfoRow label="CNPJ" value={convenio.cnpj ? formatCNPJ(convenio.cnpj) : null} />
            <InfoRow label="UF" value={convenio.uf} />
            <InfoRow label="Municipio" value={convenio.municipio} />
            <InfoRow label="Programa" value={convenio.nome_programa} />
            <InfoRow label="Nr Emenda" value={convenio.nr_emenda} />
            <InfoRow label="Parlamentar" value={convenio.parlamentar} />
          </Section>

          <Section title="Contato">
            <InfoRow label="Email" value={convenio.email || 'Nao informado'} />
            <InfoRow label="Telefone" value={convenio.telefone || 'Nao informado'} />
          </Section>

          <Section title="Financeiro">
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400">Valor Emenda</span>
              <span className="text-sm font-bold text-[#0072F7]">{formatCurrency(valorPrincipal)}</span>
            </div>
            {convenio.valor_global ? <InfoRow label="Valor Global" value={formatCurrency(convenio.valor_global)} /> : null}
            {convenio.valor_liberado ? <InfoRow label="Valor Liberado" value={formatCurrency(convenio.valor_liberado)} /> : null}
            {convenio.saldo_conta ? <InfoRow label="Saldo em Conta" value={formatCurrency(convenio.saldo_conta)} /> : null}
          </Section>

          <Section title="Analise de Prioridade">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                {convenio.prioridade}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {priorityExplanations[convenio.prioridade] || ''}
            </p>
          </Section>

          <Section title="Links">
            {convenio.link_externo ? (
              <a
                href={convenio.link_externo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-[#0072F7] hover:bg-blue-100 transition-colors"
              >
                Ver no TransfereGov
              </a>
            ) : (
              <span className="text-xs text-gray-500">
                Link nao disponivel
              </span>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">{title}</h3>
      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  )
}
