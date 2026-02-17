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

interface ContactHealth {
  stale_count: number
  never_contacted_count: number
  invalid_phone_count: number
}

interface StaleLead {
  cnpj: string
  nome: string
  vendedor_nome: string
  status_contato: string
  last_contact_date: string | null
  days_since_last_contact: number | null
  principal_telefone_status: string | null
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
  contact_health?: ContactHealth
  stale_leads?: StaleLead[]
}

// --- Status config ---
const STATUS_CONFIG: Record<string, { color: string; bg: string; bar: string; label: string }> = {
  'Não Contatado': { color: 'text-red-600', bg: 'bg-red-50 border-red-200', bar: 'bg-red-500', label: 'Não Contatado' },
  'Retorno': { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bar: 'bg-amber-500', label: 'Retorno' },
  'Proposta': { color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', bar: 'bg-blue-500', label: 'Proposta' },
  'Fechado': { color: 'text-green-600', bg: 'bg-green-50 border-green-200', bar: 'bg-green-500', label: 'Fechado' },
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
          <div className="h-8 w-96 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-16 bg-white border border-gray-200 shadow-sm rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Erro ao carregar dashboard CRM
      </div>
    )
  }

  const { global: g, vendedores, recent_activity, role } = data
  const isVendedor = role === 'vendedor' || role === 'gestor_vendedor'
  const totalForPipeline = Object.values(g.by_status).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 1. Page header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">
          {isVendedor ? 'Meu Pipeline — Campanha Emendas 2026' : 'Dashboard CRM — Campanha Emendas 2026'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isVendedor ? 'Seus leads e desempenho pessoal' : 'Visao administrativa do trabalho da equipe de vendas'}
        </p>
      </div>

      {/* 2. Global stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Leads</p>
          <p className="text-3xl font-heading font-bold text-gray-900 mt-2">
            {g.total_leads.toLocaleString('pt-BR')}
          </p>
        </div>
        {!isVendedor && (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Atribuidos</p>
            <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
              {g.total_assigned.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {g.total_leads > 0 ? `${((g.total_assigned / g.total_leads) * 100).toFixed(0)}% do total` : '0%'}
            </p>
          </div>
        )}
        {!isVendedor && (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Nao Atribuidos</p>
            <p className="text-3xl font-heading font-bold text-amber-600 mt-2">
              {g.total_unassigned.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {g.total_leads > 0 ? `${((g.total_unassigned / g.total_leads) * 100).toFixed(0)}% do total` : '0%'}
            </p>
          </div>
        )}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Valor em Emendas</p>
          <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
            {formatCompactCurrency(g.total_valor_emenda)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(g.total_valor_emenda)}</p>
        </div>
        {isVendedor && vendedores.length > 0 && (
          <>
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Comissão Vendas</p>
              <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
                {formatCompactCurrency(vendedores[0]?.comissao_total || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{formatCurrency(vendedores[0]?.comissao_total || 0)}</p>
            </div>
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Taxa Fechamento</p>
              <p className="text-3xl font-heading font-bold text-green-600 mt-2">
                {formatCompactCurrency((vendedores[0]?.fechado || 0) * 50)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {vendedores[0]?.fechado || 0} x R$50
              </p>
            </div>
          </>
        )}
      </div>

      {/* 3. Status pipeline horizontal bar */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Pipeline de Status</p>
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
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className={`w-2 h-2 rounded-full ${cfg.bar}`} />
                  {cfg.label}
                </div>
                {isVendedor && status === 'Fechado' && count > 0 && (
                  <div className="text-xs text-green-600 ml-3.5">
                    {count} × R$50 = {formatCurrency(count * 50)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 3b. Contact health alerts */}
      {data.contact_health && (data.contact_health.stale_count > 0 || data.contact_health.invalid_phone_count > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-red-200 shadow-sm rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-red-600">{data.contact_health.stale_count}</p>
              <p className="text-xs text-gray-500">Leads sem contato ha +7 dias</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                <line x1="1" y1="1" x2="23" y2="23" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-gray-600">{data.contact_health.never_contacted_count}</p>
              <p className="text-xs text-gray-500">Nunca contatados</p>
            </div>
          </div>
          {data.contact_health.invalid_phone_count > 0 && (
            <div className="bg-white border border-amber-200 shadow-sm rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-amber-600">{data.contact_health.invalid_phone_count}</p>
                <p className="text-xs text-gray-500">Telefone invalido (principal)</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3c. Stale leads needing follow-up */}
      {data.stale_leads && data.stale_leads.length > 0 && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-heading font-semibold text-gray-900">Leads Precisando de Atencao</h2>
            <p className="text-xs text-gray-400">Leads com mais tempo sem contato (exceto Fechados)</p>
          </div>
          <div className="divide-y divide-gray-200">
            {data.stale_leads.map((lead, i) => {
              const cfg = STATUS_CONFIG[lead.status_contato] || STATUS_CONFIG['Não Contatado']
              const daysLabel = lead.days_since_last_contact == null
                ? { text: 'Nunca', cls: 'bg-gray-100 text-gray-500' }
                : lead.days_since_last_contact <= 2
                ? { text: `${lead.days_since_last_contact}d`, cls: 'bg-green-100 text-green-700' }
                : lead.days_since_last_contact <= 7
                ? { text: `${lead.days_since_last_contact}d`, cls: 'bg-amber-100 text-amber-700' }
                : { text: `${lead.days_since_last_contact}d`, cls: 'bg-red-100 text-red-700' }
              const phoneIcon = lead.principal_telefone_status === 'invalido'
                ? 'bg-red-500'
                : lead.principal_telefone_status === 'nao_atende'
                ? 'bg-amber-500'
                : lead.principal_telefone_status === 'valido'
                ? 'bg-green-500'
                : null
              return (
                <a
                  key={lead.cnpj}
                  href={`/lead/${encodeURIComponent(lead.cnpj)}`}
                  className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${daysLabel.cls}`}>
                    {daysLabel.text}
                  </span>
                  {phoneIcon && (
                    <span className={`w-2 h-2 rounded-full ${phoneIcon} flex-shrink-0`} />
                  )}
                  <span className="text-sm text-gray-900 font-medium truncate flex-1">{lead.nome || lead.cnpj}</span>
                  <span className="text-xs text-gray-400 hidden sm:block">{lead.vendedor_nome}</span>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
                    {lead.status_contato}
                  </span>
                </a>
              )
            })}
          </div>
          <div className="p-3 border-t border-gray-200 text-center">
            <a href="/leads" className="text-sm text-[#0072F7] hover:text-blue-800 transition-colors">
              Ver todos os leads →
            </a>
          </div>
        </div>
      )}

      {/* Commission breakdown for vendedor */}
      {isVendedor && data.commission_breakdown && data.commission_breakdown.length > 0 && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5">
          <h2 className="text-lg font-heading font-semibold text-gray-900 mb-3">
            Detalhamento Comissoes
          </h2>
          <div className="space-y-2">
            {data.commission_breakdown.map(item => {
              const cfg = STATUS_CONFIG[item.status_contato] || STATUS_CONFIG['Nao Contatado']
              return (
                <div key={item.status_contato} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      {item.status_contato}
                    </span>
                    <span className="text-sm text-gray-500">{item.count} leads</span>
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
          <div className="mt-3 pt-3 border-t border-gray-200">
            <a href="/comissoes" className="text-sm text-[#0072F7] hover:text-blue-800 transition-colors">
              Ver relatorio completo →
            </a>
          </div>
        </div>
      )}

      {/* 4. Per-vendedor cards */}
      {vendedores.length > 0 && !isVendedor && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 mb-3">
            Desempenho por Vendedor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vendedores.map(v => (
              <div
                key={v.vendedor_id}
                className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 hover:scale-[1.02] transition-transform"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-gray-900">{v.vendedor_nome}</h3>
                  <span className="text-2xl font-heading font-bold text-[#0072F7]">{v.total_leads}</span>
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
                    <span className="text-gray-400">Hoje:</span>
                    {v.ligacoes_hoje > 0 && (
                      <span className="text-amber-600">{v.ligacoes_hoje} ligacoes</span>
                    )}
                    {v.propostas_hoje > 0 && (
                      <span className="text-[#0072F7]">{v.propostas_hoje} propostas</span>
                    )}
                    {v.fechados_hoje > 0 && (
                      <span className="text-green-600">{v.fechados_hoje} fechados</span>
                    )}
                  </div>
                )}

                {/* Valor, commission, and last activity */}
                <div className="space-y-2 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Valor Emendas</span>
                    <span className="text-sm font-semibold text-[#0072F7]">
                      {formatCompactCurrency(v.valor_total_emenda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Comissão Total</span>
                    <span className="text-lg font-heading font-bold text-[#0072F7]">
                      {formatCurrency(v.comissao_total)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 text-right">
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
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-heading font-semibold text-gray-900">Atividade Recente</h2>
            <p className="text-xs text-gray-400">Ultimas atualizacoes de leads</p>
          </div>
          <div className="divide-y divide-gray-200">
            {recent_activity.map((a, i) => {
              const cfg = STATUS_CONFIG[a.status_contato] || STATUS_CONFIG['Não Contatado']
              return (
                <div key={`${a.cnpj}-${i}`} className={`px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-900 font-medium">{a.vendedor_nome}</span>
                    <span className="text-gray-400">atualizou</span>
                    <span className="text-gray-700">{a.nome}</span>
                    <span className="text-gray-400 font-mono text-xs">({formatCNPJ(a.cnpj)})</span>
                    <span className="text-gray-400">para</span>
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      {a.status_contato}
                    </span>
                    <span className="text-gray-400 text-xs ml-auto">{timeAgo(a.updated_at)}</span>
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
