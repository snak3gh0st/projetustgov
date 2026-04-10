'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TGOV_STATUS_ORDER, tgovStatusSortKey } from '@/lib/tgov'

// Color config for each situação — maps to the bar and text colors
// Derived from SituacaoBadge colorMap in TGovDashboardClient.tsx
const TGOV_PIPELINE_CONFIG: Record<string, { bar: string; color: string; bg: string }> = {
  'Cadastrada':                                          { bar: 'bg-gray-300',    color: 'text-gray-500',   bg: 'bg-gray-50' },
  'Em Análise':                                         { bar: 'bg-yellow-400',  color: 'text-yellow-600', bg: 'bg-yellow-50' },
  'Aprovada':                                           { bar: 'bg-green-400',   color: 'text-green-600',  bg: 'bg-green-50' },
  'Aprovada / Aguardando Assinatura':                   { bar: 'bg-green-300',   color: 'text-green-500',  bg: 'bg-green-50' },
  'Aprovada / Aguardando Empenho':                      { bar: 'bg-green-300',   color: 'text-green-500',  bg: 'bg-green-50' },
  'Aguardando Assinatura do Convenio':                  { bar: 'bg-blue-300',    color: 'text-blue-500',   bg: 'bg-blue-50' },
  'Em Execução':                                        { bar: 'bg-blue-500',    color: 'text-blue-700',   bg: 'bg-blue-50' },
  'Em execução':                                        { bar: 'bg-blue-500',    color: 'text-blue-700',   bg: 'bg-blue-50' },
  'Aguardando Prestação de Contas':                     { bar: 'bg-orange-400',  color: 'text-orange-600', bg: 'bg-orange-50' },
  'Prestação de Contas enviada para Análise':           { bar: 'bg-orange-300',  color: 'text-orange-500', bg: 'bg-orange-50' },
  'Prestação de contas enviada para análise':           { bar: 'bg-orange-300',  color: 'text-orange-500', bg: 'bg-orange-50' },
  'Prestação de Contas em Complementação':              { bar: 'bg-amber-400',   color: 'text-amber-600',  bg: 'bg-amber-50' },
  'Prestação de Contas em Análise':                     { bar: 'bg-amber-300',   color: 'text-amber-500',  bg: 'bg-amber-50' },
  'Prestação de Contas Comprovada':                     { bar: 'bg-teal-400',    color: 'text-teal-600',   bg: 'bg-teal-50' },
  'Prestação de Contas Aprovada':                       { bar: 'bg-teal-500',    color: 'text-teal-700',   bg: 'bg-teal-50' },
  'Prestação de Contas Concluída':                      { bar: 'bg-teal-500',    color: 'text-teal-700',   bg: 'bg-teal-50' },
  'Prestação de Contas Rejeitada':                      { bar: 'bg-red-400',     color: 'text-red-600',    bg: 'bg-red-50' },
}
const DEFAULT_CONFIG = { bar: 'bg-gray-200', color: 'text-gray-500', bg: 'bg-gray-50' }

type StatusCounts = Record<string, number>

export default function TGovPipelineClient({ userRole }: { userRole: string }) {
  const router = useRouter()
  const [counts, setCounts] = useState<StatusCounts>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        // Fetch just the byStatus aggregate — page_size=1 minimizes table data
        const res = await fetch('/api/tgov/aprovacao?page=1&page_size=1')
        if (!res.ok) throw new Error('Falha ao carregar dados')
        const data = await res.json()
        const statusMap: StatusCounts = {}
        let tot = 0
        ;(data.byStatus ?? []).forEach((b: { status: string; count: number }) => {
          statusMap[b.status] = b.count
          tot += b.count
        })
        setCounts(statusMap)
        setTotal(tot)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Build ordered list of situações that have at least 1 proposta
  // TGOV_STATUS_ORDER is Record<string, number> — use Object.keys to get the status list
  const knownStatuses = Object.keys(TGOV_STATUS_ORDER)
  // Also include any statuses returned from API that aren't in the known list
  const allStatuses = Array.from(new Set([...knownStatuses, ...Object.keys(counts)]))
  const orderedStatuses = allStatuses
    .filter(s => (counts[s] ?? 0) > 0)
    .sort((a, b) => tgovStatusSortKey(a) - tgovStatusSortKey(b))

  const gridCols = orderedStatuses.length > 6
    ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
    : 'grid-cols-2 md:grid-cols-3'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-500">Carregando pipeline...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    )
  }

  // Suppress unused variable warning — userRole may be used in future for role-specific UI
  void userRole

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">TGov Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString('pt-BR')} propostas · clique numa situação para filtrar
          </p>
        </div>

        {orderedStatuses.length === 0 ? (
          <div className="text-sm text-gray-400">Nenhuma proposta encontrada.</div>
        ) : (
          <div className={`grid ${gridCols} gap-3`}>
            {orderedStatuses.map((situacao, idx) => {
              const cnt = counts[situacao] ?? 0
              const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0'
              const pctNum = total > 0 ? (cnt / total) * 100 : 0
              const cfg = TGOV_PIPELINE_CONFIG[situacao] ?? DEFAULT_CONFIG

              // Conversion rate: how many from previous stage converted to this one
              const prevSituacao = idx > 0 ? orderedStatuses[idx - 1] : null
              const prevCnt = prevSituacao ? (counts[prevSituacao] ?? 0) : null
              const conversionRate = prevCnt && prevCnt > 0
                ? `${((cnt / prevCnt) * 100).toFixed(0)}% de ${prevSituacao}`
                : null

              return (
                <div
                  key={situacao}
                  onClick={() => router.push(`/tgov?status=${encodeURIComponent(situacao)}`)}
                  className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden hover:shadow-md cursor-pointer transition-shadow"
                >
                  {/* Top color bar */}
                  <div className={`h-1.5 ${cfg.bar}`} />
                  <div className="p-4">
                    <div className={`text-3xl font-bold ${cfg.color}`}>
                      {cnt.toLocaleString('pt-BR')}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{pct}% do total</div>
                    <div className="text-sm font-medium text-gray-700 mt-2 leading-tight">{situacao}</div>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cfg.bar} rounded-full`}
                        style={{ width: `${pctNum}%` }}
                      />
                    </div>
                    {conversionRate && (
                      <div className="text-[10px] text-gray-400 mt-1.5 truncate">{conversionRate}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
