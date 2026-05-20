'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import KPICard from '@/components/KPICard'
import { formatCompactCurrency, formatNumber } from '@/lib/format'

interface CsmBiClientProps {
  userRole: string
  userName: string | null
}

type CsmBiResponse = {
  totals: {
    total_saldo_conta: number
    total_rendimento: number
    total_a_liberar: number
    total_projetos: number
  }
  by_status: Array<{ bucket: string; count: number; value: number }>
  funnel: Array<{ stage: string; count: number; value: number }>
}

const BUCKET_COLORS: Record<string, string> = {
  'Saldo em Conta': '#10b981',         // emerald-500
  'A Desembolsar': '#f59e0b',          // amber-500
  'Em Execução': '#16a34a',            // green-600
  'Em Aprovação': '#7c3aed',           // violet-600
  'Prestação de Contas': '#64748b',    // slate-500
  'Outros': '#9ca3af',                  // gray-400
}

export default function CsmBiClient({ userRole, userName }: CsmBiClientProps) {
  const [data, setData] = useState<CsmBiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    fetch('/api/csm/bi', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { if (!cancel) { setData(d); setLoading(false) } })
      .catch(err => { if (!cancel) { setError(`Falha ao carregar BI (${err})`); setLoading(false) } })
    return () => { cancel = true }
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">BI Dashboard CSM</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Carregando BI...</p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">BI Dashboard CSM</h1>
        </header>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-md p-4 flex items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          <button
            onClick={() => { setError(null); setLoading(true); fetch('/api/csm/bi', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => { setData(d); setLoading(false) }).catch(err => { setError(`Falha ao carregar BI (${err})`); setLoading(false) }) }}
            className="ml-4 text-sm text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">BI Dashboard CSM</h1>
        </header>
        <p className="text-sm text-gray-500 dark:text-gray-400">Sem dados para o portfolio</p>
      </div>
    )
  }

  const total = data.totals.total_projetos

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">BI Dashboard CSM</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Visao consolidada do portfolio — sessao ativa: {userName ?? 'sem nome'} ({userRole})
        </p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Saldo em Conta" value={formatCompactCurrency(data.totals.total_saldo_conta)} subtitle="Total disponivel" />
        <KPICard title="Saldo Rendimento" value={formatCompactCurrency(data.totals.total_rendimento)} subtitle="Realizado" />
        <KPICard title="A Liberar" value={formatCompactCurrency(data.totals.total_a_liberar)} subtitle="Desembolso + Aprovacao" />
        <KPICard title="Total Projetos" value={formatNumber(data.totals.total_projetos)} subtitle="No portfolio" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Projetos por situacao</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.by_status}
                  dataKey="count"
                  nameKey="bucket"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.by_status.map(b => (
                    <Cell key={b.bucket} fill={BUCKET_COLORS[b.bucket] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as { bucket?: string; value?: number; count?: number } | undefined
                    const count = Number(payload[0]?.value ?? row?.count ?? 0)
                    const bucket = row?.bucket ?? ''
                    const value = row?.value ?? 0
                    return (
                      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs shadow-sm">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{bucket}</div>
                        <div className="text-gray-600 dark:text-gray-400">
                          {count} projetos · {formatCompactCurrency(value)}
                        </div>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="mt-3 space-y-1">
            {data.by_status.map(b => {
              const pct = total > 0 ? ((b.count / total) * 100).toFixed(1) : '0.0'
              return (
                <div key={b.bucket} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: BUCKET_COLORS[b.bucket] ?? '#9ca3af' }} />
                  <span className="flex-1">{b.bucket}</span>
                  <span className="font-medium">{b.count} ({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Funnel */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Funil do portfolio</h2>
          <div className="space-y-1">
            {data.funnel.map(f => {
              const pct = total > 0 ? (f.count / total) * 100 : 0
              return (
                <div key={f.stage} className="flex items-center gap-3 py-2">
                  <div className="w-40 shrink-0 text-sm text-gray-700 dark:text-gray-300">{f.stage}</div>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${pct}%`, background: BUCKET_COLORS[f.stage] ?? '#9ca3af' }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {f.count} projetos · {formatCompactCurrency(f.value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
