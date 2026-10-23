'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'
import { useLinkWhatsappFn } from '@/components/whatsapp/WhatsappNoProjete'
import ExecucaoSlideOver from '@/components/ExecucaoSlideOver'
import LeadAssignmentModal from '@/components/LeadAssignmentModal'
import { canEditLeads } from '@/lib/roles'
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
import { CRM_STATUS_SELECT_OPTIONS, formatCrmStatusLabel, isClosedCrmStatus, normalizeCrmStatus } from '@/lib/crm-catalog'
import type { ExecucaoFase } from '@/lib/execucao-fase'

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
  valor_venda_fechado: string | null
  tipo_servico: string | null
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

const STATUS_OPTIONS = CRM_STATUS_SELECT_OPTIONS

const TAG_KEYS: { key: string; field: keyof ExecucaoAggRow; label: string; tone: keyof typeof TAG_TONE }[] = [
  { key: 'autossuficiente', field: 'tag_autossuficiente', label: 'Autossuficiente', tone: 'rose' },
  { key: 'iniciante', field: 'tag_iniciante', label: 'Iniciante', tone: 'sky' },
  { key: 'desembolso', field: 'tag_desembolso', label: 'Desembolso', tone: 'emerald' },
  { key: 'lobby', field: 'tag_lobby', label: 'Lobby', tone: 'violet' },
  { key: 'rendimento', field: 'tag_rendimento', label: 'Rendimento', tone: 'teal' },
]

const PAGE_SIZE = 50

// Lista de convênios por proponente numa fase do TransfereGov. Quem a usa (página Leads, aba Operação do CSM) cuida do título e das abas.
export default function ExecucaoClient({
  userRole,
  fase,
  initialStatus = '',
  initialAlertOnly = false,
}: {
  userRole: string
  /** null = as duas fases juntas (aba Operação do CSM). */
  fase: ExecucaoFase | null
  initialStatus?: string
  initialAlertOnly?: boolean
}) {
  const linkWhatsapp = useLinkWhatsappFn()
  const toast = useToast()
  const isGestor = userRole === 'gestor' || userRole === 'diretoria' || userRole === 'coordenador'
  const [rows, setRows] = useState<ExecucaoAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uf, setUf] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus ? normalizeCrmStatus(initialStatus) : '')
  const [alertOnly, setAlertOnly] = useState(initialAlertOnly)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null)
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [vendedoresList, setVendedoresList] = useState<{ id: string; nome: string; lead_count: number }[]>([])
  const [assignModal, setAssignModal] = useState<{ cnpj: string; nome: string | null; vendedor: string | null } | null>(null)
  const [sortCol, setSortCol] = useState<string>('execucao')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
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
    if (fase) params.set('fase', fase)
    try {
      const res = await fetch(`/api/execucao?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setRows((data.rows ?? []).map((row: ExecucaoAggRow) => ({
        ...row,
        crm_status: normalizeCrmStatus(row.crm_status),
        aprovacao_status: normalizeCrmStatus(row.aprovacao_status),
      })))
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
  }, [search, uf, alertOnly, vendedorFilter, fase])

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
    const previous = rows.find(r => r.cnpj === cnpj)?.crm_status
    setRows(prev => prev.map(r => r.cnpj === cnpj ? { ...r, crm_status: newStatus } : r))
    try {
      const res = await fetch(`/api/execucao/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_contato: newStatus }),
      })
      if (!res.ok) throw new Error('patch failed')
    } catch {
      setRows(prev => prev.map(r => r.cnpj === cnpj && previous !== undefined ? { ...r, crm_status: previous } : r))
      toast.error('Não foi possível salvar o status. Tente de novo.')
    }
  }, [rows, toast])

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
  }, [rows, activeTags, statusFilter])

  const stats = useMemo(() => [
    { label: 'Proponentes', value: filteredRows.length.toLocaleString('pt-BR') },
    { label: 'Convênios', value: filteredRows.reduce((s, r) => s + r.total_projetos, 0).toLocaleString('pt-BR') },
    { label: 'Valor dos convênios', value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_valor_global), 0)) },
    { label: 'Saldo em conta', value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_saldo), 0)) },
    { label: 'A desembolsar', value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Math.max(0, Number(r.total_repasse) - Number(r.total_desembolsado)), 0)) },
    { label: 'Com alerta', value: filteredRows.filter(r => r.tem_alerta).length.toLocaleString('pt-BR') },
  ], [filteredRows])

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    return [...filteredRows].sort((a, b) => {
      let va: string | number | boolean | null = null
      let vb: string | number | boolean | null = null
      switch (sortCol) {
        case 'nome': va = a.nome_proponente ?? ''; vb = b.nome_proponente ?? ''; break
        case 'valor': va = Number(a.total_valor_global); vb = Number(b.total_valor_global); break
        case 'venda': va = Number(a.valor_venda_fechado) || 0; vb = Number(b.valor_venda_fechado) || 0; break
        case 'local': va = `${a.municipio ?? ''} ${a.uf ?? ''}`; vb = `${b.municipio ?? ''} ${b.uf ?? ''}`; break
        case 'desembolsado': va = Number(a.total_desembolsado); vb = Number(b.total_desembolsado); break
        case 'saldo': va = Number(a.total_saldo); vb = Number(b.total_saldo); break
        case 'execucao': va = a.pct_execucao_ponderado != null ? Number(a.pct_execucao_ponderado) : null; vb = b.pct_execucao_ponderado != null ? Number(b.pct_execucao_ponderado) : null; break
        case 'vigencia': va = a.data_fim_vigencia_mais_proxima ?? ''; vb = b.data_fim_vigencia_mais_proxima ?? ''; break
        case 'alerta': va = a.tem_alerta ? 1 : 0; vb = b.tem_alerta ? 1 : 0; break
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
  }, [filteredRows, sortCol, sortDir])

  // Reset visible count when data or filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [sortedRows.length, sortCol, sortDir])

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount])

  const hasFilters = !!(search || uf || statusFilter || alertOnly || vendedorFilter || activeTags.size > 0)
  function clearFilters() {
    setSearch('')
    setUf('')
    setStatusFilter('')
    setAlertOnly(false)
    setVendedorFilter('')
    setActiveTags(new Set())
  }

  const showBlockingLoad = loading && rows.length === 0
  const showBlockingError = error && rows.length === 0
  const sortProps = { sortCol, sortDir, onSort: toggleSort }
  const faseLabel = fase === 'prestacao_contas' ? 'em prestação de contas' : fase === 'execucao' ? 'em execução' : 'em execução ou prestação de contas'

  return (
    <div className="space-y-4">
      {/* Resumo da fase */}
      {!showBlockingLoad && !showBlockingError && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="mt-0.5 font-heading text-lg font-semibold tabular text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

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
        <select aria-label="UF" value={uf} onChange={e => setUf(e.target.value)} className={selectClass}>
          <option value="">Todas as UFs</option>
          {UF_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">Todos os status</option>
          {/* Etapa vinda do funil da tela inicial que não está entre as opções */}
          {statusFilter && !(STATUS_OPTIONS as readonly string[]).includes(statusFilter) && (
            <option value={statusFilter}>{formatCrmStatusLabel(statusFilter)}</option>
          )}
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {isGestor && (
          <select aria-label="Vendedor" value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)} className={selectClass}>
            <option value="">Todos os vendedores</option>
            <option value="unassigned">Sem dono</option>
            {vendedoresList.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.lead_count})</option>)}
          </select>
        )}
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-ink-2 hover:text-ink">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={e => setAlertOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/40"
          />
          Só com alerta
        </label>
      </div>

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
        <p className="ml-auto text-xs text-ink-3" aria-live="polite">
          {refreshing ? 'Atualizando lista…' : lastSynced ? `Dados do TransfereGov de ${formatDate(lastSynced)}` : null}
        </p>
      </div>

      {/* Lista */}
      {showBlockingLoad ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <SkeletonRows rows={8} />
        </div>
      ) : showBlockingError ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title="Não foi possível carregar a lista"
            description="Verifique a conexão e tente de novo."
            action={<Button size="sm" onClick={() => { void fetchData() }}>Tentar de novo</Button>}
          />
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title={hasFilters ? 'Nenhum proponente com esses filtros' : `Nenhum proponente ${faseLabel}`}
            description={hasFilters ? 'Tire algum filtro para ver mais resultados.' : 'A lista é atualizada pela sincronização diária do TransfereGov.'}
            action={hasFilters ? <Button size="sm" onClick={clearFilters}>Limpar filtros</Button> : undefined}
          />
        </div>
      ) : (
        <>
          {error && (
            <p role="status" className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25">
              Não foi possível atualizar a lista agora. Mostrando os dados já carregados.
            </p>
          )}
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="border-b border-line bg-raised/60">
                <tr>
                  <SortHeader col="nome" label="Instituição" {...sortProps} />
                  {isGestor && <SortHeader col="vendedor" label="Vendedor" {...sortProps} />}
                  <SortHeader col="valor" label="Convênios" {...sortProps} />
                  <SortHeader col="venda" label="Venda" {...sortProps} />
                  <th className={thClass}>Serviço</th>
                  <SortHeader col="local" label="Local" {...sortProps} />
                  <th className={thClass}>Contato</th>
                  <SortHeader col="ult_contato" label="Último contato" {...sortProps} />
                  <SortHeader col="desembolsado" label="Desembolsado" {...sortProps} />
                  <SortHeader col="saldo" label="Saldo" {...sortProps} />
                  <SortHeader col="execucao" label="Execução" {...sortProps} />
                  <SortHeader col="vigencia" label="Vigência" {...sortProps} />
                  <SortHeader col="alerta" label="Alerta" {...sortProps} />
                  <SortHeader col="status" label="Status" {...sortProps} />
                  <th className={`${thClass} min-w-[180px]`}>Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleRows.map(row => {
                  const hasContact = row.contact_telefone || row.contact_email
                  const wa = linkWhatsapp(row.contact_telefone, row.cnpj)
                  const pct = row.pct_execucao_ponderado != null ? Number(row.pct_execucao_ponderado) : null

                  return (
                    <tr
                      key={row.cnpj}
                      onClick={() => setSelectedCnpj(row.cnpj)}
                      className={`cursor-pointer align-top transition-colors duration-fast hover:bg-raised ${!hasContact ? 'bg-red-50/50 dark:bg-red-500/[0.06]' : ''}`}
                    >
                      <td className="max-w-[260px] px-3 py-2.5">
                        <div className="flex items-start gap-1">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setSelectedCnpj(row.cnpj) }}
                            className="text-left text-sm font-medium leading-snug text-ink hover:text-accent-ink focus:outline-none focus-visible:underline"
                          >
                            {row.nome_proponente || 'Sem nome'}
                          </button>
                          <OpenCardLink cnpj={row.cnpj} />
                        </div>
                        <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{formatCNPJ(row.cnpj)}</span>
                      </td>

                      {isGestor && (
                        <td className="whitespace-nowrap px-3 py-2.5 text-sm text-ink-2">
                          <div className="flex items-center gap-1.5">
                            {row.vendedor_nome || <span className="text-ink-3">Sem dono</span>}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setAssignModal({ cnpj: row.cnpj, nome: row.nome_proponente, vendedor: row.vendedor_nome }) }}
                              className="rounded px-1 text-xs font-medium text-accent-ink opacity-70 transition-opacity duration-fast hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50"
                            >
                              {row.vendedor_nome ? 'Trocar' : 'Atribuir'}
                            </button>
                          </div>
                        </td>
                      )}

                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular text-ink">
                        {formatCompactCurrency(Number(row.total_valor_global))}
                        {row.total_projetos > 1 && <span className="ml-1 text-xs font-normal text-ink-3">({row.total_projetos})</span>}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 tabular">
                        {row.valor_venda_fechado != null && Number(row.valor_venda_fechado) > 0 ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatCompactCurrency(Number(row.valor_venda_fechado))}</span>
                        ) : (
                          <span className="text-ink-3" aria-label="Sem venda">·</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5">
                        {row.tipo_servico ? <Tag tone="violet">{row.tipo_servico}</Tag> : <span className="text-ink-3" aria-label="Sem serviço">·</span>}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-2">
                        {row.municipio && row.uf ? `${row.municipio}, ${row.uf}` : row.uf || row.municipio || '-'}
                      </td>

                      <td className="max-w-[170px] px-3 py-2.5">
                        {hasContact ? (
                          <div className="space-y-0.5">
                            {row.contact_telefone && (
                              <div className="flex items-center truncate text-xs text-ink-2">
                                <PhoneStatusDot status={row.contact_telefone_status} />
                                {wa ? (
                                  <a
                                    href={wa.href}
                                    {...(wa.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                    onClick={e => e.stopPropagation()}
                                    className="truncate text-emerald-700 hover:underline dark:text-emerald-300"
                                    title="Conversar no WhatsApp"
                                  >
                                    {row.contact_telefone}
                                  </a>
                                ) : (
                                  <span className="truncate">{row.contact_telefone}</span>
                                )}
                              </div>
                            )}
                            {row.contact_email && <div className="truncate text-xs text-ink-3">{row.contact_email}</div>}
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-red-700 dark:text-red-300">Sem contato</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5"><LastContactBadge days={row.days_since_last_contact} /></td>

                      <td className="whitespace-nowrap px-3 py-2.5 tabular text-ink-2">{formatCompactCurrency(Number(row.total_desembolsado))}</td>

                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular text-accent-ink">{formatCompactCurrency(Number(row.total_saldo))}</td>

                      <td className="whitespace-nowrap px-3 py-2.5">
                        {pct != null ? (
                          <Tag tone={pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'}>{pct.toFixed(1)}%</Tag>
                        ) : (
                          <Tag tone="neutral">Sem dado</Tag>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular text-ink-2">{formatDate(row.data_fim_vigencia_mais_proxima)}</td>

                      <td className="px-3 py-2.5">
                        {row.tem_alerta && (
                          <Tag tone="amber" title={`${row.qtd_alertas} de ${row.total_projetos} convênio(s) sem nenhum valor desembolsado`}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                            {row.qtd_alertas}/{row.total_projetos}
                          </Tag>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusSelect
                          ariaLabel={`Status de ${row.nome_proponente || formatCNPJ(row.cnpj)}`}
                          status={row.crm_status || 'Não Contatado'}
                          label={formatCrmStatusLabel(row.crm_status || 'Não Contatado')}
                          // Só a gestão fecha venda: o consultor não recebe as etapas de venda concluída.
                          options={userRole === 'admin' ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => !isClosedCrmStatus(o))}
                          disabled={isGestor || !canEditLeads(userRole)}
                          onChange={value => { void updateStatus(row.cnpj, value) }}
                        />
                      </td>

                      <td className="min-w-[180px] px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.aprovacao_status && row.aprovacao_status !== 'Não Contatado' && (
                            <a
                              href={`/lead/${encodeURIComponent(row.cnpj)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title={`Status em Aprovação: ${row.aprovacao_status}. Abre o card do lead.`}
                              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                            >
                              <Tag tone="indigo">Contatado na Aprovação</Tag>
                            </a>
                          )}
                          {TAG_KEYS.filter(t => row[t.field]).map(t => <Tag key={t.key} tone={t.tone}>{t.label}</Tag>)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-3">
              {activeTags.size > 0 || statusFilter
                ? `Mostrando ${visibleRows.length} de ${sortedRows.length} proponentes (${rows.length} no total)`
                : `Mostrando ${visibleRows.length} de ${rows.length} proponentes (${rows.reduce((s, r) => s + r.total_projetos, 0)} convênios)`}
            </p>
            <div className="flex items-center gap-2">
              {/* mirrors canExportContacts() in dal.ts — admin-tier only */}
              {(userRole === 'gestor' || userRole === 'diretoria' || userRole === 'admin') && (
                <Button
                  size="sm"
                  onClick={() => {
                    const params = new URLSearchParams()
                    if (statusFilter) params.set('status', statusFilter)
                    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
                    if (fase) params.set('fase', fase)
                    window.open(`/api/execucao/export?${params}`, '_blank')
                  }}
                >
                  Exportar CSV
                </Button>
              )}
              {visibleCount < sortedRows.length && (
                <Button size="sm" variant="primary" onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, sortedRows.length))}>
                  Mostrar mais {Math.min(PAGE_SIZE, sortedRows.length - visibleCount)}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {assignModal && (
        <LeadAssignmentModal
          cnpj={assignModal.cnpj}
          leadNome={assignModal.nome}
          currentVendedor={assignModal.vendedor}
          onClose={() => setAssignModal(null)}
          onAssigned={() => { setAssignModal(null); void fetchData({ background: true }) }}
        />
      )}

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
