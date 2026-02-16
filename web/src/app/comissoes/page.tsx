'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/format'

interface ComissaoLead {
  id: string
  cnpj: string
  nome: string
  valor_emenda: number
  valor_venda: number
  tipo_vendedor: 'SDR' | 'Closer'
  comissao_percentual: number
  comissao_valor: number
  comissao_bonus: number
  comissao_locked: boolean
  status_contato: string
  vendedor_nome: string
  vendedor_id: string
  updated_at: string
  has_override: boolean
  override_motivo: string | null
}

interface ComissaoData {
  summary: {
    total_leads: number
    total_comissao: number
    total_bonus: number
    comissao_fechado: number
    comissao_pipeline: number
    total_valor_venda: number
    total_valor_emenda: number
  }
  per_vendedor: Array<{
    vendedor_id: string
    vendedor_nome: string
    lead_count: number
    total_comissao: number
    total_bonus: number
    fechados_count: number
  }>
  leads: ComissaoLead[]
  vendedores_list: Array<{ id: string; nome: string }>
  filters_applied: {
    vendedor_id: string | null
    start_date: string | null
    end_date: string | null
    fechado_only: boolean
  }
}

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  'Nao Contatado': { color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
  'Retorno': { color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  'Proposta': { color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  'Fechado': { color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30' },
}

export default function ComissoesPage() {
  const [data, setData] = useState<ComissaoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Filter state
  const [vendedorFilter, setVendedorFilter] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(() => {
    // Default: first day of current month
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [endDate, setEndDate] = useState<string>(() => {
    // Default: today
    return new Date().toISOString().split('T')[0]
  })
  // Data fetching with filters
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/comissoes?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [vendedorFilter, startDate, endDate])

  // Quick period helpers
  const setCurrentMonth = () => {
    const now = new Date()
    setStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
    setEndDate(new Date().toISOString().split('T')[0])
  }

  const setLastMonth = () => {
    const now = new Date()
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    setStartDate(firstDayLastMonth.toISOString().split('T')[0])
    setEndDate(lastDayLastMonth.toISOString().split('T')[0])
  }

  const setAllTime = () => {
    setStartDate('')
    setEndDate('')
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="h-8 w-96 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-2xl mx-auto space-y-4">
        <p className="text-red-400 text-lg">Erro ao carregar comissoes</p>
        <p className="text-gray-500 text-sm">
          Os campos de comissao podem nao estar configurados no banco de dados.
        </p>
        <a
          href="/api/setup-crm"
          target="_blank"
          className="px-4 py-2 bg-sigma-neon/20 hover:bg-sigma-neon/30 text-sigma-neon rounded-lg text-sm transition-colors"
        >
          Executar Setup (abre em nova aba)
        </a>
      </div>
    )
  }

  const hasVendedoresList = data.vendedores_list && data.vendedores_list.length > 0
  const showPerVendedor = data.per_vendedor && data.per_vendedor.length > 0

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">
          Comissionamento — Campanha Emendas 2026
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Visao completa de comissoes por lead e status
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Vendedor filter (gestor only) */}
          {hasVendedoresList && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Vendedor</label>
              <select
                value={vendedorFilter}
                onChange={(e) => setVendedorFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none min-w-[180px]"
              >
                <option value="">Todos os vendedores</option>
                {data.vendedores_list.map(v => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date range */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400 uppercase tracking-wider">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Ate</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Quick period buttons */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Periodo</label>
            <div className="flex gap-2">
              <button
                onClick={setCurrentMonth}
                className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-blue-500 text-white text-sm rounded-lg transition-colors"
              >
                Este Mes
              </button>
              <button
                onClick={setLastMonth}
                className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-blue-500 text-white text-sm rounded-lg transition-colors"
              >
                Ultimo Mes
              </button>
              <button
                onClick={setAllTime}
                className="px-3 py-2 bg-gray-800 border border-gray-700 hover:border-blue-500 text-white text-sm rounded-lg transition-colors"
              >
                Todos
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Comissao (percentual)</p>
          <p className="text-3xl font-heading font-bold text-[#00f0ff] mt-2">
            {formatCurrency(data.summary.total_comissao)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Somente leads Fechados</p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Bonus Fechamentos</p>
          <p className="text-3xl font-heading font-bold text-green-400 mt-2">
            {formatCurrency(data.summary.total_bonus)}
          </p>
          <p className="text-xs text-gray-500 mt-1">R$ 50 por lead fechado</p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Leads Fechados</p>
          <p className="text-3xl font-heading font-bold text-white mt-2">
            {data.summary.total_leads}
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Valor Total Emendas</p>
          <p className="text-3xl font-heading font-bold text-white mt-2">
            {formatCurrency(data.summary.total_valor_emenda)}
          </p>
        </div>
      </div>

      {/* Per-vendedor breakdown (gestor only) */}
      {showPerVendedor && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-white mb-3">
            Resumo por Vendedor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.per_vendedor.map(v => (
              <div
                key={v.vendedor_id}
                className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-4 hover:scale-[1.02] transition-transform"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-white">{v.vendedor_nome}</h3>
                  <span className="text-xl font-heading font-bold text-blue-400">{v.lead_count}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Comissao (%)</span>
                    <span className="text-base font-semibold text-[#00f0ff]">
                      {formatCurrency(v.total_comissao)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Bonus (R$50/fechamento)</span>
                    <span className="text-sm font-semibold text-green-400">
                      {formatCurrency(v.total_bonus)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {v.fechados_count} leads fechados
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deals table */}
      <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-heading font-semibold text-white">
            Detalhamento por Lead
          </h2>
        </div>

        {data.leads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-6 py-3">Lead</th>
                  <th className="text-left px-6 py-3">Vendedor</th>
                  <th className="text-left px-6 py-3">Tipo</th>
                  <th className="text-right px-6 py-3">Valor Venda</th>
                  <th className="text-right px-6 py-3">%</th>
                  <th className="text-right px-6 py-3">Comissao</th>
                  <th className="text-right px-6 py-3">Bonus</th>
                  <th className="text-left px-6 py-3">Data Fechamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <a
                        href={`/lead/${lead.cnpj}`}
                        className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {lead.nome}
                      </a>
                      <p className="text-xs text-gray-500 mt-1">{lead.cnpj}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-white">{lead.vendedor_nome}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        lead.tipo_vendedor === 'SDR'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {lead.tipo_vendedor}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-white">
                      {formatCurrency(lead.valor_venda)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-400">
                      {Number(lead.comissao_percentual || 0).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-base font-semibold text-[#00f0ff]">
                          {formatCurrency(lead.comissao_valor || 0)}
                        </span>
                        {lead.comissao_locked && (
                          <span className="text-xs text-green-500">(Confirmada)</span>
                        )}
                        {lead.has_override && (
                          <span
                            className="text-xs text-amber-500 cursor-help"
                            title={lead.override_motivo || 'Override sem motivo'}
                          >
                            (Override)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-green-400 font-medium">
                      {formatCurrency(lead.comissao_bonus || 0)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(lead.updated_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            <p className="text-base">Nenhum lead com comissao encontrado no periodo selecionado</p>
            <p className="text-sm mt-2">Ajuste os filtros acima para ver outros resultados</p>
          </div>
        )}
      </div>
    </div>
  )
}
