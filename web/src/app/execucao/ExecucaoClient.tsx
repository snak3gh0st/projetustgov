'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { formatCNPJ, formatCompactCurrency, formatCurrency, formatDate } from '@/lib/format'
import KPIRow from '@/components/KPIRow'
import ExecucaoSlideOver from '@/components/ExecucaoSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'

interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  crm_status: string
  aprovacao_status: string
  total_projetos: number
  total_repasse: string
  total_desembolsado: string
  total_saldo: string
  total_valor_global: string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  qtd_alertas: number
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_telefone: string | null
  contact_email: string | null
  contact_nome: string | null
  contact_telefone_status: string | null
  total_propostas_db: number
  vendedor_nome: string | null
  vendedor_id: string | null
  observacoes_execucao: string | null
  days_since_last_contact: number | null
  tag_autossuficiente: boolean
  tag_iniciante: boolean
  tag_desembolso: boolean
  tag_lobby: boolean
  tag_rendimento: boolean
}

const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
]

const STATUS_OPTIONS = ['Não Contatado', 'Ainda Não', 'Retorno', 'Quente', 'Muito Quente', 'Proposta', 'Aguardando Closer', 'Fechado', 'Telefone Invalido']

const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 text-orange-600',
  'Ainda Não': 'bg-yellow-50 text-yellow-600',
  'Retorno': 'bg-amber-50 text-amber-600',
  'Quente': 'bg-red-50 text-red-600',
  'Muito Quente': 'bg-red-100 text-red-700',
  'Proposta': 'bg-blue-50 text-[#0072F7]',
  'Aguardando Closer': 'bg-purple-50 text-purple-600',
  'Fechado': 'bg-green-50 text-green-600',
  'Telefone Invalido': 'bg-gray-50 text-gray-500',
}

export default function ExecucaoClient({ userRole }: { userRole: string }) {
  const isGestor = userRole === 'gestor' || userRole === 'coordenador'
  const [rows, setRows] = useState<ExecucaoAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uf, setUf] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [alertOnly, setAlertOnly] = useState(false)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null)
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [vendedoresList, setVendedoresList] = useState<{ id: string; nome: string; lead_count: number }[]>([])
  const [assignModal, setAssignModal] = useState<{ cnpj: string; nome: string | null; vendedor: string | null } | null>(null)
  const [sortCol, setSortCol] = useState<string>('execucao')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const hasLoadedRef = useRef(false)
  const fetchAbortRef = useRef<AbortController | null>(null)

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const fetchData = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? hasLoadedRef.current
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    if (background) setRefreshing(true)
    else setLoading(true)

    setError(false)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (uf) params.set('uf', uf)
    if (alertOnly) params.set('alert_only', 'true')
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
    try {
      const res = await fetch(`/api/execucao?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setRows(data.rows ?? [])
      setLastSynced(data.last_synced ?? null)
      hasLoadedRef.current = true
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(true)
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        if (background) setRefreshing(false)
        else setLoading(false)
      }
    }
  }, [search, uf, alertOnly, vendedorFilter])

  useEffect(() => {
    const timer = setTimeout(() => { void fetchData() }, 300)
    return () => clearTimeout(timer)
  }, [fetchData])

  useEffect(() => {
    return () => fetchAbortRef.current?.abort()
  }, [])

  // Fetch vendedores list for filter (gestor only)
  useEffect(() => {
    if (!isGestor) return
    fetch('/api/vendedores')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setVendedoresList(data) })
      .catch(() => {})
  }, [isGestor])

  const updateStatus = useCallback(async (cnpj: string, newStatus: string) => {
    setRows(prev => prev.map(r => r.cnpj === cnpj ? { ...r, crm_status: newStatus } : r))
    try {
      await fetch(`/api/execucao/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_contato: newStatus }),
      })
    } catch {
      // Revert on failure
      void fetchData({ background: true })
    }
  }, [fetchData])

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const handleContactSummaryUpdate = useCallback((payload: {
    cnpj: string
    contact_telefone: string | null
    contact_email: string | null
    contact_nome: string | null
    contact_telefone_status: string | null
  }) => {
    setRows(prev => prev.map(row =>
      row.cnpj === payload.cnpj
        ? {
            ...row,
            contact_telefone: payload.contact_telefone,
            contact_email: payload.contact_email,
            contact_nome: payload.contact_nome,
            contact_telefone_status: payload.contact_telefone_status,
          }
        : row
    ))
  }, [])

  const TAG_KEYS: { key: string; field: keyof ExecucaoAggRow; label: string; bg: string; text: string; border: string }[] = [
    { key: 'autossuficiente', field: 'tag_autossuficiente', label: 'Autossuficiente', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    { key: 'iniciante', field: 'tag_iniciante', label: 'Iniciante', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { key: 'desembolso', field: 'tag_desembolso', label: 'Desembolso', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { key: 'lobby', field: 'tag_lobby', label: 'Lobby', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { key: 'rendimento', field: 'tag_rendimento', label: 'Rendimento', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  ]

  const filteredRows = useMemo(() => {
    let result = rows
    if (statusFilter) {
      result = result.filter(r => r.crm_status === statusFilter)
    }
    if (activeTags.size === 0) return result
    const tagsArr = Array.from(activeTags)
    return result.filter(r =>
      tagsArr.some(tag => {
        const def = TAG_KEYS.find(t => t.key === tag)
        return def ? r[def.field] : false
      })
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeTags, statusFilter])

  const kpis = useMemo(() => [
    {
      title: 'Clientes Qualificados',
      value: String(filteredRows.length),
      icon: '\u{1F3E2}',
    },
    {
      title: 'Total Fomentos',
      value: String(filteredRows.reduce((s, r) => s + r.total_projetos, 0)),
      icon: '\u{1F4CB}',
    },
    {
      title: 'Valor Total Convenios',
      value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_valor_global), 0)),
      icon: '\u{1F4B0}',
    },
    {
      title: 'Saldo em Conta',
      value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_saldo), 0)),
      icon: '\u{1F4B3}',
    },
    {
      title: 'Alertas Ativos',
      value: String(filteredRows.filter(r => r.tem_alerta).length),
      icon: '\u26A0',
    },
  ], [filteredRows])

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    const sorted = [...filteredRows].sort((a, b) => {
      let va: string | number | boolean | null = null
      let vb: string | number | boolean | null = null
      switch (sortCol) {
        case 'nome': va = a.nome_proponente ?? ''; vb = b.nome_proponente ?? ''; break
        case 'valor': va = Number(a.total_valor_global); vb = Number(b.total_valor_global); break
        case 'local': va = `${a.municipio ?? ''} ${a.uf ?? ''}`; vb = `${b.municipio ?? ''} ${b.uf ?? ''}`; break
        case 'desembolsado': va = Number(a.total_desembolsado); vb = Number(b.total_desembolsado); break
        case 'saldo': va = Number(a.total_saldo); vb = Number(b.total_saldo); break
        case 'execucao': va = a.pct_execucao_ponderado != null ? Number(a.pct_execucao_ponderado) : null; vb = b.pct_execucao_ponderado != null ? Number(b.pct_execucao_ponderado) : null; break
        case 'vigencia': va = a.data_fim_vigencia_mais_proxima ?? ''; vb = b.data_fim_vigencia_mais_proxima ?? ''; break
        case 'alerta': va = a.tem_alerta ? 1 : 0; vb = b.tem_alerta ? 1 : 0; break
        case 'contato': va = a.contact_telefone ?? ''; vb = b.contact_telefone ?? ''; break
        case 'ult_contato': va = a.days_since_last_contact ?? 9999; vb = b.days_since_last_contact ?? 9999; break
        case 'status': va = a.crm_status; vb = b.crm_status; break
        case 'vendedor': va = (a.vendedor_nome ?? '').toLowerCase(); vb = (b.vendedor_nome ?? '').toLowerCase(); break
      }
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredRows, sortCol, sortDir])

  const SortIcon = ({ col }: { col: string }) => (
    <span className="inline-flex ml-1 text-gray-400">
      {sortCol === col ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
    </span>
  )

  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Reset visible count when data or filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [sortedRows.length, sortCol, sortDir])

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount])

  const showBlockingLoad = loading && rows.length === 0
  const showBlockingError = error && rows.length === 0

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-bold text-gray-900">Projetos em Execucao</h1>
          {refreshing && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#0072F7]">
              Atualizando lista...
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">Convenios ativos por proponente — dados TransferenciaGov</p>
        {lastSynced && (
          <p className="text-xs text-gray-400 mt-1">Dados atualizados em {formatDate(lastSynced)}</p>
        )}
      </div>

      {/* KPI Row */}
      {!showBlockingLoad && !showBlockingError && <KPIRow items={kpis} />}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por CNPJ ou nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
        />
        <select
          value={uf}
          onChange={e => setUf(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
        >
          <option value="">UF</option>
          {UF_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
        >
          <option value="">Todos Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isGestor && (
          <select
            value={vendedorFilter}
            onChange={e => setVendedorFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
          >
            <option value="">Todos Vendedores</option>
            <option value="unassigned">Não atribuídos</option>
            {vendedoresList.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={e => setAlertOnly(e.target.checked)}
            className="rounded border-gray-300 text-[#0072F7] focus:ring-[#0072F7]"
          />
          Apenas alertas
        </label>
      </div>

      {/* Tag filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium mr-1">Tags:</span>
        {TAG_KEYS.map(tag => {
          const active = activeTags.has(tag.key)
          return (
            <button
              key={tag.key}
              onClick={() => toggleTag(tag.key)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? `${tag.bg} ${tag.text} ${tag.border} ring-2 ring-offset-1 ring-current`
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
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
            className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Loading state */}
      {showBlockingLoad && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-400">Carregando projetos...</div>
        </div>
      )}

      {/* Error state */}
      {showBlockingError && (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-red-500">Erro ao carregar dados. Verifique sua conexao e tente novamente.</p>
        </div>
      )}

      {/* Non-blocking refresh error */}
      {error && rows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Nao foi possivel atualizar a lista agora. Mantendo os projetos ja carregados.
        </div>
      )}

      {/* Empty state */}
      {!showBlockingLoad && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <h2 className="text-lg font-medium text-gray-700">Nenhum projeto encontrado</h2>
          <p className="text-sm text-gray-400">Nao foram encontrados projetos em execucao. Verifique os filtros ou aguarde o proximo sync.</p>
        </div>
      )}

      {/* Table */}
      {!showBlockingLoad && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-[1500px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th onClick={() => toggleSort('nome')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Instituição<SortIcon col="nome" />
                </th>
                {isGestor && (
                  <th onClick={() => toggleSort('vendedor')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                    Vendedor<SortIcon col="vendedor" />
                  </th>
                )}
                <th onClick={() => toggleSort('valor')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Valor<SortIcon col="valor" />
                </th>
                <th onClick={() => toggleSort('local')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Local<SortIcon col="local" />
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  Contato
                </th>
                <th onClick={() => toggleSort('ult_contato')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Ult.<SortIcon col="ult_contato" />
                </th>
                <th onClick={() => toggleSort('desembolsado')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Desemb.<SortIcon col="desembolsado" />
                </th>
                <th onClick={() => toggleSort('saldo')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Saldo<SortIcon col="saldo" />
                </th>
                <th onClick={() => toggleSort('execucao')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  % Exec.<SortIcon col="execucao" />
                </th>
                <th onClick={() => toggleSort('vigencia')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Vigência<SortIcon col="vigencia" />
                </th>
                <th onClick={() => toggleSort('alerta')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Alerta<SortIcon col="alerta" />
                </th>
                <th onClick={() => toggleSort('status')} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-[#0072F7] select-none">
                  Status<SortIcon col="status" />
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap min-w-[180px]">
                  Tags
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const hasContact = row.contact_telefone || row.contact_email
                const pct = row.pct_execucao_ponderado != null ? Number(row.pct_execucao_ponderado) : null

                return (
                  <tr
                    key={row.cnpj}
                    onClick={() => setSelectedCnpj(row.cnpj)}
                    className={`border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !hasContact ? 'bg-red-50/30 border-l-2 border-l-red-300' :
                      row.tem_alerta ? 'border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    {/* INSTITUIÇÃO */}
                    <td className="px-2 py-2 max-w-[240px]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-900 font-medium text-sm leading-tight whitespace-normal break-words">
                            {row.nome_proponente || '-'}
                          </span>
                          <a
                            href={`/lead/${encodeURIComponent(row.cnpj)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex-shrink-0 text-gray-300 hover:text-[#0072F7] transition-colors"
                            title="Abrir em nova aba"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                          </a>
                        </div>
                        <span className="font-mono text-[11px] text-gray-400 mt-0.5 block">{formatCNPJ(row.cnpj)}</span>
                      </div>
                    </td>

                    {/* VENDEDOR */}
                    {isGestor && (
                      <td className="px-2 py-2 text-sm text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {row.vendedor_nome || <span className="text-gray-300">Sem dono</span>}
                          <button
                            onClick={e => { e.stopPropagation(); setAssignModal({ cnpj: row.cnpj, nome: row.nome_proponente, vendedor: row.vendedor_nome }) }}
                            className="text-gray-300 hover:text-[#0072F7] transition-colors flex-shrink-0"
                            title={row.vendedor_nome ? 'Reatribuir' : 'Atribuir vendedor'}
                          >
                            {row.vendedor_nome ? '\u21BB' : '+'}
                          </button>
                        </div>
                      </td>
                    )}

                    {/* VALOR */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-sigma-neon font-semibold text-sm">
                        {formatCompactCurrency(Number(row.total_valor_global))}
                      </span>
                    </td>

                    {/* LOCAL */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-gray-600 text-xs">
                        {row.municipio && row.uf ? `${row.municipio}, ${row.uf}` : row.uf || row.municipio || '-'}
                      </span>
                    </td>

                    {/* CONTATO */}
                    <td className="px-2 py-2 max-w-[160px]">
                      {hasContact ? (
                        <div className="space-y-0.5">
                          {row.contact_telefone && (
                            <div className="flex items-center text-xs text-gray-600 truncate">
                              {row.contact_telefone_status === 'valido' && (
                                <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1 flex-shrink-0" />
                              )}
                              {row.contact_telefone_status === 'invalido' && (
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1 flex-shrink-0" />
                              )}
                              {row.contact_telefone_status === 'nao_atende' && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1 flex-shrink-0" />
                              )}
                              {row.contact_telefone}
                            </div>
                          )}
                          {row.contact_email && (
                            <div className="text-xs text-gray-400 truncate">{row.contact_email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500/70">Sem contato</span>
                      )}
                    </td>

                    {/* ULT. CONTATO */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.days_since_last_contact == null ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Nunca</span>
                      ) : row.days_since_last_contact <= 2 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">{row.days_since_last_contact}d</span>
                      ) : row.days_since_last_contact <= 7 ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{row.days_since_last_contact}d</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{row.days_since_last_contact}d</span>
                      )}
                    </td>

                    {/* DESEMBOLSADO */}
                    <td className="px-2 py-2 text-sm text-gray-700 whitespace-nowrap">
                      {formatCompactCurrency(Number(row.total_desembolsado))}
                    </td>

                    {/* SALDO */}
                    <td className="px-2 py-2 text-[#0072F7] font-bold text-sm whitespace-nowrap">
                      {formatCompactCurrency(Number(row.total_saldo))}
                    </td>

                    {/* % EXECUÇÃO */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      {pct != null ? (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          pct >= 80 ? 'bg-green-100 text-green-700' :
                          pct >= 50 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {pct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">--</span>
                      )}
                    </td>

                    {/* VIGÊNCIA */}
                    <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(row.data_fim_vigencia_mais_proxima)}</td>

                    {/* ALERTA */}
                    <td className="px-2 py-2">
                      {row.tem_alerta && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-help"
                          title={`${row.qtd_alertas} de ${row.total_projetos} convenio(s) com valor desembolsado = R$ 0,00`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                          {row.qtd_alertas}/{row.total_projetos}
                        </span>
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="px-2 py-2">
                      <select
                        value={row.crm_status || 'Não Contatado'}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { void updateStatus(row.cnpj, e.target.value) }}
                        className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STATUS_COLORS[row.crm_status] || STATUS_COLORS['Não Contatado']}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    {/* TAGS */}
                    <td className="px-2 py-2 min-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {row.aprovacao_status && row.aprovacao_status !== 'Não Contatado' && (
                          <a
                            href={`/lead/${encodeURIComponent(row.cnpj)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                            title={`Status em Aprovação: ${row.aprovacao_status} — clique para ver detalhes`}
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                            Contatado (Aprovação)
                          </a>
                        )}
                        {row.tag_autossuficiente && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">Autossuficiente</span>}
                        {row.tag_iniciante && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">Iniciante</span>}
                        {row.tag_desembolso && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Desembolso</span>}
                        {row.tag_lobby && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">Lobby</span>}
                        {row.tag_rendimento && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200">Rendimento</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more + Row count + Export */}
      {!showBlockingLoad && rows.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-gray-500">
            {activeTags.size > 0 || statusFilter
              ? `Mostrando ${visibleRows.length} de ${sortedRows.length} CNPJs (${rows.length} total)`
              : `Mostrando ${visibleRows.length} de ${rows.length} CNPJs (${rows.reduce((s, r) => s + r.total_projetos, 0)} fomentos)`
            }
          </div>
          <div className="flex items-center gap-2">
            {/* mirrors canExportContacts() in dal.ts — admin-tier only */}
            {(userRole === 'gestor' || userRole === 'admin') && (
              <button
                onClick={() => {
                  const params = new URLSearchParams()
                  if (statusFilter) params.set('status', statusFilter)
                  if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
                  window.open(`/api/execucao/export?${params}`, '_blank')
                }}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Exportar CSV
              </button>
            )}
            {visibleCount < sortedRows.length && (
              <button
                onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, sortedRows.length))}
                className="px-4 py-2 text-sm font-medium text-[#0072F7] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                Carregar mais {Math.min(PAGE_SIZE, sortedRows.length - visibleCount)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Assignment modal */}
      {assignModal && (
        <LeadAssignmentModal
          cnpj={assignModal.cnpj}
          leadNome={assignModal.nome}
          currentVendedor={assignModal.vendedor}
          onClose={() => setAssignModal(null)}
          onAssigned={() => { setAssignModal(null); void fetchData({ background: true }) }}
        />
      )}

      {/* Slide-over for CNPJ detail */}
      {(() => {
        const selectedRow = rows.find(r => r.cnpj === selectedCnpj)
        return (
          <ExecucaoSlideOver
            cnpj={selectedCnpj}
            nomeProponente={selectedRow?.nome_proponente ?? null}
            temAlerta={selectedRow?.tem_alerta ?? false}
            contactPresent={selectedRow ? !!(selectedRow.contact_telefone || selectedRow.contact_email) : false}
            totalValorGlobal={selectedRow?.total_valor_global ?? null}
            totalPropostas={selectedRow?.total_propostas_db ?? 0}
            tagAutossuficiente={selectedRow?.tag_autossuficiente ?? false}
            tagIniciante={selectedRow?.tag_iniciante ?? false}
            tagDesembolso={selectedRow?.tag_desembolso ?? false}
            tagLobby={selectedRow?.tag_lobby ?? false}
            tagRendimento={selectedRow?.tag_rendimento ?? false}
            observacoesExecucao={selectedRow?.observacoes_execucao ?? null}
            userRole={userRole}
            onContactSummaryUpdate={handleContactSummaryUpdate}
            onClose={() => {
              setSelectedCnpj(null)
              void fetchData({ background: true })
            }}
          />
        )
      })()}
    </div>
  )
}
