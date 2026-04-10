'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { TGOV_STATUS_ORDER, tgovStatusSortKey, APROVACAO_ONLY_ROLES, EXECUCAO_ONLY_ROLES } from '@/lib/tgov'

const TGOV_PIPELINE_CONFIG: Record<string, { bar: string; color: string }> = {
  'Cadastrada':                                          { bar: 'bg-gray-300',    color: 'text-gray-500'   },
  'Em Análise':                                         { bar: 'bg-yellow-400',  color: 'text-yellow-600' },
  'Aprovada':                                           { bar: 'bg-green-400',   color: 'text-green-600'  },
  'Aprovada / Aguardando Assinatura':                   { bar: 'bg-green-300',   color: 'text-green-500'  },
  'Aprovada / Aguardando Empenho':                      { bar: 'bg-green-300',   color: 'text-green-500'  },
  'Aguardando Assinatura do Convenio':                  { bar: 'bg-blue-300',    color: 'text-blue-500'   },
  'Em Execução':                                        { bar: 'bg-blue-500',    color: 'text-blue-700'   },
  'Em execução':                                        { bar: 'bg-blue-500',    color: 'text-blue-700'   },
  'Aguardando Prestação de Contas':                     { bar: 'bg-orange-400',  color: 'text-orange-600' },
  'Prestação de Contas enviada para Análise':           { bar: 'bg-orange-300',  color: 'text-orange-500' },
  'Prestação de contas enviada para análise':           { bar: 'bg-orange-300',  color: 'text-orange-500' },
  'Prestação de Contas em Complementação':              { bar: 'bg-amber-400',   color: 'text-amber-600'  },
  'Prestação de Contas em Análise':                     { bar: 'bg-amber-300',   color: 'text-amber-500'  },
  'Prestação de Contas Comprovada':                     { bar: 'bg-teal-400',    color: 'text-teal-600'   },
  'Prestação de Contas Aprovada':                       { bar: 'bg-teal-500',    color: 'text-teal-700'   },
  'Prestação de Contas Concluída':                      { bar: 'bg-teal-500',    color: 'text-teal-700'   },
  'Prestação de Contas Rejeitada':                      { bar: 'bg-red-400',     color: 'text-red-600'    },
}
const DEFAULT_CONFIG = { bar: 'bg-gray-200', color: 'text-gray-500' }

type PipelineTab = 'aprovacao' | 'execucao' | 'prestacao_contas'
type StatusCounts = Record<string, number>

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

function KanbanGrid({
  counts,
  total,
  tab,
  onCardClick,
}: {
  counts: StatusCounts
  total: number
  tab: PipelineTab
  onCardClick: (situacao: string) => void
}) {
  const knownStatuses = Object.keys(TGOV_STATUS_ORDER)
  const allStatuses = Array.from(new Set([...knownStatuses, ...Object.keys(counts)]))
  const orderedStatuses = allStatuses
    .filter(s => (counts[s] ?? 0) > 0)
    .sort((a, b) => tgovStatusSortKey(a) - tgovStatusSortKey(b))

  if (orderedStatuses.length === 0) {
    return <div className="text-sm text-gray-400">Nenhuma proposta encontrada.</div>
  }

  const gridCols = orderedStatuses.length > 6
    ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
    : 'grid-cols-2 md:grid-cols-3'

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {orderedStatuses.map((situacao, idx) => {
        const cnt = counts[situacao] ?? 0
        const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0'
        const pctNum = total > 0 ? (cnt / total) * 100 : 0
        const cfg = TGOV_PIPELINE_CONFIG[situacao] ?? DEFAULT_CONFIG
        const prevSituacao = idx > 0 ? orderedStatuses[idx - 1] : null
        const prevCnt = prevSituacao ? (counts[prevSituacao] ?? 0) : null
        const conversionRate = prevCnt && prevCnt > 0
          ? `${((cnt / prevCnt) * 100).toFixed(0)}% de ${prevSituacao}`
          : null

        return (
          <div
            key={`${tab}-${situacao}`}
            onClick={() => onCardClick(situacao)}
            className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden hover:shadow-md cursor-pointer transition-shadow"
          >
            <div className={`h-1.5 ${cfg.bar}`} />
            <div className="p-4">
              <div className={`text-3xl font-bold ${cfg.color}`}>
                {cnt.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{pct}% do total</div>
              <div className="text-sm font-medium text-gray-700 mt-2 leading-tight">{situacao}</div>
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${pctNum}%` }} />
              </div>
              {conversionRate && (
                <div className="text-[10px] text-gray-400 mt-1.5 truncate">{conversionRate}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TGovPipelineClient({ userRole }: { userRole: string }) {
  const router = useRouter()
  const visibleTabs = getVisibleTabs(userRole)
  const [activeTab, setActiveTab] = useState<PipelineTab>(visibleTabs[0])
  const [tabData, setTabData] = useState<Record<PipelineTab, { counts: StatusCounts; total: number; loaded: boolean; error: string | null }>>({
    aprovacao:        { counts: {}, total: 0, loaded: false, error: null },
    execucao:         { counts: {}, total: 0, loaded: false, error: null },
    prestacao_contas: { counts: {}, total: 0, loaded: false, error: null },
  })
  const inFlightRef = useRef<Set<PipelineTab>>(new Set())

  const loadTab = useCallback(async (tab: PipelineTab) => {
    if (tabData[tab].loaded || inFlightRef.current.has(tab)) return
    inFlightRef.current.add(tab)
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
      inFlightRef.current.delete(tab)
    }
  }, [tabData])

  useEffect(() => {
    loadTab(activeTab)
  }, [activeTab, loadTab])

  const current = tabData[activeTab]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">TGov Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {current.loaded && !current.error
              ? `${current.total.toLocaleString('pt-BR')} propostas · clique numa situação para filtrar`
              : 'Carregando...'}
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
          <KanbanGrid
            counts={current.counts}
            total={current.total}
            tab={activeTab}
            onCardClick={situacao => router.push(getDashboardUrl(activeTab, situacao))}
          />
        )}
      </div>
    </div>
  )
}
