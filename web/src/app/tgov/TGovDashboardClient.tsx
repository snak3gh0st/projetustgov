'use client'

import { useCallback, useEffect, useState } from 'react'
import TGovStatusDonut from '@/components/TGovStatusDonut'
import {
  DEFAULT_MAIN_FILTERS,
  DEFAULT_TABLE_FILTERS,
  DEFAULT_TGOV_TAB,
  TGOV_PAGE_SIZE,
  TGOV_TIPO_LABELS,
  type TGovMainFilters,
  type TGovTab,
  type TGovTabResponse,
  type TGovTableFilters,
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

// Build a stable list of years from current year down to 2020
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
// Props
// ---------------------------------------------------------------------------

interface TGovDashboardClientProps {
  userRole: 'gestor' | 'vendedor' | 'visualizador' | 'coordenador'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TGovDashboardClient({ userRole: _userRole }: TGovDashboardClientProps) {
  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<TGovTab>(DEFAULT_TGOV_TAB)

  // --- Shared main filters (preserved across tab switches) ---
  const [mainFilters, setMainFilters] = useState<TGovMainFilters>(DEFAULT_MAIN_FILTERS)

  // --- Inline table-only filters (reset on tab switch) ---
  const [tableFilters, setTableFilters] = useState<TGovTableFilters>(DEFAULT_TABLE_FILTERS)

  // --- Pagination (reset on filter or tab change) ---
  const [page, setPage] = useState(1)

  // --- Data ---
  const [data, setData] = useState<TGovTabResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch active tab data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(
    async (
      tab: TGovTab,
      mf: TGovMainFilters,
      tf: TGovTableFilters,
      pg: number
    ) => {
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
        const json: TGovTabResponse = await res.json()
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

  // Fetch whenever active inputs change
  useEffect(() => {
    fetchData(activeTab, mainFilters, tableFilters, page)
  }, [activeTab, mainFilters, tableFilters, page, fetchData])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTabSwitch(tab: TGovTab) {
    setActiveTab(tab)
    // Reset table-only filters and pagination; main filters are preserved
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setPage(1)
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
    setMainFilters(DEFAULT_MAIN_FILTERS)
    setTableFilters(DEFAULT_TABLE_FILTERS)
    setPage(1)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const tabLabel = activeTab === 'aprovacao' ? 'Aprovação' : 'Execução'
  const totalPages = data?.table.totalPages ?? 1
  const totalRows = data?.table.totalRows ?? 0

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

          {/* Tab switcher */}
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
          {/* Ano */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ano</label>
            <select
              value={mainFilters.ano}
              onChange={(e) => handleMainFilterChange('ano', e.target.value)}
              className="block h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
            <select
              value={mainFilters.tipo}
              onChange={(e) =>
                handleMainFilterChange('tipo', e.target.value as TGovMainFilters['tipo'])
              }
              className="block h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(TGOV_TIPO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
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

          {/* UF */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              UF do Proponente
            </label>
            <input
              type="text"
              value={mainFilters.uf}
              onChange={(e) =>
                handleMainFilterChange('uf', e.target.value.toUpperCase().slice(0, 2))
              }
              placeholder="Ex: SP"
              maxLength={2}
              className="block h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-800 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Reset */}
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
        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPI + Donut row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total KPI card */}
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

          {/* Donut chart — spans 2 cols */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
              Distribuição por Situação
            </p>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : data ? (
              <TGovStatusDonut data={data.byStatus} total={data.total} />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                Nenhum dado disponível
              </div>
            )}
          </div>
        </div>

        {/* Table section */}
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Table header + inline filters */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">
                Detalhamento — {tabLabel}
              </p>
              {!loading && data && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {totalRows.toLocaleString('pt-BR')} registro{totalRows !== 1 ? 's' : ''}
                  {tableFilters.proponente || tableFilters.numeroProposta
                    ? ' (filtrado)'
                    : ''}
                </p>
              )}
            </div>

            {/* Inline table-only filters */}
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
                placeholder={activeTab === 'aprovacao' ? 'Numero Proposta' : 'ID Proposta / Convênio'}
                className="h-8 w-52 rounded-lg border border-gray-200 px-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {activeTab === 'aprovacao' ? 'ID Proposta' : 'ID Proposta / Convênio'}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Data
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    CNPJ
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Proponente
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data && data.table.rows.length > 0 ? (
                  data.table.rows.map((row, idx) => (
                    <tr
                      key={`${row.numeroProposta}-${idx}`}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-2.5 text-gray-700 font-mono text-xs">
                        {row.numeroProposta || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDate(row.data)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {formatCnpj(row.cnpj) || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[240px]">
                        <a
                          href={`/lead/${encodeURIComponent(row.cnpj)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate block hover:text-blue-600 hover:underline"
                          title={row.proponente}
                        >
                          {row.proponente || '—'}
                        </a>
                      </td>
                      <td className="px-4 py-2.5">
                        <SituacaoBadge situacao={row.situacao} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      Nenhum registro encontrado para os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ‹
                </button>

                {/* Numbered pages window */}
                {buildPageWindow(page, totalPages).map((p) =>
                  p === '...' ? (
                    <span key={`ellipsis-${Math.random()}`} className="px-1 text-xs text-gray-400">
                      …
                    </span>
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

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Situacao Badge
// ---------------------------------------------------------------------------

function SituacaoBadge({ situacao }: { situacao: string }) {
  const colorMap: Record<string, string> = {
    'Em Execução': 'bg-green-100 text-green-700',
    'Em execução': 'bg-green-100 text-green-700',
    'Aprovado': 'bg-blue-100 text-blue-700',
    'Aguardando Análise': 'bg-amber-100 text-amber-700',
    'Aguardando Envio do Plano de Trabalho': 'bg-orange-100 text-orange-700',
    'Em Análise': 'bg-violet-100 text-violet-700',
    'Reprovado': 'bg-red-100 text-red-700',
    'Cancelado': 'bg-gray-100 text-gray-600',
    'Concluído': 'bg-teal-100 text-teal-700',
    'Prestação de Contas em Análise': 'bg-pink-100 text-pink-700',
    'Sem Situação': 'bg-gray-100 text-gray-500',
  }
  const cls = colorMap[situacao] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {situacao}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pagination window helper
// ---------------------------------------------------------------------------

function buildPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | '...')[] = []
  const add = (n: number) => {
    if (!pages.includes(n)) pages.push(n)
  }
  add(1)
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    add(i)
  }
  if (current < total - 2) pages.push('...')
  add(total)
  return pages
}
