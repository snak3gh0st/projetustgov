'use client'

import { useEffect, useState } from 'react'
import { formatCompactCurrency, formatCurrency } from '@/lib/format'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts'

// --- Types ---
interface BIKpis {
  conversion_rate: number
  fechado_count: number
  assigned_count: number
  avg_days_to_close: number | null
  pipeline_value: number
  closed_value: number
  commission_earned: number
  commission_bonus: number
  ticket_medio: number
  nao_contatado_count: number
  ainda_nao_count: number
  telefones_validos: number
  telefones_invalidos: number
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

// --- Status color map (all 6 pipeline statuses) ---
const FUNNEL_COLORS: Record<string, string> = {
  'Nao Contatado': '#ef4444',
  'Não Contatado': '#ef4444',
  'Ainda Não': '#f43f5e',         // rose-500 (distinct from red)
  'Retorno': '#f59e0b',
  'Proposta': '#3b82f6',
  'Aguardando Closer': '#8b5cf6', // violet-500
  'Fechado': '#22c55e',
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
  const [data, setData] = useState<BIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bi', { signal: AbortSignal.timeout(20000) })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-[1800px] mx-auto">
        <div>
          <div className="h-8 w-80 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

  if (error || !data) {
    return (
      <div className="space-y-4 w-full max-w-[1800px] mx-auto">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">BI Analytics</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3">
          <p className="text-red-700 font-medium">Erro ao carregar dados do BI dashboard</p>
          {error && (
            <code className="text-red-600 text-xs bg-red-100 px-3 py-2 rounded font-mono max-w-full break-all">{error}</code>
          )}
          <button
            onClick={() => { window.location.reload() }}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const { role, kpis } = data
  const isVendedor = role === 'vendedor' || role === 'coordenador'

  // --- KPI color helpers ---
  const conversionColor =
    kpis.conversion_rate > 10 ? 'text-green-600' :
    kpis.conversion_rate >= 5 ? 'text-amber-600' :
    'text-red-600'

  const daysColor =
    kpis.avg_days_to_close == null ? 'text-gray-400' :
    kpis.avg_days_to_close < 15 ? 'text-green-600' :
    kpis.avg_days_to_close <= 30 ? 'text-amber-600' :
    'text-red-600'

  // Ticket medio: gray if 0
  const ticketColor = kpis.ticket_medio === 0 ? 'text-gray-400' : 'text-[#0072F7]'

  // Nao Contatados: red if > 20, amber if > 10, green otherwise
  const naoContatadoColor =
    kpis.nao_contatado_count > 20 ? 'text-red-600' :
    kpis.nao_contatado_count > 10 ? 'text-amber-600' :
    'text-green-600'

  // Telefones validos percentage
  const totalTelefones = kpis.telefones_validos + kpis.telefones_invalidos
  const telefonesValidosPct = totalTelefones > 0
    ? Number(((kpis.telefones_validos / totalTelefones) * 100).toFixed(0))
    : null
  const telefonesColor =
    telefonesValidosPct == null ? 'text-gray-400' :
    telefonesValidosPct > 70 ? 'text-green-600' :
    telefonesValidosPct > 40 ? 'text-amber-600' :
    'text-red-600'

  // Top 10 for UF chart
  const top10uf = data.leads_by_uf.slice(0, 10)

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      {/* 1. Page Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">
          {isVendedor ? 'Meu Desempenho' : 'BI Analytics'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Indicadores de performance e tendencias da operacao de vendas
        </p>
      </div>

      {/* 2. KPI Cards — 7 cards: 2col mobile, 4col tablet, 7col desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">

        {/* Card 1: Taxa de Conversao */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa de Conversao</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${conversionColor}`}>
            {kpis.conversion_rate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {kpis.fechado_count} de {kpis.assigned_count} leads
          </p>
        </div>

        {/* Card 2: Ticket Medio */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Ticket Medio</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${ticketColor}`}>
            {kpis.ticket_medio > 0 ? formatCompactCurrency(kpis.ticket_medio) : 'R$ 0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">media por venda fechada</p>
        </div>

        {/* Card 3: Dias p/ Fechar */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Dias p/ Fechar (media)</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${daysColor}`}>
            {kpis.avg_days_to_close != null ? `${kpis.avg_days_to_close} dias` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {kpis.avg_days_to_close != null ? 'media de fechamento' : 'sem dados'}
          </p>
        </div>

        {/* Card 4: Nao Contatados (gestor) / Faturamento Fechado (vendedor) */}
        {isVendedor ? (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Faturamento Fechado</p>
            <p className="text-3xl font-heading font-bold text-green-600 mt-2">
              {formatCompactCurrency(kpis.closed_value)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {formatCurrency(kpis.closed_value)}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Nao Contatados</p>
            <p className={`text-3xl font-heading font-bold mt-2 ${naoContatadoColor}`}>
              {kpis.nao_contatado_count}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              sem abordar
              {kpis.ainda_nao_count > 0 && (
                <span className="text-rose-400 ml-1">(+ {kpis.ainda_nao_count} Ainda Nao)</span>
              )}
            </p>
          </div>
        )}

        {/* Card 5: Valor Pipeline */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valor Pipeline</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {formatCompactCurrency(kpis.pipeline_value)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatCurrency(kpis.pipeline_value)}
          </p>
        </div>

        {/* Card 6: Comissao Confirmada */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Comissao Confirmada</p>
          <p className="text-3xl font-heading font-bold text-green-600 mt-2">
            {formatCompactCurrency(kpis.commission_earned)}
          </p>
          {kpis.commission_bonus > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              + {formatCurrency(kpis.commission_bonus)} bonus
            </p>
          )}
          {kpis.commission_bonus === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {formatCurrency(kpis.commission_earned)}
            </p>
          )}
        </div>

        {/* Card 7: Telefones Validos */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Telefones Validos</p>
          <p className={`text-3xl font-heading font-bold mt-2 ${telefonesColor}`}>
            {telefonesValidosPct != null ? `${telefonesValidosPct}%` : '-'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {totalTelefones > 0
              ? `${kpis.telefones_validos} validos / ${kpis.telefones_invalidos} invalidos`
              : 'sem dados'
            }
          </p>
        </div>

      </div>

      {/* 3. Charts Grid */}
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
    </div>
  )
}
