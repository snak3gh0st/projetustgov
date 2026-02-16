'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

const PRIORITY_COLORS: Record<string, { dot: string; bg: string; text: string; bar: string }> = {
  Alta: { dot: '🔴', bg: 'bg-red-500/10', text: 'text-red-400', bar: 'bg-red-500' },
  Média: { dot: '🟡', bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500' },
  Baixa: { dot: '🟢', bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-500' },
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
    saldo_min: 500000,
    uf: '',
    search: '',
  })
  const [selectedConvenio, setSelectedConvenio] = useState<ConvenioMonitoramento | null>(null)
  const [loading, setLoading] = useState(true)
  const [ufs, setUfs] = useState<string[]>([])
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saldoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced filter values
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedSaldo, setDebouncedSaldo] = useState(500000)

  const handleSearchChange = useCallback((value: string) => {
    setFilters(f => ({ ...f, search: value }))
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => setDebouncedSearch(value), 500)
  }, [])

  const handleSaldoChange = useCallback((value: number) => {
    setFilters(f => ({ ...f, saldo_min: value }))
    if (saldoTimeout.current) clearTimeout(saldoTimeout.current)
    saldoTimeout.current = setTimeout(() => setDebouncedSaldo(value), 500)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.prioridade) params.append('prioridade', filters.prioridade)
    params.append('saldo_min', debouncedSaldo.toString())
    if (filters.uf) params.append('uf', filters.uf)
    if (debouncedSearch) params.append('search', debouncedSearch)

    fetch(`/api/monitoramento?${params}`)
      .then(r => r.json())
      .then(data => {
        const items: ConvenioMonitoramento[] = data.convenios || []
        setConvenios(items)
        setStats(data.stats || { total_monitorados: 0, total_saldo: 0, alta_prioridade: 0, media_prioridade: 0, baixa_prioridade: 0 })
        // Extract unique UFs for dropdown (only on first load or when no UF filter)
        if (!filters.uf) {
          const uniqueUfs = Array.from(new Set(items.map(c => c.uf).filter((v): v is string => Boolean(v)))).sort()
          setUfs(uniqueUfs)
        }
      })
      .catch(err => console.error('Monitoramento fetch error:', err))
      .finally(() => setLoading(false))
  }, [filters.prioridade, filters.uf, debouncedSearch, debouncedSaldo])

  // Close modal on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedConvenio(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const priorityButtons = [
    { label: 'Todos', value: '' },
    { label: 'Alta', value: 'Alta' },
    { label: 'Média', value: 'Média' },
    { label: 'Baixa', value: 'Baixa' },
  ]

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">Monitoramento Financeiro</h1>
        <p className="text-sm text-gray-400 mt-1">
          Convênios em execução com saldo disponível para prospecção
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Monitorados" value={stats.total_monitorados.toLocaleString('pt-BR')} icon="📊" accent="blue" />
        <StatCard label="Total em Saldo" value={formatCompactCurrency(stats.total_saldo)} icon="💰" accent="blue" />
        <StatCard label="Alta Prioridade" value={String(stats.alta_prioridade)} icon="🔴" accent="red" />
        <StatCard label="Média Prioridade" value={String(stats.media_prioridade)} icon="🟡" accent="amber" />
        <StatCard label="Baixa Prioridade" value={String(stats.baixa_prioridade)} icon="🟢" accent="emerald" />
      </div>

      {/* Filter Bar */}
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Priority buttons */}
          <div className="flex gap-1">
            {priorityButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => setFilters(f => ({ ...f, prioridade: btn.value }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filters.prioridade === btn.value
                    ? 'bg-blue-500 text-gray-950'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Saldo mínimo */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Saldo min:</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">R$</span>
              <input
                type="number"
                value={filters.saldo_min}
                onChange={e => handleSaldoChange(Number(e.target.value) || 0)}
                className="w-32 bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* UF dropdown */}
          <select
            value={filters.uf}
            onChange={e => setFilters(f => ({ ...f, uf: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">Todos os Estados</option>
            {ufs.map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Buscar por nome ou CNPJ"
            value={filters.search}
            onChange={e => handleSearchChange(e.target.value)}
            className="flex-1 min-w-[180px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando convênios...</div>
        </div>
      ) : convenios.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          Nenhum convênio encontrado com os filtros selecionados
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-gray-900/80">
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nº Convênio</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Organização</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Saldo</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase min-w-[160px]">% Execução</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prioridade</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Ação</th>
              </tr>
            </thead>
            <tbody>
              {convenios.map((c, i) => {
                const colors = PRIORITY_COLORS[c.prioridade] || PRIORITY_COLORS['Média']
                return (
                  <tr
                    key={c.id || i}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-white/[0.02]'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-gray-300">
                      {c.nr_convenio ? (c.nr_convenio.length > 15 ? c.nr_convenio.slice(0, 15) + '...' : c.nr_convenio) : '-'}
                    </td>
                    <td className="px-3 py-2 text-white font-medium truncate max-w-[250px]">
                      {c.nome ? (c.nome.length > 50 ? c.nome.slice(0, 50) + '...' : c.nome) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{c.uf || '-'}</td>
                    <td className="px-3 py-2 text-blue-400 font-medium">{formatCompactCurrency(c.saldo_conta)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${colors.bar}`}
                            style={{ width: `${Math.min(c.perc_execucao, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-12 text-right">{c.perc_execucao.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {colors.dot} {c.prioridade}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedConvenio(c)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
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

      {/* Result count */}
      {!loading && convenios.length > 0 && (
        <p className="text-xs text-gray-500 text-right">{convenios.length} convênios encontrados</p>
      )}

      {/* Detail Modal */}
      {selectedConvenio && (
        <DetailModal convenio={selectedConvenio} onClose={() => setSelectedConvenio(null)} />
      )}
    </div>
  )
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent: string }) {
  const borderColor = accent === 'blue' ? 'border-blue-500/20' : accent === 'red' ? 'border-red-500/20' : accent === 'amber' ? 'border-amber-500/20' : 'border-emerald-500/20'
  const valueColor = accent === 'blue' ? 'text-blue-400' : accent === 'red' ? 'text-red-400' : accent === 'amber' ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className={`bg-gray-900/50 backdrop-blur-sm border border-gray-800 ${borderColor} rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-xl font-bold mt-1 ${valueColor}`}>{value}</p>
    </div>
  )
}

function DetailModal({ convenio, onClose }: { convenio: ConvenioMonitoramento; onClose: () => void }) {
  const colors = PRIORITY_COLORS[convenio.prioridade] || PRIORITY_COLORS['Média']
  const percSaldo = convenio.perc_execucao > 0 ? (100 - convenio.perc_execucao).toFixed(1) : '100.0'

  const priorityExplanations: Record<string, string> = {
    Alta: 'Alta prioridade - Baixa execução e alto saldo remanescente',
    Média: 'Média prioridade - Execução parcial em andamento',
    Baixa: 'Baixa prioridade - Alta execução, saldo reduzido',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-gray-900/95 backdrop-blur-md border border-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white">{convenio.nome || 'Organização'}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{convenio.cnpj ? formatCNPJ(convenio.cnpj) : '-'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-5">
          {/* Informações Básicas */}
          <Section title="Informações Básicas">
            <InfoRow label="Nome" value={convenio.nome} />
            <InfoRow label="CNPJ" value={convenio.cnpj ? formatCNPJ(convenio.cnpj) : null} />
            <InfoRow label="UF" value={convenio.uf} />
            <InfoRow label="Município" value={convenio.municipio} />
            <InfoRow label="Nº Convênio" value={convenio.nr_convenio} />
          </Section>

          {/* Contato */}
          <Section title="Contato">
            <InfoRow label="Email" value={convenio.email || 'Não informado'} />
            <InfoRow label="Telefone" value={convenio.telefone || 'Não informado'} />
          </Section>

          {/* Financeiro */}
          <Section title="Financeiro">
            <InfoRow label="Valor Global" value={formatCurrency(convenio.valor_global)} />
            <InfoRow label="Valor Liberado" value={formatCurrency(convenio.valor_liberado)} />
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400">Saldo em Conta</span>
              <span className="text-sm font-bold text-blue-400">{formatCurrency(convenio.saldo_conta)}</span>
            </div>
          </Section>

          {/* Execução */}
          <Section title="Execução">
            <div className="space-y-2">
              <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors.bar}`}
                  style={{ width: `${Math.min(convenio.perc_execucao, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Executado: {convenio.perc_execucao.toFixed(1)}% | Saldo: {percSaldo}%
              </p>
            </div>
          </Section>

          {/* Análise de Prioridade */}
          <Section title="Análise de Prioridade">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                {colors.dot} {convenio.prioridade}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {priorityExplanations[convenio.prioridade] || ''}
            </p>
          </Section>

          {/* Links */}
          <Section title="Links">
            {convenio.link_externo ? (
              <a
                href={convenio.link_externo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                Ver no TransfereGov ↗
              </a>
            ) : (
              <span className="text-xs text-gray-500" title="Link não disponível">
                Ver no TransfereGov (indisponível)
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
      <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm text-gray-200">{value || '-'}</span>
    </div>
  )
}
