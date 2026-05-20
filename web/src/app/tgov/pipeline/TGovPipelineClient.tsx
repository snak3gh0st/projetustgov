'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TGOV_STATUS_ORDER, tgovStatusSortKey, APROVACAO_ONLY_ROLES, EXECUCAO_ONLY_ROLES, PRESTACAO_ONLY_ROLES } from '@/lib/tgov'

// ── Types ───────────────────────────────────────────────────────────────────
type PipelineTab = 'aprovacao' | 'execucao' | 'prestacao_contas'
type StatusCounts = Record<string, number>

// Module-level: survives React StrictMode unmount/remount cycles
const _inflight = new Set<PipelineTab>()
const _cache = new Map<PipelineTab, { counts: StatusCounts; total: number }>()

// ── Status visual config ────────────────────────────────────────────────────
// Short labels + colors for each situação returned by TransfereGov API.
// Keys must match exactly the situacao string from the database.
const STATUS_CFG: Record<string, { bar: string; color: string; label: string }> = {
  // ── Aprovação stage (from /api/tgov/pipeline?tab=aprovacao) ──
  'Proposta/Plano de Trabalho Cadastrados':                                    { bar: 'bg-slate-400',   color: 'text-slate-600',   label: 'Cadastrados' },
  'Proposta/Plano de Trabalho em Análise':                                     { bar: 'bg-yellow-500',  color: 'text-yellow-700',  label: 'Em Análise' },
  'Proposta/Plano de Trabalho em Complementação':                              { bar: 'bg-amber-500',   color: 'text-amber-700',   label: 'Em Complementação' },
  'Proposta/Plano de Trabalho Enviado para Análise':                           { bar: 'bg-orange-500',  color: 'text-orange-700',  label: 'Enviado p/ Análise' },
  'Proposta/Plano de Trabalho Complementado em Análise':                       { bar: 'bg-sky-500',     color: 'text-sky-700',     label: 'Compl. em Análise' },
  'Proposta/Plano de Trabalho Complementado Enviado para Análise':             { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Compl. Enviado' },
  'Proposta/Plano de Trabalho Aprovados':                                      { bar: 'bg-green-500',   color: 'text-green-700',   label: 'Aprovados' },
  'Proposta/Plano de Trabalho Rejeitados':                                     { bar: 'bg-red-500',     color: 'text-red-700',     label: 'Rejeitados' },
  'Proposta/Plano de Trabalho Rejeitados por Impedimento técnico':             { bar: 'bg-red-700',     color: 'text-red-800',     label: 'Rejeit. Impedimento' },
  'Proposta Aprovada e Plano de Trabalho em Análise':                          { bar: 'bg-indigo-500',  color: 'text-indigo-700',  label: 'Aprov. em Análise' },
  'Proposta Aprovada e Plano de Trabalho em Complementação':                   { bar: 'bg-violet-500',  color: 'text-violet-700',  label: 'Aprov. em Compl.' },
  'Proposta Aprovada e Plano de Trabalho Complementado Enviado para Análise':  { bar: 'bg-purple-500',  color: 'text-purple-700',  label: 'Aprov. Compl. Env.' },
  'Proposta Aprovada e Plano de Trabalho Complementado em Análise':            { bar: 'bg-purple-400',  color: 'text-purple-600',  label: 'Aprov. Compl. Análise' },
  'Proposta Aprovada/Aguardando Plano de Trabalho':                            { bar: 'bg-lime-500',    color: 'text-lime-700',    label: 'Aprov. Aguard. PT' },
  'Proposta Eliminada em Chamamento Público':                                  { bar: 'bg-rose-500',    color: 'text-rose-700',    label: 'Eliminada CP' },
  // Análise preliminar
  'Enviada para Análise Preliminar':           { bar: 'bg-yellow-400',  color: 'text-yellow-600',  label: 'Análise Preliminar' },
  'Classificada em Análise Preliminar':        { bar: 'bg-teal-400',    color: 'text-teal-600',    label: 'Class. Preliminar' },
  'Eliminada em Análise Preliminar':           { bar: 'bg-rose-400',    color: 'text-rose-600',    label: 'Elim. Preliminar' },
  // Generic aprovação (older/misc format)
  'Cadastrada':                                { bar: 'bg-slate-400',   color: 'text-slate-600',   label: 'Cadastrada' },
  'Em Análise':                               { bar: 'bg-yellow-500',  color: 'text-yellow-700',  label: 'Em Análise' },
  'Aprovada':                                  { bar: 'bg-green-500',   color: 'text-green-600',   label: 'Aprovada' },
  'Aprovado':                                  { bar: 'bg-green-500',   color: 'text-green-600',   label: 'Aprovado' },
  'Aprovada / Aguardando Assinatura':          { bar: 'bg-green-400',   color: 'text-green-600',   label: 'Aguard. Assinatura' },
  'Aprovada / Aguardando Empenho':             { bar: 'bg-green-400',   color: 'text-green-600',   label: 'Aguard. Empenho' },
  'Aguardando Assinatura do Convenio':         { bar: 'bg-blue-400',    color: 'text-blue-600',    label: 'Assin. Convênio' },
  'Regularizada':                              { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Regularizada' },
  'Cancelado':                                 { bar: 'bg-gray-500',    color: 'text-gray-700',    label: 'Cancelado' },
  'Inadimplente':                              { bar: 'bg-red-600',     color: 'text-red-800',     label: 'Inadimplente' },
  // ── Execução stage ──
  'Em Execução':                               { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Em Execução' },
  'Em execução':                               { bar: 'bg-blue-500',    color: 'text-blue-700',    label: 'Em Execução' },
  // ── Prestação de Contas stage ──
  'Aguardando Prestação de Contas':            { bar: 'bg-orange-500',  color: 'text-orange-700',  label: 'Aguard. PC' },
  'Prestação de Contas enviada para Análise':  { bar: 'bg-orange-400',  color: 'text-orange-600',  label: 'PC Enviada' },
  'Prestação de contas enviada para análise':  { bar: 'bg-orange-400',  color: 'text-orange-600',  label: 'PC Enviada' },
  'Prestação de Contas em Complementação':     { bar: 'bg-amber-500',   color: 'text-amber-700',   label: 'PC Complementação' },
  'Prestação de Contas em Análise':            { bar: 'bg-amber-400',   color: 'text-amber-600',   label: 'PC em Análise' },
  'Prestação de Contas Comprovada':            { bar: 'bg-teal-500',    color: 'text-teal-700',    label: 'PC Comprovada' },
  'Prestação de Contas Comprovada em Análise': { bar: 'bg-teal-400',    color: 'text-teal-600',    label: 'PC Comprov. Análise' },
  'Prestação de Contas Aprovada':              { bar: 'bg-teal-600',    color: 'text-teal-700',    label: 'PC Aprovada' },
  'Prestação de Contas Aprovada com Ressalvas':{ bar: 'bg-teal-300',    color: 'text-teal-600',    label: 'PC Aprov. Ressalvas' },
  'Prestação de Contas Concluída':             { bar: 'bg-emerald-600', color: 'text-emerald-700', label: 'PC Concluída' },
  'Prestação de Contas Rejeitada':             { bar: 'bg-red-500',     color: 'text-red-600',     label: 'PC Rejeitada' },
  'Prestação de Contas Iniciada Por Antecipação': { bar: 'bg-orange-300', color: 'text-orange-600', label: 'PC Antecipada' },
}

function getCfg(situacao: string) {
  return STATUS_CFG[situacao] ?? { bar: 'bg-gray-400', color: 'text-gray-600', label: situacao.replace(/Proposta\/Plano de Trabalho\s*/i, '').replace(/Proposta Aprovada e Plano de Trabalho\s*/i, 'Aprov. ') }
}

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
  if (tab === 'aprovacao') return `/tgov?view=dashboard&status=${s}`
  if (tab === 'execucao') return `/tgov?view=dashboard&tab=execucao&status=${s}`
  return `/tgov?view=dashboard&tab=prestacao_contas&status=${s}`
}

function getVisibleTabs(userRole: string): PipelineTab[] {
  const isAprovacaoOnly = (APROVACAO_ONLY_ROLES as readonly string[]).includes(userRole)
  const isExecucaoOnly = (EXECUCAO_ONLY_ROLES as readonly string[]).includes(userRole)
  const isPrestacaoOnly = (PRESTACAO_ONLY_ROLES as readonly string[]).includes(userRole)
  if (isAprovacaoOnly) return ['aprovacao']
  if (isExecucaoOnly) return ['execucao']
  if (isPrestacaoOnly) return ['prestacao_contas']
  return ['aprovacao', 'execucao', 'prestacao_contas']
}

// ── Pipeline Section ────────────────────────────────────────────────────────
function PipelineSection({
  title,
  total,
  counts,
  tab,
  onCardClick,
}: {
  title: string
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
        <SectionHeader title={title} total={0} />
        <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Nenhuma proposta encontrada.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={title} total={total} />

      {/* Cards — max 5 cols to keep labels readable */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {orderedStatuses.map((situacao, idx) => {
          const count = counts[situacao] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          const cfg = getCfg(situacao)
          const prevCount = idx > 0 ? (counts[orderedStatuses[idx - 1]] ?? 0) : null
          const convRate = prevCount && prevCount > 0 ? ((count / prevCount) * 100).toFixed(0) : null

          return (
            <div
              key={`${tab}-${situacao}`}
              role="button"
              tabIndex={0}
              onClick={() => onCardClick(situacao)}
              onKeyDown={e => e.key === 'Enter' && onCardClick(situacao)}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden hover:shadow-md hover:border-gray-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <div className={`h-1.5 ${cfg.bar}`} />
              <div className="p-4">
                {/* Count + percentage */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${cfg.color}`}>
                    {count.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">
                    {pct.toFixed(0)}%
                  </span>
                </div>

                {/* Short label */}
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1.5 leading-snug">
                  {cfg.label}
                </p>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cfg.bar} rounded-full transition-all`}
                    style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
                  />
                </div>

                {/* Conversion rate (short label) */}
                {convRate && Number(convRate) <= 200 && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 truncate">
                    {convRate}% de {getCfg(orderedStatuses[idx - 1]).label}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Flow diagram — horizontal arrow strip */}
      <div className="hidden md:flex items-center justify-center gap-1 py-1">
        {orderedStatuses.map((situacao, idx) => {
          const cfg = getCfg(situacao)
          return (
            <div key={`flow-${tab}-${situacao}`} className="flex items-center gap-1 flex-1">
              <div
                className={`h-2 ${cfg.bar} rounded-full flex-1 transition-all opacity-80`}
                style={{ minWidth: '8px' }}
              />
              {idx < orderedStatuses.length - 1 && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 dark:text-gray-600 flex-shrink-0">
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

function SectionHeader({ title, total }: { title: string; total: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">{title}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">Propostas por situação</p>
      {total > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{total.toLocaleString('pt-BR')} propostas</p>
      )}
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">TGov Pipeline</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Clique numa situação para filtrar no dashboard
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {visibleTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-900 border border-b-white dark:border-b-gray-900 border-gray-200 dark:border-gray-700 -mb-px text-blue-600'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Content */}
        {!current.loaded ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm text-gray-500 dark:text-gray-400">Carregando pipeline...</div>
          </div>
        ) : current.error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm text-red-500">{current.error}</div>
          </div>
        ) : (
          <PipelineSection
            title={TAB_LABELS[activeTab]}
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
