'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatCompactCurrency, formatCurrency } from '@/lib/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts'

// --- Types (Aprovacao) ---
interface BIKpis {
  closed_value: number
  conversion_rate: number
  fechado_count: number
  assigned_count: number
  contact_rate: number
  nao_contatado_count: number
  ticket_medio: number
  avg_days_to_close: number | null
  pipeline_value: number
  commission_earned: number
  commission_bonus: number
  notes_7d: number
  leads_touched_7d: number
  stale_count: number
}

interface PipelineFunnelItem {
  status: string
  count: number
}

interface CommissionByVendedorItem {
  vendedor_nome: string
  total_comissao: number
  total_bonus: number
}

interface LeadsByUfItem {
  uf: string
  count: number
  valor_emenda: number
}

interface ActivityTrendItem {
  month: string
  total_notes: number
  unique_leads: number
}

interface BIData {
  role: string
  kpis: BIKpis
  pipeline_funnel: PipelineFunnelItem[]
  commission_by_vendedor: CommissionByVendedorItem[]
  leads_by_uf: LeadsByUfItem[]
  activity_trend: ActivityTrendItem[]
}

// --- Types (Execucao) ---
interface ExecucaoKpis {
  total_cnpjs: number
  total_valor_global: number
  total_saldo: number
  total_desembolsado: number
  pct_execucao_medio: number | null
  total_alertas: number
  contact_rate: number
  nao_contatado_count: number
  notes_7d: number
  leads_touched_7d: number
  telefones_validos: number
  telefones_invalidos: number
}

interface CnpjsByVendedorItem {
  vendedor_nome: string
  total_cnpjs: number
  total_valor: number
}

interface CnpjsByUfItem {
  uf: string
  count: number
  valor_global: number
}

interface ExecucaoBIData {
  role: string
  kpis: ExecucaoKpis
  pipeline_funnel: PipelineFunnelItem[]
  cnpjs_by_vendedor: CnpjsByVendedorItem[]
  cnpjs_by_uf: CnpjsByUfItem[]
  activity_trend: ActivityTrendItem[]
}

// --- Vendedor list item ---
interface VendedorListItem {
  id: string
  nome: string
  lead_count: number
}

// --- Status color map (all pipeline statuses) ---
const FUNNEL_COLORS: Record<string, string> = {
  'Nao Contatado': '#ef4444',
  'Não Contatado': '#ef4444',
  'Ainda Não': '#f43f5e',         // rose-500 (distinct from red)
  'Retorno': '#f59e0b',
  'Quente': '#dc2626',            // red-600
  'Muito Quente': '#b91c1c',      // red-700 (priority)
  'Proposta': '#3b82f6',
  'Aguardando Closer': '#8b5cf6', // violet-500
  'Fechado': '#22c55e',
  'Telefone Invalido': '#9ca3af',
  'Contatado (Aprovação)': '#f97316', // orange-500
}

// --- Month formatter (pt-BR short names) ---
const PT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return PT_MONTHS[d.getUTCMonth()]
}

// --- Shared tooltip style ---
const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 12,
}

export default function BIDashboard() {
  const [pipeline, setPipeline] = useState<'aprovacao' | 'execucao'>('aprovacao')
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [vendedoresList, setVendedoresList] = useState<VendedorListItem[]>([])

  const [data, setData] = useState<BIData | null>(null)
  const [execData, setExecData] = useState<ExecucaoBIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detect role from whichever dataset loaded first
  const role = data?.role || execData?.role || ''
  const isGestor = role === 'gestor' || role === 'coordenador'

  // Fetch vendedores list on mount (for gestor/coordenador dropdown)
  useEffect(() => {
    fetch('/api/vendedores', { signal: AbortSignal.timeout(15000) })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setVendedoresList(d)
      })
      .catch(() => {/* ignore — dropdown just won't show */})
  }, [])

  // Fetch BI data when pipeline or vendedor filter changes
  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)

    const qs = params.toString() ? `?${params.toString()}` : ''

    if (pipeline === 'aprovacao') {
      fetch(`/api/bi${qs}`, { signal: AbortSignal.timeout(20000) })
        .then(r => r.json())
        .then(d => {
          if (d.error) { setError(d.error); return }
          setData(d)
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false))
    } else {
      fetch(`/api/bi/execucao${qs}`, { signal: AbortSignal.timeout(20000) })
        .then(r => r.json())
        .then(d => {
          if (d.error) { setError(d.error); return }
          setExecData(d)
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false))
    }
  }, [pipeline, vendedorFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-[1800px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="h-8 w-80 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-56 bg-gray-200 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // --- Error state ---
  if (error || (pipeline === 'aprovacao' && !data) || (pipeline === 'execucao' && !execData)) {
    return (
      <div className="space-y-4 w-full max-w-[1800px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-gray-900">BI Analytics</h1>
          </div>
          <HeaderControls
            pipeline={pipeline}
            setPipeline={setPipeline}
            vendedorFilter={vendedorFilter}
            setVendedorFilter={setVendedorFilter}
            vendedoresList={vendedoresList}
            isGestor={isGestor}
          />
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3">
          <p className="text-red-700 font-medium">Erro ao carregar dados do BI dashboard</p>
          {error && (
            <code className="text-red-600 text-xs bg-red-100 px-3 py-2 rounded font-mono max-w-full break-all">{error}</code>
          )}
          <button
            onClick={() => fetchData()}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // Decide which role to use for display
  const displayRole = pipeline === 'aprovacao' ? data!.role : execData!.role
  const isVendedor = displayRole === 'vendedor' || displayRole === 'coordenador'

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      {/* 1. Page Header + Tab Switcher + Vendedor Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">
            {isVendedor ? 'Meu Desempenho' : 'BI Analytics'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {pipeline === 'aprovacao'
              ? 'Indicadores de performance e tendencias da operacao de vendas'
              : 'Indicadores de performance da execucao de convenios'
            }
          </p>
        </div>
        <HeaderControls
          pipeline={pipeline}
          setPipeline={setPipeline}
          vendedorFilter={vendedorFilter}
          setVendedorFilter={setVendedorFilter}
          vendedoresList={vendedoresList}
          isGestor={isGestor}
        />
      </div>

      {/* 2. Tab content */}
      {pipeline === 'aprovacao'
        ? <AprovacaoTab data={data!} />
        : <ExecucaoTab data={execData!} />
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Header Controls (Tab switcher + Vendedor dropdown)
// ─────────────────────────────────────────────────────────────
function HeaderControls({
  pipeline, setPipeline,
  vendedorFilter, setVendedorFilter,
  vendedoresList, isGestor,
}: {
  pipeline: 'aprovacao' | 'execucao'
  setPipeline: (v: 'aprovacao' | 'execucao') => void
  vendedorFilter: string
  setVendedorFilter: (v: string) => void
  vendedoresList: VendedorListItem[]
  isGestor: boolean
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setPipeline('aprovacao')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            pipeline === 'aprovacao'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Aprovacao
        </button>
        <button
          onClick={() => setPipeline('execucao')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            pipeline === 'execucao'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Execucao
        </button>
      </div>

      {/* Vendedor filter — gestor/coordenador only */}
      {isGestor && vendedoresList.length > 0 && (
        <select
          value={vendedorFilter}
          onChange={e => setVendedorFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">Todos os vendedores</option>
          {vendedoresList.map(v => (
            <option key={v.id} value={v.id}>
              {v.nome} ({v.lead_count})
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// APROVACAO TAB — exact same rendering as the original page
// ─────────────────────────────────────────────────────────────
function AprovacaoTab({ data }: { data: BIData }) {
  const { kpis } = data

  const conversionColor = kpis.conversion_rate > 10 ? 'text-green-600' : kpis.conversion_rate >= 5 ? 'text-amber-600' : 'text-red-600'
  const contactRateColor = kpis.contact_rate >= 80 ? 'text-green-600' : kpis.contact_rate >= 50 ? 'text-amber-600' : 'text-red-600'
  const daysColor = kpis.avg_days_to_close == null ? 'text-gray-400' : kpis.avg_days_to_close < 15 ? 'text-green-600' : kpis.avg_days_to_close <= 30 ? 'text-amber-600' : 'text-red-600'
  const staleColor = kpis.stale_count > 50 ? 'text-red-600' : kpis.stale_count > 20 ? 'text-amber-600' : 'text-green-600'

  const top10uf = data.leads_by_uf.slice(0, 10)

  return (
    <>
      {/* KPI Cards — 7 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">

        {/* Card 1: Faturamento Fechado */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Faturamento</p>
          <p className="text-3xl font-heading font-bold text-green-600 mt-2">
            {formatCompactCurrency(kpis.closed_value)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.fechado_count} vendas fechadas</p>
        </div>

        {/* Card 2: Taxa de Conversao */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Conversao</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${conversionColor}`}>
            {kpis.conversion_rate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.fechado_count}/{kpis.assigned_count} leads</p>
        </div>

        {/* Card 3: Taxa de Contato */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa de Contato</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${contactRateColor}`}>
            {kpis.contact_rate.toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.nao_contatado_count} sem abordar</p>
        </div>

        {/* Card 4: Ticket Medio */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Ticket Medio</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${kpis.ticket_medio > 0 ? 'text-[#0072F7]' : 'text-gray-400'}`}>
            {kpis.ticket_medio > 0 ? formatCompactCurrency(kpis.ticket_medio) : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">media por venda</p>
        </div>

        {/* Card 5: Velocidade */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Velocidade</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${daysColor}`}>
            {kpis.avg_days_to_close != null ? `${kpis.avg_days_to_close}d` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">dias p/ fechar</p>
        </div>

        {/* Card 6: Atividade (7d) */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Atividade (7d)</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {kpis.notes_7d}
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.leads_touched_7d} leads tocados</p>
        </div>

        {/* Card 7: Leads Parados */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Leads Parados</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${staleColor}`}>
            {kpis.stale_count}
          </p>
          <p className="text-xs text-gray-400 mt-1">sem atividade 7d+</p>
        </div>

      </div>

      {/* Pipeline value + commission summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase">Pipeline Aberto</span>
          <span className="text-lg font-heading font-bold text-[#0072F7]">{formatCompactCurrency(kpis.pipeline_value)}</span>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase">Comissao Acumulada</span>
          <span className="text-lg font-heading font-bold text-green-600">{formatCompactCurrency(kpis.commission_earned)}</span>
        </div>
        {kpis.commission_bonus > 0 && (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase">Bonus Fechamento</span>
            <span className="text-lg font-heading font-bold text-green-600">{formatCurrency(kpis.commission_bonus)}</span>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Chart 1: Pipeline Funnel (horizontal bar) */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Pipeline Funnel</h3>
          {data.pipeline_funnel.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.pipeline_funnel}
                  layout="vertical"
                  margin={{ left: 110, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number) => [`${value} leads`, 'Total']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {data.pipeline_funnel.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={FUNNEL_COLORS[entry.status] || '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Comissao por Vendedor */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Comissao por Vendedor</h3>
          {data.commission_by_vendedor.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.commission_by_vendedor}
                  margin={{ left: 10, right: 10, top: 5, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="vendedor_nome"
                    tick={{ fontSize: 10, fill: '#374151' }}
                    angle={-30}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickFormatter={v => formatCompactCurrency(v)}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'total_comissao' ? 'Comissao' : 'Bonus'
                    ]}
                  />
                  <Bar dataKey="total_comissao" fill="#0072F7" radius={[4, 4, 0, 0]} maxBarSize={40} name="total_comissao" stackId="a" />
                  <Bar dataKey="total_bonus" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={40} name="total_bonus" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 3: Leads por UF */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Leads por UF (top 10)</h3>
          {top10uf.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10uf}
                  layout="vertical"
                  margin={{ left: 30, right: 30, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="uf"
                    tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number, name: string) => [
                      name === 'count' ? `${value} leads` : formatCompactCurrency(value),
                      name === 'count' ? 'Leads' : 'Valor Emendas'
                    ]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {top10uf.map((entry, index) => (
                      <Cell
                        key={entry.uf}
                        fill={index === 0 ? '#0072F7' : index < 3 ? '#3b82f6' : '#60a5fa'}
                        opacity={1 - index * 0.05}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 4: Tendencia de Atividade */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Tendencia de Atividade (6 meses)</h3>
          {data.activity_trend.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.activity_trend}
                  margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0072F7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0072F7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    labelFormatter={formatMonth}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'total_notes' ? 'Notas de Contato' : 'Leads Unicos'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_notes"
                    stroke="#22c55e"
                    fill="url(#activityGrad)"
                    strokeWidth={2}
                    name="total_notes"
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_leads"
                    stroke="#0072F7"
                    fill="url(#leadsGrad)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    name="unique_leads"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// EXECUCAO TAB
// ─────────────────────────────────────────────────────────────
function ExecucaoTab({ data }: { data: ExecucaoBIData }) {
  const { kpis } = data

  const pctExecColor = kpis.pct_execucao_medio == null ? 'text-gray-400' : kpis.pct_execucao_medio >= 60 ? 'text-green-600' : kpis.pct_execucao_medio >= 30 ? 'text-amber-600' : 'text-red-600'
  const alertasColor = kpis.total_alertas === 0 ? 'text-green-600' : kpis.total_alertas <= 50 ? 'text-amber-600' : 'text-red-600'
  const contactRateColor = kpis.contact_rate >= 80 ? 'text-green-600' : kpis.contact_rate >= 50 ? 'text-amber-600' : 'text-red-600'

  const top10uf = data.cnpjs_by_uf.slice(0, 10)

  return (
    <>
      {/* KPI Cards — 7 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">

        {/* Card 1: CNPJs em Execucao */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">CNPJs Execucao</p>
          <p className="text-3xl font-heading font-bold mt-2 text-gray-900">
            {kpis.total_cnpjs.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-400 mt-1">projetos ativos</p>
        </div>

        {/* Card 2: Valor Convenios */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valor Convenios</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {formatCompactCurrency(kpis.total_valor_global)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(kpis.total_valor_global)}</p>
        </div>

        {/* Card 3: Taxa de Contato */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa de Contato</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${contactRateColor}`}>
            {kpis.contact_rate.toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.nao_contatado_count} sem abordar</p>
        </div>

        {/* Card 4: Saldo Disponivel */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Saldo Disponivel</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {formatCompactCurrency(kpis.total_saldo)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(kpis.total_saldo)}</p>
        </div>

        {/* Card 5: % Execucao Medio */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">% Execucao</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${pctExecColor}`}>
            {kpis.pct_execucao_medio != null ? `${kpis.pct_execucao_medio.toFixed(1)}%` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">media ponderada</p>
        </div>

        {/* Card 6: Atividade (7d) */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Atividade (7d)</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {kpis.notes_7d}
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.leads_touched_7d} leads tocados</p>
        </div>

        {/* Card 7: Alertas */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Alertas</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${alertasColor}`}>
            {kpis.total_alertas}
          </p>
          <p className="text-xs text-gray-400 mt-1">sem desembolso</p>
        </div>

      </div>

      {/* Financial summary bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase">Total Desembolsado</span>
          <span className="text-lg font-heading font-bold text-[#0072F7]">{formatCompactCurrency(kpis.total_desembolsado)}</span>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase">Saldo em Conta</span>
          <span className="text-lg font-heading font-bold text-[#0072F7]">{formatCompactCurrency(kpis.total_saldo)}</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Chart 1: Pipeline Funnel (horizontal bar) */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Pipeline Funnel (Execucao)</h3>
          {data.pipeline_funnel.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: Math.max(220, data.pipeline_funnel.length * 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.pipeline_funnel}
                  layout="vertical"
                  margin={{ left: 130, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    width={130}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number) => [`${value} CNPJs`, 'Total']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {data.pipeline_funnel.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={FUNNEL_COLORS[entry.status] || '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: CNPJs por Vendedor (horizontal bar) */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">CNPJs por Vendedor</h3>
          {data.cnpjs_by_vendedor.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: Math.max(250, data.cnpjs_by_vendedor.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.cnpjs_by_vendedor}
                  layout="vertical"
                  margin={{ left: 100, right: 30, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="vendedor_nome"
                    tick={{ fontSize: 11, fill: '#374151' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number, name: string) => [
                      name === 'total_cnpjs' ? `${value} CNPJs` : formatCompactCurrency(value),
                      name === 'total_cnpjs' ? 'CNPJs' : 'Valor Convenios'
                    ]}
                  />
                  <Bar dataKey="total_cnpjs" fill="#0072F7" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {data.cnpjs_by_vendedor.map((_, index) => (
                      <Cell
                        key={index}
                        fill={index === 0 ? '#0072F7' : index < 3 ? '#3b82f6' : '#60a5fa'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 3: CNPJs por UF */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">CNPJs por UF (top 10)</h3>
          {top10uf.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10uf}
                  layout="vertical"
                  margin={{ left: 30, right: 30, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="uf"
                    tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    formatter={(value: number, name: string) => [
                      name === 'count' ? `${value} CNPJs` : formatCompactCurrency(value),
                      name === 'count' ? 'CNPJs' : 'Valor Convenios'
                    ]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {top10uf.map((entry, index) => (
                      <Cell
                        key={entry.uf}
                        fill={index === 0 ? '#0072F7' : index < 3 ? '#3b82f6' : '#60a5fa'}
                        opacity={1 - index * 0.05}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 4: Tendencia de Atividade */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Tendencia de Atividade (6 meses)</h3>
          {data.activity_trend.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.activity_trend}
                  margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="execActivityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="execLeadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0072F7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0072F7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#111827' }}
                    labelFormatter={formatMonth}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'total_notes' ? 'Notas de Contato' : 'Leads Unicos'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_notes"
                    stroke="#22c55e"
                    fill="url(#execActivityGrad)"
                    strokeWidth={2}
                    name="total_notes"
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_leads"
                    stroke="#0072F7"
                    fill="url(#execLeadsGrad)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    name="unique_leads"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
