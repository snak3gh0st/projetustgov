'use client'

import { useEffect, useState } from 'react'

interface Lead {
  id: number
  cnpj: string
  nome: string | null
  valor_emenda: number
  valor_venda: number
  tipo_vendedor: string | null
  comissao_percentual: number
  comissao_valor: number
  comissao_bonus: number
  comissao_locked: boolean
  status_contato: string
  vendedor_nome: string | null
  vendedor_id: string
  closer_id: string | null
  closer_nome: string | null
  updated_at: string | null
}

interface Summary {
  total_leads: number
  total_comissao: number
  total_bonus: number
  total_valor_venda: number
  total_valor_emenda: number
}

interface Payload {
  role: string
  summary: Summary
  leads: Lead[]
  filters_applied: { start_date: string | null; end_date: string | null }
}

interface Props {
  userRole: string
  userName: string | null
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

export default function CsmComissoesClient({ userRole, userName }: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/csm/comissoes')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Payload>
      })
      .then((body) => {
        if (alive) {
          setData(body)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'fetch failed')
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <div className="p-8 text-sm text-gray-500">Carregando comissoes...</div>
  if (error) return <div className="p-8 text-sm text-red-600">Erro: {error}</div>
  if (!data) return <div className="p-8 text-sm text-gray-500">Sem dados.</div>

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Comissoes</h1>
        <p className="text-sm text-gray-500 mt-1">
          {userName ?? 'CSM'} ({userRole}) — {data.summary.total_leads} leads fechados
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Comissao</p>
          <p className="text-xl font-semibold text-gray-800 mt-1">{formatCurrency(data.summary.total_comissao)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Bonus</p>
          <p className="text-xl font-semibold text-gray-800 mt-1">{formatCurrency(data.summary.total_bonus)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Valor Venda</p>
          <p className="text-xl font-semibold text-gray-800 mt-1">{formatCurrency(data.summary.total_valor_venda)}</p>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
        {data.leads.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Nenhum lead fechado com comissao registrada para esta sessao CSM.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">CNPJ</th>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-right">Valor Venda</th>
                <th className="px-4 py-2 text-right">Comissao</th>
                <th className="px-4 py-2 text-right">Bonus</th>
                <th className="px-4 py-2 text-left">Closer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-4 py-2 font-mono">{lead.cnpj}</td>
                  <td className="px-4 py-2">{lead.nome ?? '-'}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(lead.valor_venda)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(lead.comissao_valor)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(lead.comissao_bonus)}</td>
                  <td className="px-4 py-2 text-gray-500">{lead.closer_nome ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
