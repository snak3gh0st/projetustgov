'use client'

import { useEffect, useState } from 'react'
import { formatCNPJ, formatCompactCurrency, formatCurrency } from '@/lib/format'

// --- Types ---
interface StatusCounts {
  'Não Contatado': number
  'Retorno': number
  'Proposta': number
  'Fechado': number
}

interface GlobalStats {
  total_leads: number
  total_assigned: number
  total_unassigned: number
  total_valor_emenda: number
  by_status: StatusCounts
}

interface VendedorStats {
  vendedor_id: string
  vendedor_nome: string
  total_leads: number
  nao_contatado: number
  retorno: number
  proposta: number
  fechado: number
  valor_total_emenda: number
  comissao_total: number
  last_activity: string | null
  ligacoes_hoje: number
  propostas_hoje: number
  fechados_hoje: number
}

interface RecentActivity {
  cnpj: string
  nome: string
  vendedor_nome: string
  status_contato: string
  updated_at: string
}

interface DashboardData {
  role?: string
  global: GlobalStats
  vendedores: VendedorStats[]
  recent_activity: RecentActivity[]
  commission_breakdown?: {
    status_contato: string
    count: number
    total_comissao: number
    total_venda: number
    locked_count: number
  }[]
}

// --- Status config ---
const STATUS_CONFIG: Record<string, { color: string; bg: string; bar: string; label: string }> = {
  'Não Contatado': { color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', bar: 'bg-red-500', label: 'Não Contatado' },
  'Retorno': { color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30', bar: 'bg-amber-500', label: 'Retorno' },
  'Proposta': { color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30', bar: 'bg-blue-500', label: 'Proposta' },
  'Fechado': { color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30', bar: 'bg-green-500', label: 'Fechado' },
}

const STATUS_ORDER = ['Não Contatado', 'Retorno', 'Proposta', 'Fechado'] as const

function timeAgo(date: string | null): string {
  if (!date) return 'nunca'
  const now = new Date().getTime()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `ha ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `ha ${hours}h`
  const days = Math.floor(hours / 24)
  return `ha ${days}d`
}

export default function CRMDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard-crm')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(true); return }
        setData(d)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div>
          <div className="h-8 w-96 bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-800/50 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-16 bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Erro ao carregar dashboard CRM
      </div>
    )
  }

  const { global: g, vendedores, recent_activity, role } = data
  const isVendedor = role === 'vendedor'
  const totalForPipeline = Object.values(g.by_status).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 1. Page header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">
          {isVendedor ? 'Meu Pipeline — Campanha Emendas 2026' : 'Dashboard CRM — Campanha Emendas 2026'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {isVendedor ? 'Seus leads e desempenho pessoal' : 'Visao administrativa do trabalho da equipe de vendas'}
        </p>
      </div>

      {/* 2. Global stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Total Leads</p>
          <p className="text-3xl font-heading font-bold text-white mt-2">
            {g.total_leads.toLocaleString('pt-BR')}
          </p>
        </div>
        {!isVendedor && (
          <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Atribuidos</p>
            <p className="text-3xl font-heading font-bold text-blue-400 mt-2">
              {g.total_assigned.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {g.total_leads > 0 ? `${((g.total_assigned / g.total_leads) * 100).toFixed(0)}% do total` : '0%'}
            </p>
          </div>
        )}
        {!isVendedor && (
          <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Nao Atribuidos</p>
            <p className="text-3xl font-heading font-bold text-amber-400 mt-2">
              {g.total_unassigned.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {g.total_leads > 0 ? `${((g.total_unassigned / g.total_leads) * 100).toFixed(0)}% do total` : '0%'}
            </p>
          </div>
        )}
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Valor em Emendas</p>
          <p className="text-3xl font-heading font-bold text-blue-400 mt-2">
            {formatCompactCurrency(g.total_valor_emenda)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(g.total_valor_emenda)}</p>
        </div>
        {isVendedor && vendedores.length > 0 && (
          <>
            <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Comissão Vendas</p>
              <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
                {formatCompactCurrency(vendedores[0]?.comissao_total || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(vendedores[0]?.comissao_total || 0)}</p>
            </div>
            <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Taxa Fechamento</p>
              <p className="text-3xl font-heading font-bold text-green-400 mt-2">
                {formatCompactCurrency((vendedores[0]?.fechado || 0) * 50)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {vendedores[0]?.fechado || 0} x R$50
              </p>
            </div>
          </>
        )}
      </div>

      {/* 3. Status pipeline horizontal bar */}
      <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Pipeline de Status</p>
        <div className="flex h-10 rounded-lg overflow-hidden">
          {STATUS_ORDER.map(status => {
            const count = g.by_status[status] || 0
            const pct = (count / totalForPipeline) * 100
            if (pct === 0) return null
            const cfg = STATUS_CONFIG[status]
            return (
              <div
                key={status}
                className={`${cfg.bar} flex items-center justify-center transition-all relative group`}
                style={{ width: `${Math.max(pct, 3)}%` }}
              >
                <span className="text-xs font-medium text-white truncate px-2">
                  {cfg.label} {count}
                </span>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  {cfg.label}: {count} ({pct.toFixed(1)}%)
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-2">
          {STATUS_ORDER.map(status => {
            const cfg = STATUS_CONFIG[status]
            const count = g.by_status[status] || 0
            return (
              <div key={status} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <div className={`w-2 h-2 rounded-full ${cfg.bar}`} />
                  {cfg.label}
                </div>
                {isVendedor && status === 'Fechado' && count > 0 && (
                  <div className="text-xs text-green-400 ml-3.5">
                    {count} × R$50 = {formatCurrency(count * 50)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Commission breakdown for vendedor */}
      {isVendedor && data.commission_breakdown && data.commission_breakdown.length > 0 && (
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-heading font-semibold text-white mb-3">
            Detalhamento Comissoes
          </h2>
          <div className="space-y-2">
            {data.commission_breakdown.map(item => {
              const cfg = STATUS_CONFIG[item.status_contato] || STATUS_CONFIG['Nao Contatado']
              return (
                <div key={item.status_contato} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      {item.status_contato}
                    </span>
                    <span className="text-sm text-gray-400">{item.count} leads</span>
                    {item.locked_count > 0 && (
                      <span className="text-xs text-green-500">({item.locked_count} confirmadas)</span>
                    )}
                  </div>
                  <span className="text-base font-semibold text-[#0072F7]">
                    {formatCurrency(item.total_comissao)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700">
            <a href="/comissoes" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              Ver relatorio completo →
            </a>
          </div>
        </div>
      )}

      {/* 4. Per-vendedor cards */}
      {vendedores.length > 0 && !isVendedor && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-white mb-3">
            Desempenho por Vendedor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vendedores.map(v => (
              <div
                key={v.vendedor_id}
                className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5 hover:scale-[1.02] transition-transform"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-white">{v.vendedor_nome}</h3>
                  <span className="text-2xl font-heading font-bold text-blue-400">{v.total_leads}</span>
                </div>

                {/* Status badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { key: 'nao_contatado' as const, status: 'Não Contatado', count: v.nao_contatado },
                    { key: 'retorno' as const, status: 'Retorno', count: v.retorno },
                    { key: 'proposta' as const, status: 'Proposta', count: v.proposta },
                    { key: 'fechado' as const, status: 'Fechado', count: v.fechado },
                  ].map(({ status, count }) => {
                    const cfg = STATUS_CONFIG[status]
                    return (
                      <span key={status} className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}: {count}
                      </span>
                    )
                  })}
                </div>

                {/* Today's activity */}
                {(v.ligacoes_hoje > 0 || v.propostas_hoje > 0 || v.fechados_hoje > 0) && (
                  <div className="flex gap-3 mb-3 text-xs">
                    <span className="text-gray-500">Hoje:</span>
                    {v.ligacoes_hoje > 0 && (
                      <span className="text-amber-400">{v.ligacoes_hoje} ligacoes</span>
                    )}
                    {v.propostas_hoje > 0 && (
                      <span className="text-blue-400">{v.propostas_hoje} propostas</span>
                    )}
                    {v.fechados_hoje > 0 && (
                      <span className="text-green-400">{v.fechados_hoje} fechados</span>
                    )}
                  </div>
                )}

                {/* Valor, commission, and last activity */}
                <div className="space-y-2 pt-3 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">Valor Emendas</span>
                    <span className="text-sm font-semibold text-blue-400">
                      {formatCompactCurrency(v.valor_total_emenda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">Comissão Total</span>
                    <span className="text-lg font-heading font-bold text-[#0072F7]">
                      {formatCurrency(v.comissao_total)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    Ultima atividade {timeAgo(v.last_activity)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Recent activity feed */}
      {recent_activity.length > 0 && (
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-heading font-semibold text-white">Atividade Recente</h2>
            <p className="text-xs text-gray-500">Ultimas atualizacoes de leads</p>
          </div>
          <div className="divide-y divide-gray-800/50">
            {recent_activity.map((a, i) => {
              const cfg = STATUS_CONFIG[a.status_contato] || STATUS_CONFIG['Não Contatado']
              return (
                <div key={`${a.cnpj}-${i}`} className={`px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{a.vendedor_nome}</span>
                    <span className="text-gray-500">atualizou</span>
                    <span className="text-gray-300">{a.nome}</span>
                    <span className="text-gray-600 font-mono text-xs">({formatCNPJ(a.cnpj)})</span>
                    <span className="text-gray-500">para</span>
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      {a.status_contato}
                    </span>
                    <span className="text-gray-600 text-xs ml-auto">{timeAgo(a.updated_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
