'use client'

import { useCallback, useEffect, useState } from 'react'
import TGovStatusDonut from '@/components/TGovStatusDonut'
import {
  DEFAULT_MAIN_FILTERS,
  DEFAULT_EXECUCAO_MAIN_FILTERS,
  DEFAULT_TABLE_FILTERS,
  DEFAULT_TGOV_TAB,
  TGOV_PAGE_SIZE,
  TGOV_TIPO_LABELS,
  type TGovMainFilters,
  type TGovTab,
  type TGovTabResponse,
  type TGovTableFilters,
  type TGovExecucaoTableRow,
  type TGovAprovacaoTableRow,
  type TGovStatusBucket,
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

/** TransfereGov link for a convenio number */
function buildTGovLink(nrConvenio: string): string {
  return `https://discricionarias.transferegov.sistema.gov.br/voluntarias/convenio/ConsultarConvenio/ConsultarConvenio.do?Op=0&nrConvenio=${nrConvenio}`
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
// Extended response type for execucao (includes byExecRange)
// ---------------------------------------------------------------------------
interface ExecucaoResponse extends TGovTabResponse {
  byExecRange?: TGovStatusBucket[]
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TGovDashboardClientProps {
  userRole: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TGovDashboardClient({ userRole: _userRole }: TGovDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<TGovTab>(DEFAULT_TGOV_TAB)
  const [mainFilters, setMainFilters] = useState<TGovMainFilters>(DEFAULT_MAIN_FILTERS)
  const [tableFilters, setTableFilters] = useState<TGovTableFilters>(DEFAULT_TABLE_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ExecucaoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sidecard state
  const [selectedExecRow, setSelectedExecRow] = useState<TGovExecucaoTableRow | null>(null)
  const [selectedAprovRow, setSelectedAprovRow] = useState<TGovAprovacaoTableRow | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(
    async (tab: TGovTab, mf: TGovMainFilters, tf: TGovTableFilters, pg: number) => {
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
        params.set('page_size', String(TGOV_PAGE_SIZE))

        const res = await fetch(`/api/tgov/${tab}?${params.toString()}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        const json: ExecucaoResponse = await res.json()
        setData(json)
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
    fetchData(activeTab, mainFilters, tableFilters, page)
  }, [activeTab, mainFilters, tableFilters, page, fetchData])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTabSwitch(tab: TGovTab) {
    setActiveTab(tab)
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setMainFilters(tab === 'execucao' ? DEFAULT_EXECUCAO_MAIN_FILTERS : DEFAULT_MAIN_FILTERS)
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
    setMainFilters(activeTab === 'execucao' ? DEFAULT_EXECUCAO_MAIN_FILTERS : DEFAULT_MAIN_FILTERS)
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setPage(1)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabLabel = activeTab === 'aprovacao' ? 'Aprovação' : 'Execução'
  const totalPages = data?.table.totalPages ?? 1
  const totalRows = data?.table.totalRows ?? 0

  // For execucao tab, use byExecRange for donut; for aprovacao, use byStatus
  const donutData = activeTab === 'execucao' && data?.byExecRange
    ? data.byExecRange
    : data?.byStatus ?? []
  const donutLabel = activeTab === 'execucao'
    ? 'Distribuição por % Execução'
    : 'Distribuição por Situação'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">TGov Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Painel gerencial de propostas e projetos em execução
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['aprovacao', 'execucao'] as TGovTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabSwitch(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'aprovacao' ? 'Aprovação' : 'Execução'}
              </button>
            ))}
          </div>
        </div>

        {/* Main shared filters */}
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
                {activeTab === 'aprovacao' ? 'propostas' : 'projetos'} com os filtros aplicados
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
              <TGovStatusDonut data={donutData} total={data.total} />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                Nenhum dado disponível
              </div>
            )}
          </div>
        </div>

        {/* Table section */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
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

          <div className="overflow-x-auto">
            {activeTab === 'execucao' ? (
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

          {!loading && totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">Página {page} de {totalPages}</p>
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

      {/* Sidecard slide-over */}
      {selectedExecRow && (
        <ExecucaoSidecard row={selectedExecRow} onClose={() => setSelectedExecRow(null)} />
      )}
      {selectedAprovRow && (
        <AprovacaoSidecard row={selectedAprovRow} onClose={() => setSelectedAprovRow(null)} />
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
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">ID Proposta</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">CNPJ</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Proponente</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Situação</th>
          <th className="px-3 py-2.5 w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {loading ? (
          <SkeletonRows cols={6} />
        ) : rows && rows.length > 0 ? (
          rows.map((row, idx) => (
            <tr
              key={`${row.numeroProposta}-${idx}`}
              className="hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => onRowClick(row)}
            >
              <td className="px-5 py-2.5 text-gray-700 font-mono text-xs">{row.numeroProposta || '—'}</td>
              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(row.data)}</td>
              <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{formatCnpj(row.cnpj) || '—'}</td>
              <td className="px-4 py-2.5 text-gray-700 max-w-[240px]">
                <span className="truncate block" title={row.proponente}>
                  {row.proponente || '—'}
                </span>
              </td>
              <td className="px-4 py-2.5"><SituacaoBadge situacao={row.situacao} /></td>
              <td className="px-3 py-2.5 text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow cols={6} />
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
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Nr Convênio</th>
          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Ano</th>
          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">CNPJ</th>
          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Proponente</th>
          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">UF</th>
          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Valor Global</th>
          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Saldo Conta</th>
          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Desembolsado</th>
          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">% Exec.</th>
          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Situação</th>
          <th className="px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {loading ? (
          <SkeletonRows cols={11} />
        ) : rows && rows.length > 0 ? (
          rows.map((row, idx) => (
            <tr
              key={`${row.nrConvenio}-${idx}`}
              className="hover:bg-blue-50/50 transition-colors cursor-pointer"
              onClick={() => onRowClick(row)}
            >
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                <a
                  href={buildTGovLink(row.nrConvenio)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  title="Abrir no TransfereGov"
                >
                  {row.nrConvenio || '—'}
                </a>
              </td>
              <td className="px-3 py-2.5 text-gray-500 text-xs tabular-nums">{row.anoInstrumento || '—'}</td>
              <td className="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{formatCnpj(row.cnpj) || '—'}</td>
              <td className="px-3 py-2.5 text-gray-700 max-w-[200px]">
                <span className="truncate block text-xs" title={row.proponente}>
                  {row.proponente || '—'}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-500 text-xs">{row.uf || '—'}</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums whitespace-nowrap text-gray-700 font-medium">
                {formatCurrency(row.valorGlobal)}
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums whitespace-nowrap text-gray-600">
                {formatCurrency(row.saldoConta)}
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums whitespace-nowrap text-gray-600">
                {formatCurrency(row.valorDesembolsado)}
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums whitespace-nowrap">
                <span className={
                  row.pctExecucao !== null && row.pctExecucao >= 80
                    ? 'text-green-600 font-medium'
                    : row.pctExecucao !== null && row.pctExecucao >= 50
                      ? 'text-amber-600'
                      : 'text-gray-500'
                }>
                  {formatPercent(row.pctExecucao)}
                </span>
              </td>
              <td className="px-3 py-2.5"><SituacaoBadge situacao={row.situacao} /></td>
              <td className="px-3 py-2.5 text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow cols={11} />
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
}: {
  row: TGovExecucaoTableRow
  onClose: () => void
}) {
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
              href={buildTGovLink(row.nrConvenio)}
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

          {/* Instrumento */}
          <SidecardSection title="Instrumento">
            <SidecardField label="Nr Convênio" value={row.nrConvenio} mono />
            <SidecardField label="Nr Proposta" value={row.numeroProposta} mono />
            <SidecardField label="Ano" value={row.anoInstrumento ? String(row.anoInstrumento) : null} />
            <SidecardField label="Data Assinatura" value={formatDate(row.data)} />
            <SidecardField label="Início Vigência" value={formatDate(row.dataInicioVigencia)} />
            <SidecardField label="Fim Vigência" value={formatDate(row.dataFimVigencia)} />
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

          {/* Valores financeiros */}
          <SidecardSection title="Valores Financeiros">
            <SidecardCurrency label="Valor Global" value={row.valorGlobal} bold />
            <SidecardCurrency label="Valor Repasse" value={row.valorRepasse} />
            <SidecardCurrency label="Valor Empenhado" value={row.valorEmpenhado} />
            <SidecardCurrency label="Valor Desembolsado" value={row.valorDesembolsado} />
            <div className="border-t border-gray-100 pt-2 mt-2" />
            <SidecardCurrency label="Saldo em Conta" value={row.saldoConta} />
            <SidecardCurrency label="Rendimento Aplicação" value={row.rendimentoAplicacao} />
            <SidecardCurrency label="Ingresso Contrapartida" value={row.ingressoContrapartida} />
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
}: {
  row: TGovAprovacaoTableRow
  onClose: () => void
}) {
  const tgovPropostaLink = `https://discricionarias.transferegov.sistema.gov.br/voluntarias/proposta/ConsultarProposta/ConsultarProposta.do?idProposta=${row.numeroProposta}`
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

          {/* Instrumento */}
          <SidecardSection title="Instrumento">
            <SidecardField label="ID Proposta" value={row.numeroProposta} mono />
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
    'Em Execução': 'bg-green-100 text-green-700',
    'Em execução': 'bg-green-100 text-green-700',
    'Aprovado': 'bg-blue-100 text-blue-700',
    'Aguardando Análise': 'bg-amber-100 text-amber-700',
    'Aguardando Envio do Plano de Trabalho': 'bg-orange-100 text-orange-700',
    'Aguardando Prestação de Contas': 'bg-amber-100 text-amber-700',
    'Em Análise': 'bg-violet-100 text-violet-700',
    'Reprovado': 'bg-red-100 text-red-700',
    'Cancelado': 'bg-gray-100 text-gray-600',
    'Concluído': 'bg-teal-100 text-teal-700',
    'Prestação de Contas em Análise': 'bg-pink-100 text-pink-700',
    'Prestação de Contas enviada para Análise': 'bg-indigo-100 text-indigo-700',
    'Prestação de Contas em Complementação': 'bg-purple-100 text-purple-700',
    'Prestação de Contas Concluída': 'bg-teal-100 text-teal-700',
    'Prestação de Contas Comprovada': 'bg-cyan-100 text-cyan-700',
    'Prestação de Contas Aprovada': 'bg-emerald-100 text-emerald-700',
    'Prestação de Contas Rejeitada': 'bg-red-100 text-red-600',
    'Prestação de contas enviada para análise': 'bg-indigo-100 text-indigo-700',
    'Inadimplente': 'bg-red-100 text-red-700',
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
