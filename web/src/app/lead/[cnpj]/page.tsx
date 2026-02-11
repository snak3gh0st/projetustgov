'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TierBadge from '@/components/TierBadge'
import { formatCNPJ, formatCompactCurrency, formatNumber } from '@/lib/format'
import { calculateValueTier } from '@/lib/tiers'
import type { Lead, InstrumentSummary, Emenda, Proposta, Ministerio, Programa, Instrument } from '@/lib/types'
import LeadTabs from './LeadTabs'

export default function LeadProfilePage() {
  const params = useParams()
  const cnpj = decodeURIComponent(params.cnpj as string)
  const encoded = encodeURIComponent(cnpj)

  const [lead, setLead] = useState<Lead | null>(null)
  const [summary, setSummary] = useState<InstrumentSummary | null>(null)
  const [emendas, setEmendas] = useState<Emenda[]>([])
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [ministerios, setMinisterios] = useState<Ministerio[]>([])
  const [programas, setProgramas] = useState<Programa[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/leads/${encoded}`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/instrument-summary`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/emendas`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/propostas`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/ministerios`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/programas`).then(r => r.json()),
      fetch(`/api/leads/${encoded}/instruments`).then(r => r.json()),
    ]).then(([l, s, e, p, m, pg, i]) => {
      setLead(l?.error ? null : l)
      setSummary(s?.error ? null : s)
      setEmendas(Array.isArray(e) ? e : [])
      setPropostas(Array.isArray(p) ? p : [])
      setMinisterios(Array.isArray(m) ? m : [])
      setProgramas(Array.isArray(pg) ? pg : [])
      setInstruments(Array.isArray(i) ? i : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [encoded])

  if (loading || !lead || !summary) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-500 animate-pulse">Carregando lead...</div>
      </div>
    )
  }

  const tier = calculateValueTier(lead.total_propostas, lead.valor_total_emendas, lead.total_convenios)

  const kpis = [
    { title: 'Propostas', value: formatNumber(lead.total_propostas), icon: '📄' },
    { title: 'Emendas', value: formatNumber(lead.total_emendas), icon: '📝', subtitle: formatCompactCurrency(lead.valor_total_emendas) },
    { title: 'Instrumentos', value: formatNumber(summary.total_instrumentos), icon: '📋', subtitle: `${summary.instrumentos_ativos} ativos` },
    { title: 'Valor Global', value: formatCompactCurrency(summary.total_valor_global), icon: '💰' },
    { title: 'Empenhado', value: formatCompactCurrency(summary.total_empenhado), icon: '🔒' },
    { title: 'Liberado', value: formatCompactCurrency(summary.total_liberado), icon: '✅' },
  ]

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/leads" className="text-gray-400 hover:text-white transition-colors text-sm">
        ← Voltar
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-heading text-2xl font-bold text-white">{lead.nome}</h1>
            <TierBadge tier={tier} />
          </div>
          <p className="text-sm text-gray-400 font-mono">{formatCNPJ(lead.cnpj)}</p>
        </div>
        {lead.is_existing_client && (
          <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium">CLIENTE EXISTENTE</span>
        )}
      </div>

      <div className="flex flex-wrap gap-6 bg-sigma-navy-card border border-white/5 rounded-xl p-4 text-sm">
        <div><span className="text-gray-500 text-xs block">CNPJ</span><span className="text-gray-300 font-mono">{formatCNPJ(lead.cnpj)}</span></div>
        <div><span className="text-gray-500 text-xs block">Email</span><span className="text-gray-300">{lead.email || '-'}</span></div>
        <div><span className="text-gray-500 text-xs block">Telefone</span><span className="text-gray-300">{lead.telefone || '-'}</span></div>
        <div><span className="text-gray-500 text-xs block">Local</span><span className="text-gray-300">{[lead.municipio, lead.estado].filter(Boolean).join(' - ') || '-'}</span></div>
        <div><span className="text-gray-500 text-xs block">Natureza Juridica</span><span className="text-gray-300">{lead.natureza_juridica || '-'}</span></div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="bg-sigma-navy-card border border-white/5 rounded-xl p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{kpi.title}</span>
              <span className="text-lg">{kpi.icon}</span>
            </div>
            <span className="text-xl font-heading font-bold text-white">{kpi.value}</span>
            {kpi.subtitle && <span className="text-xs text-gray-500">{kpi.subtitle}</span>}
          </div>
        ))}
      </div>

      <LeadTabs emendas={emendas} propostas={propostas} ministerios={ministerios} programas={programas} instruments={instruments} />
    </div>
  )
}
