'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCNPJ } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadSlideOver from '@/components/LeadSlideOver'

const STATUS_OPTIONS = ['PROPOSTA', 'AINDA NÃO', 'RETORNO']
const STATUS_COLORS: Record<string, string> = {
  'PROPOSTA': 'bg-amber-500/20 text-amber-400',
  'AINDA NÃO': 'bg-gray-500/20 text-gray-400',
  'RETORNO': 'bg-purple-500/20 text-purple-400',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<VendedorProjeto[]>([])
  const [selectedLead, setSelectedLead] = useState<VendedorProjeto | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status_categoria', statusFilter)
    params.set('limit', '500')

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(fetchLeads, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

  async function updateLead(id: number, field: string, value: string) {
    try {
      const lead = leads.find(l => l.id === id)
      if (!lead) return
      await fetch(`/api/leads/${encodeURIComponent(lead.cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      })
      setLeads(prev => prev.map(l =>
        l.id === id ? { ...l, [field]: value } : l
      ))
    } catch (err) {
      console.error('Failed to update lead:', err)
    }
  }

  function exportCSV() {
    const headers = ['CNPJ', 'Nome', 'Nr Convênio', 'Saldo', '% Executado', 'Categoria', 'Órgão', 'UF', 'Telefone', 'Email', 'Vendedor', 'Observações']
    const rows = leads.map(l => [
      l.cnpj, l.nome, l.nr_convenio, l.saldo, l.perc_executado,
      l.status_categoria, l.orgao_concedente || '', l.uf || '',
      l.telefone || '', l.email || '', l.vendedor_nome || '', l.observacoes || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'leads.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">Lista de Leads</h1>
        <p className="text-sm text-gray-400 mt-1">Todos os projetos dos vendedores</p>
      </div>

      <input
        type="text"
        placeholder="Buscar por CNPJ ou nome..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-sigma-navy-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon/50 transition-colors"
      />

      <div className="flex flex-wrap gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50">
          <option value="">Todas Categorias</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-sigma-navy-light">
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">CNPJ</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nome</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nr Convênio</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Saldo</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">% Exec</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Categoria</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Órgão</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">UF</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Vendedor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase">Obs</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="border-b border-white/5 hover:bg-white/5 hover:border-l-2 hover:border-l-sigma-neon transition-colors cursor-pointer">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-gray-300">
                        {formatCNPJ(lead.cnpj)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white font-medium truncate max-w-[180px]">{lead.nome || '-'}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{lead.nr_convenio}</td>
                    <td className="px-3 py-2 text-sigma-neon text-xs">{lead.saldo}</td>
                    <td className="px-3 py-2 text-gray-300 text-xs">{lead.perc_executado}</td>
                    <td className="px-3 py-2">
                      <select
                        value={lead.status_categoria || 'AINDA NÃO'}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateLead(lead.id, 'status_categoria', e.target.value)}
                        className={`text-xs rounded px-2 py-1 border-0 cursor-pointer ${STATUS_COLORS[lead.status_categoria] || STATUS_COLORS['AINDA NÃO']}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[120px]">{lead.orgao_concedente || '-'}</td>
                    <td className="px-3 py-2 text-gray-300">{lead.uf || '-'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{lead.vendedor_nome || '-'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={lead.observacoes || ''}
                        placeholder="..."
                        maxLength={100}
                        onClick={e => e.stopPropagation()}
                        onBlur={e => {
                          if (e.target.value !== (lead.observacoes || '')) {
                            updateLead(lead.id, 'observacoes', e.target.value)
                          }
                        }}
                        className="bg-transparent border-b border-white/10 text-xs text-gray-300 w-24 focus:outline-none focus:border-sigma-neon/50 placeholder-gray-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>{leads.length} leads encontrados</span>
            <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-xs">
              Exportar CSV
            </button>
          </div>
        </div>
      )}

      <LeadSlideOver lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  )
}
