'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/format'

interface ComissaoLead {
  cnpj: string
  nome: string
  valor_emenda: number
  tipo_vendedor: 'SDR' | 'Closer'
  comissao_percentual: number
  comissao_valor: number
  status_contato: string
  vendedor_nome: string
  updated_at: string
}

interface ComissaoStats {
  total_comissao: number
  total_leads_com_comissao: number
  comissao_por_status: {
    'Não Contatado': number
    'Retorno': number
    'Proposta': number
    'Fechado': number
  }
  leads: ComissaoLead[]
}

export default function ComissoesPage() {
  const [data, setData] = useState<ComissaoStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/comissoes')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div className="h-8 w-96 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Erro ao carregar comissões
      </div>
    )
  }

  const STATUS_COLORS = {
    'Não Contatado': 'text-gray-400',
    'Retorno': 'text-yellow-400',
    'Proposta': 'text-blue-400',
    'Fechado': 'text-green-400',
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">
          Comissionamento — Campanha Emendas 2026
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Visão completa de comissões por lead e status
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Comissão Total</p>
          <p className="text-3xl font-heading font-bold text-[#00f0ff] mt-2">
            {formatCurrency(data.total_comissao)}
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Leads com Comissão</p>
          <p className="text-3xl font-heading font-bold text-white mt-2">
            {data.total_leads_com_comissao}
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Não Contatado</p>
          <p className="text-2xl font-heading font-bold text-gray-400 mt-2">
            {formatCurrency(data.comissao_por_status['Não Contatado'])}
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Em Retorno</p>
          <p className="text-2xl font-heading font-bold text-yellow-400 mt-2">
            {formatCurrency(data.comissao_por_status['Retorno'])}
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Proposta/Fechado</p>
          <p className="text-2xl font-heading font-bold text-green-400 mt-2">
            {formatCurrency(data.comissao_por_status['Proposta'] + data.comissao_por_status['Fechado'])}
          </p>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-heading font-semibold text-white">
            Detalhamento por Lead
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-6 py-3">Lead</th>
                <th className="text-left px-6 py-3">Vendedor</th>
                <th className="text-left px-6 py-3">Tipo</th>
                <th className="text-right px-6 py-3">Valor Emenda</th>
                <th className="text-right px-6 py-3">%</th>
                <th className="text-right px-6 py-3">Comissão</th>
                <th className="text-center px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Última Atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {data.leads.map((lead) => (
                <tr key={lead.cnpj} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <a
                      href={`/lead/${lead.cnpj}`}
                      className="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
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
                    {formatCurrency(lead.valor_emenda)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-400">
                    {lead.comissao_percentual.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-base font-semibold text-[#00f0ff]">
                      {formatCurrency(lead.comissao_valor)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs font-medium ${STATUS_COLORS[lead.status_contato as keyof typeof STATUS_COLORS] || 'text-gray-400'}`}>
                      {lead.status_contato}
                    </span>
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

        {data.leads.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">
            Nenhum lead com comissão encontrado
          </div>
        )}
      </div>
    </div>
  )
}
