'use client'

import { useCallback, useEffect, useState } from 'react'
import TGovStatusDonut from '@/components/TGovStatusDonut'
import CommentsThread from './CommentsThread'
import TecnicoSelector, { type Tecnico } from './TecnicoSelector'
import {
  BarChart as BIBarChart,
  Bar as BIBar,
  XAxis as BIXAxis,
  YAxis as BIYAxis,
  CartesianGrid as BICartesianGrid,
  Tooltip as BITooltipChart,
  Legend as BILegend,
  ResponsiveContainer as BIResponsiveContainer,
  PieChart as BIPieChart,
  Pie as BIPie,
  Cell as BICell,
} from 'recharts'
import {
  DEFAULT_MAIN_FILTERS,
  DEFAULT_EXECUCAO_MAIN_FILTERS,
  DEFAULT_TABLE_FILTERS,
  DEFAULT_TGOV_TAB,
  TGOV_PAGE_SIZE,
  TGOV_PAGE_SIZE_OPTIONS,
  TGOV_TIPO_LABELS,
  type TGovMainFilters,
  type TGovTab,
  type TGovTabResponse,
  type TGovTableFilters,
  type TGovExecucaoTableRow,
  type TGovAprovacaoTableRow,
  type TGovStatusBucket,
  APROVACAO_NR_PROPOSTAS,
  EXECUCAO_NR_PROPOSTAS,
  APROVACAO_ONLY_ROLES,
  EXECUCAO_ONLY_ROLES,
} from '@/lib/tgov'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(raw: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCnpj(cnpj: string): string {
  if (!cnpj || cnpj.length !== 14) return cnpj
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)}%`
}

/** TransfereGov link for execução — uses idProposta (same URL as aprovação). */
function buildTGovExecucaoLink(idProposta: string | null | undefined): string {
  return `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDePropostaDetalharProposta.do?idProposta=${idProposta ?? ''}`
}

/** TransfereGov link for aprovação (proposta) */
function buildTGovAprovacaoLink(idProposta: string): string {
  return `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDePropostaDetalharProposta.do?idProposta=${idProposta}`
}

function buildYearOptions(): string[] {
  const current = new Date().getFullYear()
  const years: string[] = []
  for (let y = current; y >= 2020; y--) {
    years.push(String(y))
  }
  return years
}

const YEAR_OPTIONS = buildYearOptions()

// ---------------------------------------------------------------------------
// Internal CRM status constants
// ---------------------------------------------------------------------------

const TGOV_INTERACTION_STATUSES = [
  'Sem Contato', 'Em Contato', 'Proposta Enviada', 'Em Negociação', 'Fechado', 'Sem Interesse',
] as const
type TGovInteractionStatus = typeof TGOV_INTERACTION_STATUSES[number]

function InternalStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === 'Sem Contato') return <span className="text-xs text-gray-400">—</span>
  const colors: Record<string, string> = {
    'Em Contato': 'bg-blue-50 text-blue-700',
    'Proposta Enviada': 'bg-purple-50 text-purple-700',
    'Em Negociação': 'bg-amber-50 text-amber-700',
    'Fechado': 'bg-green-50 text-green-700',
    'Sem Interesse': 'bg-red-50 text-red-600',
  }
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

// ---------------------------------------------------------------------------
// TGovInteractionPanel — CRM status + obs editor inside sidecards
// ---------------------------------------------------------------------------

function TGovInteractionPanel({
  itemKey,
  tab,
  onStatusChange,
  currentUserRole,
}: {
  itemKey: string
  tab: 'aprovacao' | 'execucao'
  onStatusChange: (s: string) => void
  currentUserRole?: string
}) {
  const [status, setStatus] = useState<TGovInteractionStatus | ''>('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const isProjetista = currentUserRole === 'projetista'
  const isAssistenteAprovacao = currentUserRole === 'assistente_aprovacao'

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/tgov/interaction/${encodeURIComponent(itemKey)}?tab=${tab}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setStatus((data.status as TGovInteractionStatus) ?? '')
          setObs(data.obs ?? '')
        }
      } catch {
        if (!cancelled) setLoadError('Erro ao carregar')
      }
    }
    load()
    return () => { cancelled = true }
  }, [itemKey, tab])

  // projetista só pode comentar, não alterar status
  if (isProjetista) return null

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/tgov/interaction/${encodeURIComponent(itemKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status || null, obs, tab }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setSaved(true)
      onStatusChange(data.status ?? '')
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CRM Interno</p>

      {loadError && <p className="text-xs text-red-500">{loadError}</p>}

      {/* Status selector */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {TGOV_INTERACTION_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                status === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Obs textarea */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Observações</p>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={3}
          placeholder="Notas internas..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Salvo!</span>}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extended response type for execucao (includes byExecRange)
// ---------------------------------------------------------------------------
interface ExecucaoResponse extends TGovTabResponse {
  byExecRange?: TGovStatusBucket[]
  byYear?: { ano: string; valorGlobal: number; count: number }[]
  byDesembolsoYear?: { ano: string; comDesembolso: number; semDesembolso: number }[]
  byAvgUf?: { uf: string; avgValor: number; count: number }[]
  prazos?: {
    vigencia_30: number; vigencia_60: number; vigencia_90: number; vigencia_vencido: number
    pc_30: number; pc_60: number; pc_90: number; pc_vencido: number
  } | null
  avgValor?: number | null
  sumGlobal?: number | null
  sumDesembolsado?: number | null
  comDesembolsoTotal?: number | null
  semDesembolsoTotal?: number | null
}

interface AprovacaoResponse extends TGovTabResponse {
  byUf?: { uf: string; valorGlobal: number; count: number }[]
  byValorStatus?: { situacao: string; valorGlobal: number }[]
  byAvgUf?: { uf: string; avgValor: number; count: number }[]
  avgValor?: number | null
}

interface CnpjSearchResult {
  cnpj: string
  proponente: string | null
  isProjetusClient: boolean
  propostas: {
    numeroProposta: string; titulo: string | null; proponente: string; situacao: string
    valorGlobal: number | null; valorRepasse: number | null; uf: string | null; municipio: string | null; data: string | null
  }[]
  execucao: {
    nrConvenio: string; idProposta: string | null; numeroProposta: string; proponente: string; situacao: string
    valorGlobal: number | null; valorRepasse: number | null; valorDesembolsado: number | null
    saldoConta: number | null; pctExecucao: number | null; uf: string | null; municipio: string | null
    data: string | null; dataFimVigencia: string | null
  }[]
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TGovDashboardClientProps {
  userRole: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'projetista' | 'assistente_aprovacao' | 'coord_execucao' | 'assistente_execucao' | 'projetista_execucao'
  view?: 'pipeline' | 'dashboard'
  highlight?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TGovDashboardClient({ userRole, view = 'pipeline', highlight }: TGovDashboardClientProps) {
  // Swap: default /tgov (menu "TGov Pipeline") shows BI content;
  // /tgov?view=dashboard (menu "TGov Dashboard") shows the pipeline table.
  const isDashboardView = view !== 'dashboard'
  // Execution roles should start on execucao tab
  const initialTab: TGovTab = (EXECUCAO_ONLY_ROLES as readonly string[]).includes(userRole)
    ? 'execucao'
    : DEFAULT_TGOV_TAB
  const [activeTab, setActiveTab] = useState<TGovTab>(initialTab)
  const [mainFilters, setMainFilters] = useState<TGovMainFilters>(DEFAULT_MAIN_FILTERS)
  const [tableFilters, setTableFilters] = useState<TGovTableFilters>(DEFAULT_TABLE_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(TGOV_PAGE_SIZE)
  const [data, setData] = useState<ExecucaoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sidecard state
  const [selectedExecRow, setSelectedExecRow] = useState<TGovExecucaoTableRow | null>(null)
  const [selectedAprovRow, setSelectedAprovRow] = useState<TGovAprovacaoTableRow | null>(null)

  // Técnicos pool (fetched once on mount)
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  useEffect(() => {
    let active = true
    fetch('/api/tgov/usuarios/tecnicos')
      .then((r) => (r.ok ? r.json() : { tecnicos: [] }))
      .then((json) => {
        if (active && Array.isArray(json?.tecnicos)) setTecnicos(json.tecnicos)
      })
      .catch(() => {
        /* silent — selector falls back to empty pool */
      })
    return () => {
      active = false
    }
  }, [])

  // CNPJ search state
  const [cnpjModalOpen, setCnpjModalOpen] = useState(false)
  const [cnpjInput, setCnpjInput] = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjResult, setCnpjResult] = useState<CnpjSearchResult | null>(null)
  const [cnpjError, setCnpjError] = useState<string | null>(null)
  // Track which nr_propostas are already in whitelist (for duplicate indication)
  const [whitelistNrPropostas, setWhitelistNrPropostas] = useState<Set<string>>(new Set())
  // Track proposals added in this modal session (optimistic UI)

  // Highlight: open sidecard when navigating from notification
  useEffect(() => {
    if (!highlight || !data) return
    // Try finding in current tab data
    const arr = (data as any).aprovacao ?? (data as any).execucao ?? []
    const row = arr.find((r: any) => r.nrProposta === highlight)
    if (!row) return
    if ('situacao' in row) {
      setSelectedAprovRow(row as TGovAprovacaoTableRow)
    } else {
      setSelectedExecRow(row as TGovExecucaoTableRow)
    }
  }, [highlight, data])
  const [addedInSession, setAddedInSession] = useState<Set<string>>(new Set())

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(
    async (tab: TGovTab, mf: TGovMainFilters, tf: TGovTableFilters, pg: number, ps: number) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (mf.ano) params.set('ano', mf.ano)
        if (mf.tipo !== 'todos') params.set('tipo', mf.tipo)
        if (mf.status) params.set('status', mf.status)
        if (mf.uf) params.set('uf', mf.uf)
        if (tf.proponente) params.set('proponente', tf.proponente)
        if (tf.numeroProposta) params.set('numero_proposta', tf.numeroProposta)
        params.set('page', String(pg))
        params.set('page_size', String(ps))

        // Map tab to API path and mode param
        const apiPath = tab === 'prestacao_contas' ? 'execucao' : tab
        const modeParam = tab === 'prestacao_contas' ? '&mode=prestacao_contas'
                        : tab === 'execucao' ? '&mode=execucao'
                        : ''
        const res = await fetch(`/api/tgov/${apiPath}?${params.toString()}${modeParam}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        const json: ExecucaoResponse = await res.json()
        // On page > 1 the API skips expensive stats aggregations (charts don't
        // change with pagination). Preserve existing chart data in that case.
        if (pg > 1) {
          setData((prev) => ({
            ...json,
            byStatus: json.byStatus?.length ? json.byStatus : (prev?.byStatus ?? []),
            byExecRange: json.byExecRange?.length ? json.byExecRange : (prev as ExecucaoResponse)?.byExecRange,
            byYear: json.byYear?.length ? json.byYear : (prev as ExecucaoResponse)?.byYear,
            byDesembolsoYear: json.byDesembolsoYear?.length ? json.byDesembolsoYear : (prev as ExecucaoResponse)?.byDesembolsoYear,
          }))
        } else {
          setData(json)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchData(activeTab, mainFilters, tableFilters, page, pageSize)
  }, [activeTab, mainFilters, tableFilters, page, pageSize, fetchData])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTabSwitch(tab: TGovTab) {
    setActiveTab(tab)
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setMainFilters(tab === 'execucao' || tab === 'prestacao_contas'
      ? DEFAULT_EXECUCAO_MAIN_FILTERS
      : DEFAULT_MAIN_FILTERS)
    setPage(1)
    setSelectedExecRow(null)
    setSelectedAprovRow(null)
  }

  function handleMainFilterChange(key: keyof TGovMainFilters, value: string) {
    setMainFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleTableFilterChange(key: keyof TGovTableFilters, value: string) {
    setTableFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleResetFilters() {
    setMainFilters(activeTab === 'execucao' || activeTab === 'prestacao_contas' ? DEFAULT_EXECUCAO_MAIN_FILTERS : DEFAULT_MAIN_FILTERS)
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setPage(1)
  }

  async function handleCnpjSearch() {
    const input = cnpjInput.trim()
    if (!input) return

    // Detect: CNPJ (14 digits after stripping formatting) vs NR Proposta (contains "/")
    const digitsOnly = input.replace(/\D/g, '')
    const isNrProposta = input.includes('/') && digitsOnly.length !== 14
    const param = isNrProposta
      ? `nr_proposta=${encodeURIComponent(input)}`
      : `cnpj=${digitsOnly}`

    if (!isNrProposta && digitsOnly.length < 11) {
      setCnpjError('CNPJ deve ter pelo menos 11 dígitos')
      return
    }

    setCnpjLoading(true)
    setCnpjError(null)
    setCnpjResult(null)
    try {
      const res = await fetch(`/api/tgov/busca-cnpj?${param}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const json: CnpjSearchResult = await res.json()
      if (json.propostas.length === 0 && json.execucao.length === 0) {
        setCnpjError(`Nenhuma proposta ou convênio encontrado para "${input}" no SICONV.`)
      } else {
        setCnpjResult(json)
      }
    } catch (err) {
      setCnpjError(err instanceof Error ? err.message : 'Erro ao buscar')
    } finally {
      setCnpjLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabLabel = activeTab === 'aprovacao' ? 'Aprovação' : activeTab === 'execucao' ? 'Execução' : 'Prestação de Contas'
  const totalPages = data?.table.totalPages ?? 1
  const totalRows = data?.table.totalRows ?? 0

  // Both tabs use byStatus (situação) for the donut chart
  const donutData = data?.byStatus ?? []
  const donutLabel = 'Distribuição por Situação'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isDashboardView ? 'TGov Pipeline' : 'TGov Dashboard'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isDashboardView
                ? 'Resumo analítico de propostas e execuções'
                : 'Painel gerencial de propostas e projetos em execução'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setCnpjModalOpen(true); setCnpjResult(null); setCnpjError(null); setCnpjInput(''); setAddedInSession(new Set())
                try {
                  const res = await fetch('/api/tgov/whitelist')
                  if (res.ok) {
                    const json = await res.json()
                    const nrs = new Set<string>([
                      // Dynamic whitelist entries
                      ...(json.entries ?? [])
                        .map((e: { nr_proposta: string | null }) => e.nr_proposta)
                        .filter(Boolean) as string[],
                      // Hardcoded scope (strip leading zeros for consistent matching)
                      ...Array.from(APROVACAO_NR_PROPOSTAS).map(nr => nr.replace(/^0+/, '')),
                      ...Array.from(EXECUCAO_NR_PROPOSTAS).map(nr => nr.replace(/^0+/, '')),
                    ])
                    setWhitelistNrPropostas(nrs)
                  }
                } catch { /* ignore */ }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Adicionar CNPJ / Proposta
            </button>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              {(['aprovacao', 'execucao', 'prestacao_contas'] as TGovTab[])
                .filter(tab => {
                  const isAprovacaoRole = (APROVACAO_ONLY_ROLES as readonly string[]).includes(userRole)
                  const isExecucaoRole = (EXECUCAO_ONLY_ROLES as readonly string[]).includes(userRole)
                  if (isAprovacaoRole && tab !== 'aprovacao') return false
                  if (isExecucaoRole && tab === 'aprovacao') return false
                  return true
                })
                .map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleTabSwitch(tab)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'aprovacao' ? 'Aprovação' : tab === 'execucao' ? 'Execução' : 'Prestação de Contas'}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
            <select
              value={mainFilters.ano}
              onChange={(e) => handleMainFilterChange('ano', e.target.value)}
              className="block h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select
              value={mainFilters.tipo}
              onChange={(e) => handleMainFilterChange('tipo', e.target.value as TGovMainFilters['tipo'])}
              className="block h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(TGOV_TIPO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <input
              type="text"
              value={mainFilters.status}
              onChange={(e) => handleMainFilterChange('status', e.target.value)}
              placeholder="Ex: Em Execução"
              className="block h-8 w-44 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">UF</label>
            <input
              type="text"
              value={mainFilters.uf}
              onChange={(e) => handleMainFilterChange('uf', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="Ex: SP"
              maxLength={2}
              className="block h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="px-8 py-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPI + Donut row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total — {tabLabel}
              </p>
              <p className="mt-2 text-4xl font-bold text-gray-900 tabular-nums">
                {loading ? (
                  <span className="inline-block w-20 h-9 bg-gray-100 animate-pulse rounded" />
                ) : (
                  (data?.total ?? 0).toLocaleString('pt-BR')
                )}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {activeTab === 'aprovacao' ? 'propostas' : 'projetos/convênios'} com os filtros aplicados
              </p>
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
              {donutLabel}
            </p>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : data ? (
              <TGovStatusDonut data={donutData} total={data.total} onStatusClick={(s) => handleMainFilterChange('status', mainFilters.status === s ? '' : s)} />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                Nenhum dado disponível
              </div>
            )}
          </div>
        </div>

        {/* Table section — pipeline only */}
        <div className={`bg-white rounded-xl border border-gray-200${isDashboardView ? ' hidden' : ''}`}>
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Detalhamento — {tabLabel}</p>
                {!loading && data && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalRows.toLocaleString('pt-BR')} registro{totalRows !== 1 ? 's' : ''}
                    {tableFilters.proponente || tableFilters.numeroProposta ? ' (filtrado)' : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={tableFilters.proponente}
                  onChange={(e) => handleTableFilterChange('proponente', e.target.value)}
                  placeholder="Proponente"
                  className="h-8 w-44 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={tableFilters.numeroProposta}
                  onChange={(e) => handleTableFilterChange('numeroProposta', e.target.value)}
                  placeholder={activeTab === 'aprovacao' ? 'Numero Proposta' : 'Nr Convênio / Proposta'}
                  className="h-8 w-52 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Situação + UF filter chips */}
            {data && (data.byStatus.length > 0 || (data.table.rows as (TGovAprovacaoTableRow | TGovExecucaoTableRow)[]).some(r => r.uf)) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.byStatus.map((bucket) => {
                  const active = mainFilters.status === bucket.status
                  return (
                    <button
                      key={bucket.status}
                      onClick={() => handleMainFilterChange('status', active ? '' : bucket.status)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {bucket.status}
                      <span className={`rounded-full px-1 py-0.5 text-[10px] font-semibold ${active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {bucket.count.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
                {Array.from(new Set(
                  (data.table.rows as (TGovAprovacaoTableRow | TGovExecucaoTableRow)[])
                    .map(r => r.uf)
                    .filter((uf): uf is string => !!uf)
                )).sort().map((uf) => {
                  const active = mainFilters.uf === uf
                  return (
                    <button
                      key={uf}
                      onClick={() => handleMainFilterChange('uf', active ? '' : uf)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {uf}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'prestacao_contas' ? (
              <ExecucaoTable
                rows={data?.table.rows as TGovExecucaoTableRow[] | undefined}
                loading={loading}
                onRowClick={setSelectedExecRow}
              />
            ) : activeTab === 'execucao' ? (
              <ExecucaoTable
                rows={data?.table.rows as TGovExecucaoTableRow[] | undefined}
                loading={loading}
                onRowClick={setSelectedExecRow}
              />
            ) : (
              <AprovacaoTable
                rows={data?.table.rows as TGovAprovacaoTableRow[] | undefined}
                loading={loading}
                onRowClick={setSelectedAprovRow}
              />
            )}
          </div>

          {!loading && (totalPages > 1 || pageSize !== TGOV_PAGE_SIZE) && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">Página {page} de {totalPages}</p>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 bg-white"
                >
                  {TGOV_PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s} linhas</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <PaginationButton label="«" onClick={() => setPage(1)} disabled={page === 1} />
                <PaginationButton label="‹" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} />
                {buildPageWindow(page, totalPages).map((p) =>
                  p === '...' ? (
                    <span key={`e-${Math.random()}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(Number(p))}
                      className={`w-7 h-6 text-xs rounded border transition-colors ${
                        Number(p) === page
                          ? 'border-blue-500 bg-blue-500 text-white font-semibold'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <PaginationButton label="›" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
                <PaginationButton label="»" onClick={() => setPage(totalPages)} disabled={page === totalPages} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BI Summary — only on dashboard view */}
      {isDashboardView && (activeTab === 'execucao' || activeTab === 'prestacao_contas') && !loading && data && data.total > 0 && (
        <ExecucaoBISummary
          rows={data.table.rows as TGovExecucaoTableRow[]}
          total={data.total}
          byStatus={data.byStatus}
          byYear={(data as ExecucaoResponse).byYear ?? []}
          byDesembolsoYear={(data as ExecucaoResponse).byDesembolsoYear ?? []}
          byAvgUf={(data as ExecucaoResponse).byAvgUf ?? []}
          prazos={(data as ExecucaoResponse).prazos ?? null}
          avgValor={(data as ExecucaoResponse).avgValor ?? null}
          sumGlobal={(data as ExecucaoResponse).sumGlobal ?? null}
          sumDesembolsado={(data as ExecucaoResponse).sumDesembolsado ?? null}
          comDesembolsoTotal={(data as ExecucaoResponse).comDesembolsoTotal ?? null}
          semDesembolsoTotal={(data as ExecucaoResponse).semDesembolsoTotal ?? null}
          onStatusClick={(s) => handleMainFilterChange('status', mainFilters.status === s ? '' : s)}
        />
      )}
      {isDashboardView && activeTab === 'aprovacao' && !loading && data && data.total > 0 && (
        <AprovacaoBISummary
          total={data.total}
          byStatus={data.byStatus}
          byUf={(data as AprovacaoResponse).byUf ?? []}
          byValorStatus={(data as AprovacaoResponse).byValorStatus ?? []}
          byAvgUf={(data as AprovacaoResponse).byAvgUf ?? []}
          avgValor={(data as AprovacaoResponse).avgValor ?? null}
          onStatusClick={(s) => handleMainFilterChange('status', mainFilters.status === s ? '' : s)}
        />
      )}

      {/* Sidecard slide-over */}
      {selectedExecRow && (
        <ExecucaoSidecard
          row={selectedExecRow}
          onClose={() => setSelectedExecRow(null)}
          tecnicos={tecnicos}
          currentUserRole={userRole}
          onRowUpdate={(patch) => setSelectedExecRow((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      )}
      {selectedAprovRow && (
        <AprovacaoSidecard
          row={selectedAprovRow}
          onClose={() => setSelectedAprovRow(null)}
          tecnicos={tecnicos}
          currentUserRole={userRole}
          onRowUpdate={(patch) => setSelectedAprovRow((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      )}

      {/* CNPJ Search Modal */}
      {cnpjModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setCnpjModalOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Buscar no SICONV</h3>
                <button onClick={() => setCnpjModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search inputs */}
              <div className="px-6 py-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cnpjInput}
                    onChange={(e) => setCnpjInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCnpjSearch()}
                    placeholder="CNPJ (ex: 12.345.678/0001-90) ou NR Proposta (ex: 4822/2020)"
                    className="flex-1 h-10 rounded-lg border border-gray-200 px-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleCnpjSearch}
                    disabled={cnpjLoading}
                    className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {cnpjLoading ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                <p className="text-xs text-gray-400">Busque por CNPJ para ver todas as propostas/convênios ou por NR Proposta (ex: 4822/2020) para encontrar um instrumento específico.</p>
              </div>

              {/* Results */}
              <div className="px-6 pb-6 overflow-y-auto flex-1">
                {cnpjError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cnpjError}</div>
                )}

                {cnpjResult && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{cnpjResult.proponente || 'Proponente'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{formatCnpj(cnpjResult.cnpj)}</p>
                    </div>

                    {/* Propostas — com botão individual por linha */}
                    {cnpjResult.propostas.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Propostas ({cnpjResult.propostas.length})
                        </p>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-3 py-2 font-medium text-gray-500">Nr Proposta</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500">Situação</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-500">Valor Global</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500">UF</th>
                                <th className="text-center px-3 py-2 font-medium text-gray-500 w-32"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {cnpjResult.propostas.map((p, i) => {
                                const nr = p.numeroProposta
                                const nrStripped = nr.replace(/^0+/, '')
                                const isInWhitelist = whitelistNrPropostas.has(nr) || whitelistNrPropostas.has(nrStripped)
                                const wasAdded = addedInSession.has(nr)
                                const alreadyAdded = isInWhitelist || wasAdded
                                return (
                                  <tr key={i} className="hover:bg-blue-50/30">
                                    <td className="px-3 py-2 font-mono">{nr}</td>
                                    <td className="px-3 py-2"><SituacaoBadge situacao={p.situacao} /></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.valorGlobal)}</td>
                                    <td className="px-3 py-2 text-gray-500">{p.uf || '—'}</td>
                                    <td className="px-3 py-2 text-center">
                                      {alreadyAdded ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 whitespace-nowrap">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                          Já acompanhada
                                        </span>
                                      ) : (
                                        <button
                                          onClick={async (ev) => {
                                            ev.stopPropagation()
                                            const res = await fetch('/api/tgov/whitelist', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ nr_proposta: nr, tab: 'aprovacao' }),
                                            })
                                            if (res.ok) {
                                              setAddedInSession(prev => new Set(prev).add(nr))
                                              fetchData(activeTab, mainFilters, tableFilters, page, pageSize)
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                          Adicionar
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Execução — com botão individual por linha */}
                    {cnpjResult.execucao.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Em Execução ({cnpjResult.execucao.length})
                        </p>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-3 py-2 font-medium text-gray-500">Nr Convênio</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500">Situação</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-500">Valor Global</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-500">Desembolsado</th>
                                <th className="text-left px-3 py-2 font-medium text-gray-500">Fim Vigência</th>
                                <th className="text-center px-3 py-2 font-medium text-gray-500 w-32"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {cnpjResult.execucao.map((e, i) => {
                                const nr = e.numeroProposta
                                const nrStripped = nr.replace(/^0+/, '')
                                const isInWhitelist = whitelistNrPropostas.has(nr) || whitelistNrPropostas.has(nrStripped)
                                const wasAdded = addedInSession.has(nr)
                                const alreadyAdded = isInWhitelist || wasAdded
                                return (
                                  <tr key={i} className="hover:bg-blue-50/30">
                                    <td className="px-3 py-2 font-mono">
                                      <a href={buildTGovExecucaoLink(e.idProposta || e.numeroProposta)} target="_blank" rel="noopener noreferrer"
                                         className="text-blue-600 hover:underline">{e.nrConvenio}</a>
                                    </td>
                                    <td className="px-3 py-2"><SituacaoBadge situacao={e.situacao} /></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(e.valorGlobal)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(e.valorDesembolsado)}</td>
                                    <td className="px-3 py-2 text-gray-500">{formatDate(e.dataFimVigencia)}</td>
                                    <td className="px-3 py-2 text-center">
                                      {alreadyAdded ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 whitespace-nowrap">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                          Já acompanhada
                                        </span>
                                      ) : (
                                        <button
                                          onClick={async (ev) => {
                                            ev.stopPropagation()
                                            const res = await fetch('/api/tgov/whitelist', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ nr_proposta: nr, tab: 'execucao' }),
                                            })
                                            if (res.ok) {
                                              setAddedInSession(prev => new Set(prev).add(nr))
                                              fetchData(activeTab, mainFilters, tableFilters, page, pageSize)
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                          Adicionar
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagination button
// ---------------------------------------------------------------------------

function PaginationButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc'

function SortableTh({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
  className,
}: {
  label: string
  col: string
  sortCol: string
  sortDir: SortDir
  onSort: (col: string) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <th
      className={`cursor-pointer select-none text-xs font-medium uppercase tracking-wide py-2.5 ${className ?? ''}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        <span className={active ? 'text-blue-600' : 'text-gray-500'}>{label}</span>
        <span className="text-gray-300 text-[10px]">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )
}

function sortRows<T extends Record<string, unknown>>(rows: T[], col: string, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[col] ?? ''
    const bv = b[col] ?? ''
    const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' })
    return dir === 'asc' ? cmp : -cmp
  })
}

// ---------------------------------------------------------------------------
// Aprovacao Table
// ---------------------------------------------------------------------------

function AprovacaoTable({
  rows,
  loading,
  onRowClick,
}: {
  rows: TGovAprovacaoTableRow[] | undefined
  loading: boolean
  onRowClick: (row: TGovAprovacaoTableRow) => void
}) {
  const [sortCol, setSortCol] = useState('numeroProposta')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = rows ? (sortRows(rows as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as TGovAprovacaoTableRow[]) : rows

  const thProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <SortableTh label="NR Proposta" col="numeroProposta" className="text-left px-5" {...thProps} />
          <SortableTh label="Data" col="data" className="text-left px-4" {...thProps} />
          <SortableTh label="CNPJ" col="cnpj" className="text-left px-4" {...thProps} />
          <SortableTh label="Proponente" col="proponente" className="text-left px-4" {...thProps} />
          <SortableTh label="Situação" col="situacao" className="text-left px-4" {...thProps} />
          <SortableTh label="Status" col="internalStatus" className="text-left px-4 whitespace-nowrap" {...thProps} />
          <th className="px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide text-center w-12">Coments.</th>
          <th className="px-3 py-2.5 w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {loading ? (
          <SkeletonRows cols={8} />
        ) : sorted && sorted.length > 0 ? (
          sorted.map((row, idx) => (
            <tr
              key={`${row.numeroProposta}-${idx}`}
              className="hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => {
                if (row.hasNew && row.numeroProposta) {
                  fetch('/api/tgov/seen', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposta_key: row.numeroProposta }),
                  }).catch(() => {})
                }
                onRowClick(row)
              }}
            >
              <td className="px-5 py-2.5 text-gray-700 font-mono text-xs">
                {row.numeroProposta || '—'}
                {row.hasNew && (
                  <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded">
                    NOVO
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(row.data)}</td>
              <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{formatCnpj(row.cnpj) || '—'}</td>
              <td className="px-4 py-2.5 text-gray-700">
                {row.proponente || '—'}
              </td>
              <td className="px-4 py-2.5"><SituacaoBadge situacao={row.situacao} /></td>
              <td className="px-4 py-2.5"><InternalStatusBadge status={row.internalStatus} /></td>
              <td className="px-3 py-2.5 text-center" onClick={(e) => { e.stopPropagation(); onRowClick(row) }}>
                {(row.commentCount ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="font-medium">{row.commentCount}</span>
                  </span>
                ) : (
                  <span className="text-gray-200">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow cols={8} />
        )}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Execucao Table (expanded + clickable rows + TGov link)
// ---------------------------------------------------------------------------

function ExecucaoTable({
  rows,
  loading,
  onRowClick,
}: {
  rows: TGovExecucaoTableRow[] | undefined
  loading: boolean
  onRowClick: (row: TGovExecucaoTableRow) => void
}) {
  const [sortCol, setSortCol] = useState('nrConvenio')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = rows ? (sortRows(rows as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as TGovExecucaoTableRow[]) : rows

  const thProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <SortableTh label="Nr Convênio" col="nrConvenio" className="text-left px-4 whitespace-nowrap" {...thProps} />
          <SortableTh label="Ano" col="anoInstrumento" className="text-left px-3" {...thProps} />
          <SortableTh label="Fim Vigência" col="dataFimVigencia" className="text-left px-3 whitespace-nowrap" {...thProps} />
          <SortableTh label="Limite PC" col="diaLimitePrestContas" className="text-left px-3 whitespace-nowrap" {...thProps} />
          <SortableTh label="CNPJ" col="cnpj" className="text-left px-3" {...thProps} />
          <SortableTh label="Proponente" col="proponente" className="text-left px-3" {...thProps} />
          <SortableTh label="UF" col="uf" className="text-left px-3" {...thProps} />
          <SortableTh label="Situação" col="situacao" className="text-left px-3" {...thProps} />
          <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Desembolso</th>
          <th className="px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {loading ? (
          <SkeletonRows cols={10} />
        ) : sorted && sorted.length > 0 ? (
          sorted.map((row, idx) => {
            const hasDesembolso = row.valorDesembolsado !== null && row.valorDesembolsado > 0
            return (
              <tr
                key={`${row.nrConvenio}-${idx}`}
                className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                onClick={() => {
                  if (row.hasNew && row.numeroProposta) {
                    fetch('/api/tgov/seen', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ proposta_key: row.numeroProposta }),
                    }).catch(() => {})
                  }
                  onRowClick(row)
                }}
              >
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                  <a
                    href={buildTGovExecucaoLink(row.idProposta)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                    title="Abrir no TransfereGov"
                  >
                    {row.nrConvenio || '—'}
                  </a>
                  {row.hasNew && (
                    <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded">
                      NOVO
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs tabular-nums">{row.anoInstrumento || '—'}</td>
                <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap text-gray-600">
                  {formatDate(row.dataFimVigencia)}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap text-gray-600">
                  {formatDate(row.diaLimitePrestContas)}
                </td>
                <td className="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{formatCnpj(row.cnpj) || '—'}</td>
                <td className="px-3 py-2.5 text-gray-700 text-xs">
                  {row.proponente || '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{row.uf || '—'}</td>
                <td className="px-3 py-2.5"><SituacaoBadge situacao={row.situacao} /></td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    hasDesembolso
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasDesembolso ? 'bg-green-500' : 'bg-red-400'}`} />
                    {hasDesembolso ? 'Sim' : 'Não'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </td>
              </tr>
            )
          })
        ) : (
          <EmptyRow cols={10} />
        )}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Sidecard (slide-over) — full project details
// ---------------------------------------------------------------------------

function ExecucaoSidecard({
  row,
  onClose,
  tecnicos,
  currentUserRole,
  onRowUpdate,
}: {
  row: TGovExecucaoTableRow
  onClose: () => void
  tecnicos: Tecnico[]
  currentUserRole: string
  onRowUpdate: (patch: Partial<TGovExecucaoTableRow>) => void
}) {
  const execKey = row.nrConvenio || row.numeroProposta || ''
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Convênio</p>
            <h2 className="text-lg font-bold text-gray-900 font-mono">{row.nrConvenio}</h2>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={buildTGovExecucaoLink(row.idProposta)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              TransfereGov
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Status + Execution */}
          <div className="flex items-center gap-3">
            <SituacaoBadge situacao={row.situacao} />
            {row.pctExecucao !== null && (
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      row.pctExecucao >= 80 ? 'bg-green-500' :
                      row.pctExecucao >= 50 ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, row.pctExecucao)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-700 tabular-nums whitespace-nowrap">
                  {formatPercent(row.pctExecucao)}
                </span>
              </div>
            )}
          </div>

          {/* Proponente info */}
          <SidecardSection title="Proponente">
            <SidecardField label="Nome" value={row.proponente} />
            <SidecardField label="CNPJ" value={formatCnpj(row.cnpj)} mono />
            <SidecardField label="UF" value={row.uf} />
            <SidecardField label="Município" value={row.municipio} />
          </SidecardSection>

          {/* Responsável Técnico */}
          <SidecardSection title="Responsável Técnico">
            <TecnicoSelector
              targetType="execucao"
              targetKey={execKey}
              currentTecnicoId={row.tecnicoId ?? null}
              currentTecnicoNome={row.tecnicoNome ?? null}
              tecnicos={tecnicos}
              currentUserRole={currentUserRole}
              onAssigned={(id, nome) => onRowUpdate({ tecnicoId: id, tecnicoNome: nome })}
            />
          </SidecardSection>

          {/* Instrumento */}
          <SidecardSection title="Instrumento">
            <SidecardField label="Nr Convênio" value={row.nrConvenio} mono />
            <SidecardField label="Nr Proposta" value={row.numeroProposta} mono />
            <SidecardField label="Ano" value={row.anoInstrumento ? String(row.anoInstrumento) : null} />
            <SidecardField label="Data Assinatura" value={formatDate(row.data)} />
            <SidecardField label="Início Vigência" value={formatDate(row.dataInicioVigencia)} />
            <SidecardField label="Fim Vigência" value={formatDate(row.dataFimVigencia)} />
            <SidecardField label="Limite Prest. Contas" value={formatDate(row.diaLimitePrestContas)} />
            {row.diasPrestContas !== null && row.diasPrestContas > 0 && (
              <SidecardField label="Dias para Prest. Contas" value={`${row.diasPrestContas} dias`} />
            )}
            {row.diasEmExecucao !== null && (
              <SidecardField label="Dias em Execução" value={`${row.diasEmExecucao} dias`} />
            )}
            {row.diasAteVencimento !== null && (
              <SidecardField
                label="Dias até Vencimento"
                value={`${row.diasAteVencimento} dias`}
                highlight={row.diasAteVencimento < 90 ? 'danger' : row.diasAteVencimento < 180 ? 'warning' : undefined}
              />
            )}
          </SidecardSection>

          {/* Desembolso highlight */}
          <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${
            row.valorDesembolsado !== null && row.valorDesembolsado > 0
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              row.valorDesembolsado !== null && row.valorDesembolsado > 0 ? 'bg-green-500' : 'bg-red-400'
            }`} />
            <div>
              <p className={`text-sm font-semibold ${
                row.valorDesembolsado !== null && row.valorDesembolsado > 0 ? 'text-green-800' : 'text-red-700'
              }`}>
                {row.valorDesembolsado !== null && row.valorDesembolsado > 0 ? 'Com Desembolso' : 'Sem Desembolso'}
              </p>
              {row.valorDesembolsado !== null && row.valorDesembolsado > 0 && (
                <p className="text-xs text-green-600 font-mono">{formatCurrency(row.valorDesembolsado)}</p>
              )}
            </div>
          </div>

          {/* Valores financeiros */}
          <SidecardSection title="Valores Financeiros">
            <SidecardCurrency label="Valor Global" value={row.valorGlobal} bold />
            <SidecardCurrency label="Valor Repasse" value={row.valorRepasse} />
            <SidecardCurrency label="Valor Empenhado" value={row.valorEmpenhado} />
            <SidecardCurrency label="Valor Desembolsado" value={row.valorDesembolsado} />
            <div className="border-t border-gray-100 pt-2 mt-2" />
            <SidecardCurrency label="Saldo em Conta" value={row.saldoConta} />
            <SidecardCurrency label="Saldo Rendimento" value={row.rendimentoAplicacao} />
            <SidecardCurrency label="Ingresso Contrapartida" value={row.ingressoContrapartida} />
          </SidecardSection>

          <TGovInteractionPanel itemKey={row.nrConvenio} tab="execucao" onStatusChange={() => {}} currentUserRole={currentUserRole} />

          {/* Comentários */}
          <SidecardSection title="Comentários">
            <CommentsThread
              targetType="execucao"
              targetKey={execKey}
              currentUserRole={currentUserRole}
            />
          </SidecardSection>
        </div>
      </div>

      {/* CSS animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </>
  )
}

// ---------------------------------------------------------------------------
// Aprovacao Sidecard
// ---------------------------------------------------------------------------

function AprovacaoSidecard({
  row,
  onClose,
  tecnicos,
  currentUserRole,
  onRowUpdate,
}: {
  row: TGovAprovacaoTableRow
  onClose: () => void
  tecnicos: Tecnico[]
  currentUserRole: string
  onRowUpdate: (patch: Partial<TGovAprovacaoTableRow>) => void
}) {
  const tgovPropostaLink = buildTGovAprovacaoLink(row.transferGovId)
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Proposta</p>
            <h2 className="text-lg font-bold text-gray-900 font-mono">{row.numeroProposta}</h2>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={tgovPropostaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              TransfereGov
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Status */}
          <SituacaoBadge situacao={row.situacao} />

          {/* Titulo */}
          {row.titulo && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objeto</p>
              <p className="text-sm text-gray-800 leading-relaxed">{row.titulo}</p>
            </div>
          )}

          {/* Proponente */}
          <SidecardSection title="Proponente">
            <SidecardField label="Nome" value={row.proponente} />
            <SidecardField label="CNPJ" value={formatCnpj(row.cnpj)} mono />
            <SidecardField label="UF" value={row.uf} />
            <SidecardField label="Município" value={row.municipio} />
          </SidecardSection>

          {/* Responsável Técnico */}
          <SidecardSection title="Responsável Técnico">
            <TecnicoSelector
              targetType="proposta"
              targetKey={row.numeroProposta}
              currentTecnicoId={row.tecnicoId ?? null}
              currentTecnicoNome={row.tecnicoNome ?? null}
              tecnicos={tecnicos}
              currentUserRole={currentUserRole}
              onAssigned={(id, nome) => onRowUpdate({ tecnicoId: id, tecnicoNome: nome })}
            />
          </SidecardSection>

          {/* Instrumento */}
          <SidecardSection title="Instrumento">
            <SidecardField label="NR Proposta" value={row.numeroProposta} mono />
            <SidecardField label="Modalidade" value={row.modalidade} />
            <SidecardField label="Data Publicação" value={formatDate(row.data)} />
            <SidecardField label="Início Vigência" value={formatDate(row.dataInicioVigencia)} />
            <SidecardField label="Fim Vigência" value={formatDate(row.dataFimVigencia)} />
          </SidecardSection>

          {/* Órgão */}
          {(row.orgaoSuperior || row.orgaoVinculado) && (
            <SidecardSection title="Órgão Concedente">
              <SidecardField label="Órgão Superior" value={row.orgaoSuperior} />
              <SidecardField label="Órgão Vinculado" value={row.orgaoVinculado} />
            </SidecardSection>
          )}

          {/* Valores financeiros */}
          <SidecardSection title="Valores Financeiros">
            <SidecardCurrency label="Valor Global" value={row.valorGlobal} bold />
            <SidecardCurrency label="Valor Repasse" value={row.valorRepasse} />
            <SidecardCurrency label="Valor Contrapartida" value={row.valorContrapartida} />
          </SidecardSection>

          <TGovInteractionPanel itemKey={row.numeroProposta} tab="aprovacao" onStatusChange={() => {}} currentUserRole={currentUserRole} />

          {/* Comentários */}
          <SidecardSection title="Comentários">
            <CommentsThread
              targetType="proposta"
              targetKey={row.numeroProposta}
              currentUserRole={currentUserRole}
            />
          </SidecardSection>
        </div>
      </div>
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sidecard helpers
// ---------------------------------------------------------------------------

function SidecardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SidecardField({
  label,
  value,
  mono,
  highlight,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  highlight?: 'danger' | 'warning'
}) {
  const colorCls = highlight === 'danger'
    ? 'text-red-600 font-medium'
    : highlight === 'warning'
      ? 'text-amber-600 font-medium'
      : 'text-gray-900'
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-right ${colorCls} ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function SidecardCurrency({
  label,
  value,
  bold,
}: {
  label: string
  value: number | null | undefined
  bold?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm tabular-nums text-right ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {formatCurrency(value ?? null)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BI Summary — Aprovação
// ---------------------------------------------------------------------------

function AprovacaoBISummary({
  total, byStatus, byUf, byValorStatus, byAvgUf, avgValor, onStatusClick,
}: {
  total: number
  byStatus: TGovStatusBucket[]
  byAvgUf: { uf: string; avgValor: number; count: number }[]
  avgValor: number | null
  byUf: { uf: string; valorGlobal: number; count: number }[]
  byValorStatus: { situacao: string; valorGlobal: number }[]
  onStatusClick?: (status: string) => void
}) {
  const valorGlobalTotal = byValorStatus.reduce((s, r) => s + r.valorGlobal, 0)

  function shortCurrency(v: number): string {
    if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)}B`
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
    return formatCurrency(v)
  }

  const sortedStatus = [...byStatus].sort((a, b) => b.count - a.count)
  const TOP_N = 6
  const topStatuses = sortedStatus.slice(0, TOP_N)
  const otherCount = sortedStatus.slice(TOP_N).reduce((s, r) => s + r.count, 0)
  const donutData = otherCount > 0
    ? [...topStatuses, { status: 'Outros', count: otherCount, percent: total > 0 ? Number(((otherCount / total) * 100).toFixed(1)) : 0 }]
    : topStatuses

  const STATUS_COLORS: Record<string, string> = {
    'Prestação de Contas em Complementação': '#ea580c', // laranja forte — máxima atenção
    'Prestação de Contas Rejeitada': '#dc2626',
    'Inadimplente': '#b91c1c',
    'Em Execução': '#16a34a', 'Em execução': '#16a34a',
    'Aprovado': '#2563eb',
    'Proposta/Plano de Trabalho Aprovados': '#2563eb',
    'Aguardando Análise': '#d97706',
    'Aguardando Envio do Plano de Trabalho': '#f59e0b',
    'Aguardando Prestação de Contas': '#d97706',
    'Em Análise': '#7c3aed',
    'Prestação de Contas em Análise': '#db2777',
    'Prestação de Contas enviada para Análise': '#6366f1',
    'Prestação de contas enviada para análise': '#6366f1',
    'Prestação de Contas Aprovada': '#10b981',
    'Prestação de Contas Concluída': '#0d9488',
    'Prestação de Contas Comprovada': '#0891b2',
    'Concluído': '#0d9488',
    'Reprovado': '#dc2626',
    'Cancelado': '#9ca3af',
    'Sem Situação': '#9ca3af',
    'Outros': '#9ca3af',
  }
  const FALLBACK = ['#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#9ca3af']
  const colorFor = (status: string, i: number) => STATUS_COLORS[status] ?? FALLBACK[i % FALLBACK.length]

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Propostas', value: total.toLocaleString('pt-BR'), color: 'text-gray-900' },
          { label: 'Valor Global Total', value: shortCurrency(valorGlobalTotal), color: 'text-blue-700' },
          { label: 'Média por Projeto', value: avgValor !== null ? shortCurrency(avgValor) : '—', color: 'text-violet-700' },
          { label: 'UFs Representadas', value: String(byUf.length), color: 'text-gray-900' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Barras — Valor Global por UF */}
        {byUf.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Valor Global por UF</p>
            <div className="h-52">
              <BIResponsiveContainer>
                <BIBarChart data={byUf} layout="vertical">
                  <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <BIXAxis type="number" tickFormatter={(v: number) => shortCurrency(v)} tick={{ fontSize: 10 }} />
                  <BIYAxis dataKey="uf" type="category" tick={{ fontSize: 11 }} width={35} />
                  <BITooltipChart formatter={(v: number) => [formatCurrency(v), 'Valor Global']} />
                  <BIBar dataKey="valorGlobal" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BIBarChart>
              </BIResponsiveContainer>
            </div>
          </div>
        )}

        {/* 2. Donut — Distribuição por Situação */}
        {donutData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Distribuição por Situação</p>
            <div className="h-52 flex items-center gap-4">
              <div className="w-36 h-36 shrink-0">
                <BIResponsiveContainer>
                  <BIPieChart>
                    <BIPie data={donutData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} stroke="none"
                      onClick={(d: { status: string }) => onStatusClick?.(d.status)}
                      style={{ cursor: onStatusClick ? 'pointer' : undefined }}
                    >
                      {donutData.map((entry, i) => (
                        <BICell key={entry.status} fill={colorFor(entry.status, i)} />
                      ))}
                    </BIPie>
                    <BITooltipChart formatter={(v: number) => [String(v), 'Quantidade']} />
                  </BIPieChart>
                </BIResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1 min-w-0 overflow-y-auto max-h-48">
                {donutData.map((entry, i) => (
                  <div key={entry.status} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 transition-colors" onClick={() => onStatusClick?.(entry.status)}>
                    <span className="shrink-0 w-2 h-2 rounded-sm" style={{ background: colorFor(entry.status, i) }} />
                    <span className="text-xs text-gray-600 truncate flex-1" title={entry.status}>{entry.status}</span>
                    <span className="text-xs font-bold text-gray-800 tabular-nums">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. Barras — Valor Global por Situação */}
        {byValorStatus.length > 0 && (() => {
          const top = byValorStatus.slice(0, 8)
          const truncate = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
          // ~36px per row + margins, min 240px
          const chartHeight = Math.max(240, top.length * 36 + 40)
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Valor por Situação</p>
              <div style={{ height: chartHeight }}>
                <BIResponsiveContainer>
                  <BIBarChart data={top} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <BIXAxis type="number" tickFormatter={(v: number) => shortCurrency(v)} tick={{ fontSize: 10 }} />
                    <BIYAxis
                      dataKey="situacao"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={210}
                      interval={0}
                      tickFormatter={(v: string) => truncate(v)}
                    />
                    <BITooltipChart
                      formatter={(v: number) => [formatCurrency(v), 'Valor Global']}
                      labelFormatter={(label: string) => label}
                    />
                    <BIBar dataKey="valorGlobal" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={20} />
                  </BIBarChart>
                </BIResponsiveContainer>
              </div>
            </div>
          )
        })()}
      </div>

      {/* BI: Média de Valor por UF */}
      {byAvgUf.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Média de Valor por Projeto — por UF (top 10)</p>
          <div className="h-64">
            <BIResponsiveContainer>
              <BIBarChart data={byAvgUf.slice(0, 10)} layout="vertical">
                <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <BIXAxis type="number" tickFormatter={(v: number) => shortCurrency(v)} tick={{ fontSize: 10 }} />
                <BIYAxis dataKey="uf" type="category" tick={{ fontSize: 11 }} width={35} />
                <BITooltipChart formatter={(v: number, _n: unknown, p: { payload?: { count?: number } }) => [`${formatCurrency(v)} (${p?.payload?.count ?? 0} proj.)`, 'Média']} />
                <BIBar dataKey="avgValor" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BIBarChart>
            </BIResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BI Summary — Execução macro data
// ---------------------------------------------------------------------------

function ExecucaoBISummary({
  rows, total, byStatus, byYear, byDesembolsoYear, byAvgUf, prazos, avgValor,
  sumGlobal, sumDesembolsado, comDesembolsoTotal, semDesembolsoTotal, onStatusClick,
}: {
  rows: TGovExecucaoTableRow[]
  total: number
  byStatus: TGovStatusBucket[]
  byYear: { ano: string; valorGlobal: number; count: number }[]
  byDesembolsoYear: { ano: string; comDesembolso: number; semDesembolso: number }[]
  byAvgUf: { uf: string; avgValor: number; count: number }[]
  prazos: {
    vigencia_30: number; vigencia_60: number; vigencia_90: number; vigencia_vencido: number
    pc_30: number; pc_60: number; pc_90: number; pc_vencido: number
  } | null
  avgValor: number | null
  sumGlobal: number | null
  sumDesembolsado: number | null
  comDesembolsoTotal: number | null
  semDesembolsoTotal: number | null
  onStatusClick?: (status: string) => void
}) {
  // Use dataset totals from backend when available; fall back to page-level sums for safety
  const valorGlobalTotal = sumGlobal ?? rows.reduce((sum, r) => sum + (r.valorGlobal ?? 0), 0)
  const valorDesembolsadoTotal = sumDesembolsado ?? rows.reduce((sum, r) => sum + (r.valorDesembolsado ?? 0), 0)
  const comDesembolso = comDesembolsoTotal ?? rows.filter(r => r.valorDesembolsado !== null && r.valorDesembolsado > 0).length
  const semDesembolso = semDesembolsoTotal ?? (rows.length - (comDesembolsoTotal ?? 0))

  // Donut: top statuses + "Outros" bucket
  const sortedStatus = [...byStatus].sort((a, b) => b.count - a.count)
  const TOP_N = 6
  const topStatuses = sortedStatus.slice(0, TOP_N)
  const otherCount = sortedStatus.slice(TOP_N).reduce((s, r) => s + r.count, 0)
  const donutData = otherCount > 0
    ? [...topStatuses, { status: 'Outros', count: otherCount, percent: total > 0 ? Number(((otherCount / total) * 100).toFixed(1)) : 0 }]
    : topStatuses

  const STATUS_COLORS: Record<string, string> = {
    'Em Execução': '#16a34a', 'Em execução': '#16a34a',
    'Proposta/Plano de Trabalho Aprovados': '#2563eb',
    'Concluído': '#0891b2', 'Inadimplente': '#b91c1c',
    'Prestação de Contas em Análise': '#db2777',
    'Prestação de Contas em Complementação': '#ea580c', // laranja forte — máxima atenção
    'Prestação de Contas Rejeitada': '#dc2626',
    'Prestação de Contas Aprovada': '#10b981',
    'Outros': '#9ca3af',
  }
  const FALLBACK = ['#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#ea580c','#9ca3af']

  // Format large currency to "R$ 1,2M"
  function shortCurrency(v: number): string {
    if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)}B`
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
    return formatCurrency(v)
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Projetos', value: total.toLocaleString('pt-BR'), color: 'text-gray-900' },
          { label: 'Valor Global Total', value: shortCurrency(valorGlobalTotal), color: 'text-gray-900' },
          { label: 'Média por Projeto', value: avgValor !== null ? shortCurrency(avgValor) : '—', color: 'text-violet-700' },
          { label: 'Total Desembolsado', value: shortCurrency(valorDesembolsadoTotal), color: 'text-blue-700' },
          { label: 'Com Desembolso', value: `${comDesembolso} / ${comDesembolso + semDesembolso}`, color: 'text-green-700' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Barras — Valor Global por Ano */}
        {byYear.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Valor Global por Ano</p>
            <div className="h-52">
              <BIResponsiveContainer>
                <BIBarChart data={byYear}>
                  <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <BIXAxis dataKey="ano" tick={{ fontSize: 11 }} />
                  <BIYAxis tickFormatter={(v: number) => shortCurrency(v)} tick={{ fontSize: 10 }} width={70} />
                  <BITooltipChart formatter={(v: number) => [formatCurrency(v), 'Valor Global']} labelFormatter={(l: string) => `Ano: ${l}`} />
                  <BIBar dataKey="valorGlobal" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BIBarChart>
              </BIResponsiveContainer>
            </div>
          </div>
        )}

        {/* 2. Donut — Distribuição por Situação */}
        {donutData.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Distribuição por Situação</p>
            <div className="h-52 flex items-center gap-4">
              <div className="w-36 h-36 shrink-0">
                <BIResponsiveContainer>
                  <BIPieChart>
                    <BIPie data={donutData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} stroke="none"
                      onClick={(d: { status: string }) => onStatusClick?.(d.status)}
                      style={{ cursor: onStatusClick ? 'pointer' : undefined }}
                    >
                      {donutData.map((entry, i) => (
                        <BICell key={entry.status} fill={STATUS_COLORS[entry.status] ?? FALLBACK[i % FALLBACK.length]} />
                      ))}
                    </BIPie>
                    <BITooltipChart formatter={(v: number) => [String(v), 'Quantidade']} />
                  </BIPieChart>
                </BIResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1 min-w-0 overflow-y-auto max-h-48">
                {donutData.map((entry, i) => (
                  <div key={entry.status} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 transition-colors" onClick={() => onStatusClick?.(entry.status)}>
                    <span className="shrink-0 w-2 h-2 rounded-sm" style={{ background: STATUS_COLORS[entry.status] ?? FALLBACK[i % FALLBACK.length] }} />
                    <span className="text-xs text-gray-600 truncate flex-1" title={entry.status}>{entry.status}</span>
                    <span className="text-xs font-bold text-gray-800 tabular-nums">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. Barra empilhada — Com/Sem Desembolso por Ano */}
        {byDesembolsoYear.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Desembolso por Ano</p>
            <div className="h-52">
              <BIResponsiveContainer>
                <BIBarChart data={byDesembolsoYear}>
                  <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <BIXAxis dataKey="ano" tick={{ fontSize: 11 }} />
                  <BIYAxis tick={{ fontSize: 10 }} />
                  <BITooltipChart />
                  <BIBar dataKey="comDesembolso" name="Com Desembolso" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                  <BIBar dataKey="semDesembolso" name="Sem Desembolso" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <BILegend wrapperStyle={{ fontSize: '11px' }} />
                </BIBarChart>
              </BIResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Detalhamentos: Prazos críticos */}
      {prazos && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Detalhamentos — Prazos Críticos</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Vigência */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Fim de Vigência</p>
              <PrazoRow label="Vencidos" value={prazos.vigencia_vencido} color="bg-red-100 text-red-700" />
              <PrazoRow label="≤ 30 dias" value={prazos.vigencia_30} color="bg-orange-100 text-orange-700" />
              <PrazoRow label="31–60 dias" value={prazos.vigencia_60} color="bg-amber-100 text-amber-700" />
              <PrazoRow label="61–90 dias" value={prazos.vigencia_90} color="bg-yellow-100 text-yellow-700" />
            </div>
            {/* Prestação de Contas */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Prestação de Contas</p>
              <PrazoRow label="Vencidos" value={prazos.pc_vencido} color="bg-red-100 text-red-700" />
              <PrazoRow label="≤ 30 dias" value={prazos.pc_30} color="bg-orange-100 text-orange-700" />
              <PrazoRow label="31–60 dias" value={prazos.pc_60} color="bg-amber-100 text-amber-700" />
              <PrazoRow label="61–90 dias" value={prazos.pc_90} color="bg-yellow-100 text-yellow-700" />
            </div>
            {/* Situações críticas */}
            <div className="lg:col-span-2 space-y-2">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Situações que Exigem Ação</p>
              {byStatus
                .filter(s => /Inadimplente|Reprovado|Aguardando Prestação|Aguardando Envio|Rejeitada|em Complementação/i.test(s.status))
                .slice(0, 6)
                .map(s => (
                  <div
                    key={s.status}
                    onClick={() => onStatusClick?.(s.status)}
                    className="flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                  >
                    <span className="text-xs text-gray-700 truncate" title={s.status}>{s.status}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-red-100 text-red-700">{s.count}</span>
                  </div>
                ))}
              {byStatus.filter(s => /Inadimplente|Reprovado|Aguardando Prestação|Aguardando Envio|Rejeitada|em Complementação/i.test(s.status)).length === 0 && (
                <p className="text-xs text-gray-400 italic">Nenhuma situação crítica encontrada.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BI: Média de Valor por UF */}
      {byAvgUf.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Média de Valor por Projeto — por UF (top 10)</p>
          <div className="h-64">
            <BIResponsiveContainer>
              <BIBarChart data={byAvgUf.slice(0, 10)} layout="vertical">
                <BICartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <BIXAxis type="number" tickFormatter={(v: number) => shortCurrency(v)} tick={{ fontSize: 10 }} />
                <BIYAxis dataKey="uf" type="category" tick={{ fontSize: 11 }} width={35} />
                <BITooltipChart formatter={(v: number, _n: unknown, p: { payload?: { count?: number } }) => [`${formatCurrency(v)} (${p?.payload?.count ?? 0} proj.)`, 'Média']} />
                <BIBar dataKey="avgValor" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BIBarChart>
            </BIResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function PrazoRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`shrink-0 text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${color}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared table helpers
// ---------------------------------------------------------------------------

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-gray-100 animate-pulse rounded" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-12 text-center text-sm text-gray-400">
        Nenhum registro encontrado para os filtros aplicados.
      </td>
    </tr>
  )
}

function SituacaoBadge({ situacao }: { situacao: string }) {
  const colorMap: Record<string, string> = {
    // 🔴 Ação urgente — vermelho/laranja
    'Prestação de Contas em Complementação': 'bg-orange-200 text-orange-900 ring-1 ring-orange-400',
    'Prestação de Contas Rejeitada': 'bg-red-200 text-red-900 ring-1 ring-red-400',
    'Reprovado': 'bg-red-200 text-red-900',
    'Inadimplente': 'bg-red-200 text-red-900 ring-1 ring-red-400',
    // 🟡 Aguardando ação — amarelo/âmbar
    'Aguardando Envio do Plano de Trabalho': 'bg-amber-100 text-amber-800',
    'Aguardando Análise': 'bg-amber-100 text-amber-800',
    'Aguardando Prestação de Contas': 'bg-amber-100 text-amber-800',
    'Em Análise': 'bg-amber-100 text-amber-800',
    'Prestação de Contas em Análise': 'bg-amber-100 text-amber-800',
    'Prestação de Contas enviada para Análise': 'bg-amber-100 text-amber-800',
    'Prestação de contas enviada para análise': 'bg-amber-100 text-amber-800',
    // 🔵 Aprovado / em andamento — azul
    'Aprovado': 'bg-blue-100 text-blue-700',
    'Em Execução': 'bg-blue-100 text-blue-700',
    'Em execução': 'bg-blue-100 text-blue-700',
    // 🟢 Concluído com sucesso — verde
    'Concluído': 'bg-emerald-100 text-emerald-700',
    'Prestação de Contas Concluída': 'bg-emerald-100 text-emerald-700',
    'Prestação de Contas Comprovada': 'bg-emerald-100 text-emerald-700',
    'Prestação de Contas Aprovada': 'bg-emerald-100 text-emerald-700',
    // ⚪ Neutro — cinza
    'Cancelado': 'bg-gray-100 text-gray-600',
    'Sem Situação': 'bg-gray-100 text-gray-500',
  }
  const cls = colorMap[situacao] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}>
      {situacao}
    </span>
  )
}

function buildPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = []
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n) }
  add(1)
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) add(i)
  if (current < total - 2) pages.push('...')
  add(total)
  return pages
}
