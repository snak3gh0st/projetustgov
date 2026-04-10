'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TGOV_STATUS_ORDER, tgovStatusSortKey, APROVACAO_ONLY_ROLES, EXECUCAO_ONLY_ROLES } from '@/lib/tgov'

// ── Types ───────────────────────────────────────────────────────────────────
type PipelineTab = 'aprovacao' | 'execucao' | 'prestacao_contas'
type StatusCounts = Record<string, number>

// Module-level: survives React StrictMode unmount/remount cycles
const _inflight = new Set<PipelineTab>()
const _cache = new Map<PipelineTab, { counts: StatusCounts; total: number }>()

// ── Status visual config ────────────────────────────────────────────────────
const TGOV_STATUS_CONFIG: Record<string, { bar: string; color: string; label: string }> = {
  'Cadastrada':                                { bar: 'bg-gray-400',    color: 'text-gray-600',    label: 'Cadastrada' },
  'Em Análise':                               { bar: 'bg-yellow-500',  color: 'text-yellow-600',  label: 'Em Análise' },
  'Aprovada':                                  { bar: 'bg-green-500',   color: 'text-green-600',   label: 'Aprovada' },
  'Aprovada / Aguardando Assinatura':          { bar: 'bg-green-400',   color: 'text-green-500',   label: 'Aguard. Assinatura' },
  'Aprovada / Aguardando Empenho':             { bar: 'bg-green-400',   color: 'text-green-500',   label: 'Aguard. Empenho' },
  'Aguardando Assinatura do Convenio':         { bar: 'bg-blue-400',    color: 'text-blue-500',    label: 'Assin. Convênio' },
  'Em Execução':                               { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Em Execução' },
  'Em execução':                               { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Em Execução' },
  'Aguardando Prestação de Contas':            { bar: 'bg-orange-500',  color: 'text-orange-600',  label: 'Aguard. PC' },
  'Prestação de Contas enviada para Análise':  { bar: 'bg-orange-400',  color: 'text-orange-500',  label: 'PC enviada' },
  'Prestação de contas enviada para análise':  { bar: 'bg-orange-400',  color: 'text-orange-500',  label: 'PC enviada' },
  'Prestação de Contas em Complementação':     { bar: 'bg-amber-500',   color: 'text-amber-600',   label: 'PC Complementação' },
  'Prestação de Contas em Análise':            { bar: 'bg-amber-400',   color: 'text-amber-500',   label: 'PC em Análise' },
  'Prestação de Contas Comprovada':            { bar: 'bg-teal-500',    color: 'text-teal-600',    label: 'PC Comprovada' },
  'Prestação de Contas Aprovada':              { bar: 'bg-teal-500',    color: 'text-teal-700',    label: 'PC Aprovada' },
  'Prestação de Contas Concluída':             { bar: 'bg-teal-600',    color: 'text-teal-700',    label: 'PC Concluída' },
  'Prestação de Contas Rejeitada':             { bar: 'bg-red-500',     color: 'text-red-600',     label: 'PC Rejeitada' },
}
const DEFAULT_CONFIG = { bar: 'bg-gray-300', color: 'text-gray-500', label: '' }

// ── Tab config ──────────────────────────────────────────────────────────────
const TAB_LABELS: Record<PipelineTab, string> = {
  aprovacao: 'Aprovação',
  execucao: 'Execução',
  prestacao_contas: 'Prestação de Contas',
}

function getApiUrl(tab: PipelineTab): string {
  return `/api/tgov/pipeline?tab=${tab}`
}

function getDashboardUrl(tab: PipelineTab, situacao: string): string {
  const s = encodeURIComponent(situacao)
  if (tab === 'aprovacao') return `/tgov?status=${s}`
  if (tab === 'execucao') return `/tgov?tab=execucao&status=${s}`
  return `/tgov?tab=prestacao_contas&status=${s}`
}

function getVisibleTabs(userRole: string): PipelineTab[] {
  const isAprovacaoOnly = (APROVACAO_ONLY_ROLES as readonly string[]).includes(userRole)
  const isExecucaoOnly = (EXECUCAO_ONLY_ROLES as readonly string[]).includes(userRole)
  if (isAprovacaoOnly) return ['aprovacao']
  if (isExecucaoOnly) return ['execucao', 'prestacao_contas']
  return ['aprovacao', 'execucao', 'prestacao_contas']
}

function getCfg(situacao: string) {
  return TGOV_STATUS_CONFIG[situacao] ?? { ...DEFAULT_CONFIG, label: situacao }
}

// ── Pipeline Section (matches CRM PipelineSection layout) ───────────────────
function PipelineSection({
  title,
  subtitle,
  total,
  counts,
  tab,
  onCardClick,
}: {
  title: string
  subtitle: string
  total: number
  counts: StatusCounts
  tab: PipelineTab
  onCardClick: (situacao: string) => void
}) {
  const knownStatuses = Object.keys(TGOV_STATUS_ORDER)
  const allStatuses = Array.from(new Set([...knownStatuses, ...Object.keys(counts)]))
  const orderedStatuses = allStatuses
    .filter(s => (counts[s] ?? 0) > 0)
    .sort((a, b) => tgovStatusSortKey(a) - tgovStatusSortKey(b))

  if (orderedStatuses.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="text-sm text-gray-400">Nenhuma proposta encontrada.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
        <p className="text-xs text-gray-400">{total.toLocaleString('pt-BR')} propostas</p>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${orderedStatuses.length > 6 ? 'md:grid-cols-3 xl:grid-cols-9' : 'md:grid-cols-6'}`}>
        {orderedStatuses.map((situacao, idx) => {
          const count = counts[situacao] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          const cfg = getCfg(situacao)
          const prevCount = idx > 0 ? (counts[orderedStatuses[idx - 1]] ?? 0) : null
          const conversionRate = prevCount && prevCount > 0 ? ((count / prevCount) * 100).toFixed(0) : null

          return (
            <div
              key={`${tab}-${situacao}`}
              role="button"
              onClick={() => onCardClick(situacao)}
              className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className={`h-1.5 ${cfg.bar}`} />
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-3xl font-bold ${cfg.color}`}>{count.toLocaleString('pt-BR')}</span>
                  <span className="text-xs text-gray-400 font-medium">{pct.toFixed(0)}%</span>
                </div>

                <p className="text-sm font-medium text-gray-700 mt-1">{cfg.label}</p>

                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cfg.bar} rounded-full transition-all`}
                    style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
                  />
                </div>

                {conversionRate && Number(conversionRate) <= 100 && (
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {conversionRate}% de {getCfg(orderedStatuses[idx - 1]).label}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Flow diagram — matches CRM horizontal arrow strip */}
      <div className="hidden md:flex items-center justify-center gap-1 py-1">
        {orderedStatuses.map((situacao, idx) => {
          const cfg = getCfg(situacao)
          return (
            <div key={`flow-${tab}-${situacao}`} className="flex items-center gap-1 flex-1">
              <div className={`h-2 ${cfg.bar} rounded-full flex-1 transition-all opacity-80`} style={{ minWidth: '8px' }} />
              {idx < orderedStatuses.length - 1 && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 flex-shrink-0">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function TGovPipelineClient({ userRole }: { userRole: string }) {
  const router = useRouter()
  const visibleTabs = getVisibleTabs(userRole)
  const [activeTab, setActiveTab] = useState<PipelineTab>(visibleTabs[0])
  const [tabData, setTabData] = useState<Record<PipelineTab, { counts: StatusCounts; total: number; loaded: boolean; error: string | null }>>(() => ({
    aprovacao:        _cache.has('aprovacao')        ? { ..._cache.get('aprovacao')!,        loaded: true,  error: null } : { counts: {}, total: 0, loaded: false, error: null },
    execucao:         _cache.has('execucao')         ? { ..._cache.get('execucao')!,         loaded: true,  error: null } : { counts: {}, total: 0, loaded: false, error: null },
    prestacao_contas: _cache.has('prestacao_contas') ? { ..._cache.get('prestacao_contas')!, loaded: true,  error: null } : { counts: {}, total: 0, loaded: false, error: null },
  }))

  const loadTab = useCallback(async (tab: PipelineTab) => {
    if (tabData[tab].loaded || _inflight.has(tab)) return
    _inflight.add(tab)
    try {
      const res = await fetch(getApiUrl(tab))
      if (!res.ok) throw new Error('Falha ao carregar dados')
      const data = await res.json()
      const statusMap: StatusCounts = {}
      let tot = 0
      ;(data.byStatus ?? []).forEach((b: { status: string; count: number }) => {
        statusMap[b.status] = b.count
        tot += b.count
      })
      _cache.set(tab, { counts: statusMap, total: tot })
      setTabData(prev => ({
        ...prev,
        [tab]: { counts: statusMap, total: tot, loaded: true, error: null },
      }))
    } catch (e) {
      setTabData(prev => ({
        ...prev,
        [tab]: { ...prev[tab], loaded: true, error: e instanceof Error ? e.message : 'Erro' },
      }))
    } finally {
      _inflight.delete(tab)
    }
  }, [tabData])

  useEffect(() => {
    loadTab(activeTab)
  }, [activeTab, loadTab])

  const current = tabData[activeTab]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">TGov Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Clique numa situação para filtrar no dashboard
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {visibleTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-white border border-b-white border-gray-200 -mb-px text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Content */}
        {!current.loaded ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm text-gray-500">Carregando pipeline...</div>
          </div>
        ) : current.error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm text-red-500">{current.error}</div>
          </div>
        ) : (
          <PipelineSection
            title={TAB_LABELS[activeTab]}
            subtitle={`Propostas por situação`}
            total={current.total}
            counts={current.counts}
            tab={activeTab}
            onCardClick={situacao => router.push(getDashboardUrl(activeTab, situacao))}
          />
        )}
      </div>
    </div>
  )
}
