'use client'

import { useEffect, useState } from 'react'
import KPIRow from '@/components/KPIRow'
import RankingCard from '@/components/RankingCard'
import BrazilChoropleth from '@/components/BrazilChoropleth'
import ValueDistribution from '@/components/ValueDistribution'
import { formatCompactCurrency, formatNumber } from '@/lib/format'
import type { Stats, Lead, EstadoData, ValueDistribution as VD } from '@/lib/types'

export default function PipelinePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [estados, setEstados] = useState<EstadoData[]>([])
  const [distribution, setDistribution] = useState<VD[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 40000)

    fetch('/api/dashboard', { signal: controller.signal })
      .then(r => {
        clearTimeout(timeout)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (data.error) throw new Error(data.error)
        setStats(data.stats)
        setLeads(Array.isArray(data.leads) ? data.leads : [])
        setEstados(Array.isArray(data.estados) ? data.estados : [])
        setDistribution(Array.isArray(data.distribution) ? data.distribution : [])
        setLoading(false)
      })
      .catch(err => {
        clearTimeout(timeout)
        setError(String(err))
        setLoading(false)
      })

    return () => { clearTimeout(timeout); controller.abort() }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
        <div className="text-gray-500 animate-pulse">Carregando pipeline...</div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-red-400">Erro ao carregar dados</div>
        <div className="text-xs text-gray-600 font-mono max-w-md text-center break-all">{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-sigma-neon/20 text-sigma-neon rounded-lg hover:bg-sigma-neon/30 transition-colors text-sm"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const kpis = [
    { title: 'Total Leads', value: formatNumber(stats.total_leads), icon: '👥', subtitle: `${stats.new_leads} novos` },
    { title: 'Alto Valor', value: formatNumber(stats.high_value_leads), icon: '⭐', subtitle: 'Leads prioritarios' },
    { title: 'Valor Emendas', value: formatCompactCurrency(stats.total_valor_emendas), icon: '💰', subtitle: `${formatNumber(stats.total_emendas)} emendas` },
    { title: 'Instrumentos', value: formatNumber(stats.total_convenios), icon: '📋', subtitle: formatCompactCurrency(stats.total_valor_desembolsos) + ' desembolsado' },
  ]

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">Pipeline</h1>
        <p className="text-sm text-gray-400 mt-1">Visao geral do CRM</p>
      </div>

      <KPIRow items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BrazilChoropleth data={estados} />
        <ValueDistribution data={distribution} />
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold text-white mb-4">Top 10 Leads</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leads.slice(0, 10).map((lead, i) => (
            <RankingCard key={lead.cnpj} lead={lead} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
