'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import PriorityBadge from '@/components/PriorityBadge'
import CsmSideCard from '@/components/CsmSideCard'

interface CsmDashboardClientProps {
  userRole: string
  userName: string | null
}

type CsmClientRow = {
  cnpj: string
  nome_proponente: string
  total_saldo_conta: number
  total_a_desembolsar: number
  total_rendimento: number
  total_a_liberar: number
  count_execucao_saldo: number
  count_a_desembolsar: number
  count_aprovacao: number
  count_prestacao_contas: number
  priority_level: 1 | 2 | 3 | 4 | 5 | null
}

type CsmProjectRow = {
  phase: 'aprovacao' | 'execucao'
  cnpj: string
  identifier: string
  nr_proposta: string
  objeto: string | null
  situacao: string | null
  valor_global: number | null
  valor_repasse: number | null
  valor_desembolsado: number | null
  saldo_conta: number | null
  rendimento_aplicacao: number | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  uf: string | null
  municipio: string | null
  priority_level: 1 | 2 | 3 | 4 | 5 | null
}

const PC_PATTERN = /presta.*conta/i

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ProjectSubTable({
  title,
  projects,
}: {
  title: string
  projects: CsmProjectRow[]
}) {
  if (projects.length === 0) return null
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{title}</h4>
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400">Identificador</th>
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400">Objeto</th>
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400">Situação</th>
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400 text-right">Valor Global</th>
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400 text-right">Saldo</th>
            <th className="py-1 pr-3 font-medium text-gray-500 dark:text-gray-400">UF</th>
            <th className="py-1 font-medium text-gray-500 dark:text-gray-400">Prioridade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {projects.map((p) => (
            <tr key={p.identifier} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{p.identifier}</td>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                {p.objeto ? p.objeto.slice(0, 80) : '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{p.situacao ?? '—'}</td>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 text-right tabular-nums">
                {p.valor_global != null ? formatCompactCurrency(p.valor_global) : '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 text-right tabular-nums">
                {p.saldo_conta != null ? formatCompactCurrency(p.saldo_conta) : '—'}
              </td>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{p.uf ?? '—'}</td>
              <td className="py-1.5">
                <PriorityBadge level={p.priority_level} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CsmDashboardClient({ userRole, userName }: CsmDashboardClientProps) {
  const [clients, setClients] = useState<CsmClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Set<number>>(new Set())
  const [saldoMin, setSaldoMin] = useState('')
  const [saldoMax, setSaldoMax] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [projectsCache, setProjectsCache] = useState<Record<string, CsmProjectRow[]>>({})
  const [loadingProjects, setLoadingProjects] = useState<Set<string>>(new Set())
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [exportCidade, setExportCidade] = useState<'ambas' | 'Brasília' | 'Goiânia'>('ambas')

  // Mount fetch (also triggered by retry)
  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    fetch('/api/csm/portfolio', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (!cancel) {
          setClients(data.clients ?? [])
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancel) {
          setError(`Falha ao carregar clientes (${err})`)
          setLoading(false)
        }
      })
    return () => { cancel = true }
  }, [fetchTrigger])

  // Derived filtered list
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    const searchDigits = search.replace(/\D/g, '')
    const minVal = saldoMin === '' ? null : Number(saldoMin)
    const maxVal = saldoMax === '' ? null : Number(saldoMax)

    return clients.filter(c => {
      // Search match: name or CNPJ digits
      if (s) {
        const nameMatch = c.nome_proponente.toLowerCase().includes(s)
        const cnpjMatch = searchDigits !== '' && c.cnpj.includes(searchDigits)
        if (!nameMatch && !cnpjMatch) return false
      }
      // Priority filter
      if (priorityFilter.size > 0) {
        if (c.priority_level === null || !priorityFilter.has(c.priority_level)) return false
      }
      // Saldo range
      if (minVal !== null && c.total_saldo_conta < minVal) return false
      if (maxVal !== null && c.total_saldo_conta > maxVal) return false
      return true
    })
  }, [clients, search, priorityFilter, saldoMin, saldoMax])

  const togglePriorityFilter = (level: number) => {
    setPriorityFilter(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  const toggleExpand = (cnpj: string) => {
    const isCurrentlyExpanded = expanded.has(cnpj)
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(cnpj)) {
        next.delete(cnpj)
      } else {
        next.add(cnpj)
      }
      return next
    })
    // Fetch projects on first expand — must be outside the setState updater
    // so it does not run twice in React StrictMode
    if (!isCurrentlyExpanded && !projectsCache[cnpj]) {
      setLoadingProjects(p => new Set(p).add(cnpj))
      fetch(`/api/csm/clients/${cnpj}/projects`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => {
          setProjectsCache(c => ({ ...c, [cnpj]: data.projects ?? [] }))
          setLoadingProjects(p => { const x = new Set(p); x.delete(cnpj); return x })
        })
        .catch(() => {
          setLoadingProjects(p => { const x = new Set(p); x.delete(cnpj); return x })
        })
    }
  }

  const exportClientsCSV = () => {
    const cidades = exportCidade === 'ambas' ? 'Brasília,Goiânia' : exportCidade
    const a = document.createElement('a')
    a.href = `/api/csm/clients/export?cidades=${encodeURIComponent(cidades)}`
    a.click()
  }

  // Loading state
  if (loading && clients.length === 0) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Clientes CSM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Area de Customer Success — sessao ativa: {userName ?? 'sem nome'} ({userRole})
          </p>
        </header>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
            <SpinnerIcon />
            <span className="text-sm">Carregando clientes…</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Clientes CSM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Area de Customer Success — sessao ativa: {userName ?? 'sem nome'} ({userRole})
          </p>
        </header>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-md p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={() => setFetchTrigger(t => t + 1)}
            className="mt-2 text-sm text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const priorityLevels: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5]

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Clientes CSM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Area de Customer Success — sessao ativa: {userName ?? 'sem nome'} ({userRole})
          </p>
        </div>

        {/* Extraction area — export the full client base by city, not limited to this portfolio */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Extrair base de clientes</label>
            <select
              value={exportCidade}
              onChange={e => setExportCidade(e.target.value as typeof exportCidade)}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="ambas">Brasília + Goiânia</option>
              <option value="Brasília">Brasília</option>
              <option value="Goiânia">Goiânia</option>
            </select>
          </div>
          <button
            onClick={exportClientsCSV}
            className="rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5"
          >
            Baixar CSV
          </button>
        </div>
      </header>

      {/* Filters bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4 flex flex-wrap gap-3 items-end">
        {/* Search input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Busca</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CNPJ"
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 w-64"
          />
        </div>

        {/* Priority filter pills */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Prioridade</label>
          <div className="flex gap-1.5">
            {priorityLevels.map(level => (
              <button
                key={level}
                onClick={() => togglePriorityFilter(level)}
                className={`rounded-full transition-opacity ${priorityFilter.has(level) ? 'opacity-100 ring-2 ring-offset-1 ring-blue-400' : 'opacity-60 hover:opacity-80'}`}
              >
                <PriorityBadge level={level} />
              </button>
            ))}
          </div>
        </div>

        {/* Saldo range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Saldo mín</label>
          <input
            type="number"
            value={saldoMin}
            onChange={e => setSaldoMin(e.target.value)}
            placeholder="0"
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Saldo máx</label>
          <input
            type="number"
            value={saldoMax}
            onChange={e => setSaldoMax(e.target.value)}
            placeholder="sem limite"
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 w-32"
          />
        </div>
      </div>

      {/* Result counter */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Mostrando {filtered.length} de {clients.length} clientes
      </p>

      {/* Empty state */}
      {filtered.length === 0 && !loading && !error && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum cliente encontrado</p>
        </div>
      )}

      {/* Main table */}
      {filtered.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400">Cliente</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">Saldo em Conta</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">A Desembolsar</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">Saldo Rendimento</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">A Liberar</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400">Projetos</th>
                <th className="px-3 py-3 font-medium text-gray-600 dark:text-gray-400">Prioridade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(c => {
                const isExpanded = expanded.has(c.cnpj)
                const projects = projectsCache[c.cnpj]
                const isLoadingProjects = loadingProjects.has(c.cnpj)

                // Project count pills — only render when count > 0
                const countPills: Array<{ label: string; count: number; color: string }> = [
                  { label: 'Saldo', count: c.count_execucao_saldo, color: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
                  { label: 'A Desemb', count: c.count_a_desembolsar, color: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' },
                  { label: 'Aprov', count: c.count_aprovacao, color: 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400' },
                  { label: 'PC', count: c.count_prestacao_contas, color: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400' },
                ]

                return (
                  <React.Fragment key={c.cnpj}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      {/* Chevron */}
                      <td className="px-3 py-3 cursor-pointer" onClick={() => toggleExpand(c.cnpj)}>
                        <ChevronIcon expanded={isExpanded} />
                      </td>
                      {/* Cliente */}
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{c.nome_proponente}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{formatCNPJ(c.cnpj)}</div>
                        <button
                          onClick={() => setSelectedClient(c.cnpj)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline mt-1"
                        >
                          [Details]
                        </button>
                      </td>
                      {/* Saldo em Conta */}
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCompactCurrency(c.total_saldo_conta)}
                      </td>
                      {/* A Desembolsar */}
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCompactCurrency(c.total_a_desembolsar)}
                      </td>
                      {/* Saldo Rendimento */}
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCompactCurrency(c.total_rendimento)}
                      </td>
                      {/* A Liberar */}
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCompactCurrency(c.total_a_liberar)}
                      </td>
                      {/* Projetos */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {countPills
                            .filter(p => p.count > 0)
                            .map(p => (
                              <span
                                key={p.label}
                                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${p.color}`}
                              >
                                {p.label}: {p.count}
                              </span>
                            ))}
                        </div>
                      </td>
                      {/* Prioridade */}
                      <td className="px-3 py-3">
                        <PriorityBadge level={c.priority_level} />
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                          {isLoadingProjects ? (
                            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
                              <SpinnerIcon />
                              <span>Carregando projetos…</span>
                            </div>
                          ) : !projects || projects.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum projeto encontrado para este CNPJ</p>
                          ) : (
                            <div>
                              <ProjectSubTable
                                title="Aprovação"
                                projects={projects.filter(p => p.phase === 'aprovacao')}
                              />
                              <ProjectSubTable
                                title="Execução"
                                projects={projects.filter(
                                  p => p.phase === 'execucao' && !PC_PATTERN.test(p.situacao ?? '')
                                )}
                              />
                              <ProjectSubTable
                                title="Prestação de Contas"
                                projects={projects.filter(
                                  p => p.phase === 'execucao' && PC_PATTERN.test(p.situacao ?? '')
                                )}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Side Card */}
      {selectedClient && (
        <CsmSideCard cnpj={selectedClient} onClose={() => setSelectedClient(null)} />
      )}
    </div>
  )
}
