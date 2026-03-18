'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'
import KPIRow from '@/components/KPIRow'
import ExecucaoSlideOver from '@/components/ExecucaoSlideOver'

interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  total_projetos: number
  total_repasse: string
  total_desembolsado: string
  total_saldo: string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_present: boolean
}

const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
]

export default function ExecucaoClient() {
  const [rows, setRows] = useState<ExecucaoAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uf, setUf] = useState('')
  const [alertOnly, setAlertOnly] = useState(false)
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (uf) params.set('uf', uf)
    if (alertOnly) params.set('alert_only', 'true')
    try {
      const res = await fetch(`/api/execucao?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setRows(data.rows ?? [])
      setLastSynced(data.last_synced ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [search, uf, alertOnly])

  useEffect(() => {
    const timer = setTimeout(fetchData, 300)
    return () => clearTimeout(timer)
  }, [fetchData])

  const kpis = useMemo(() => [
    {
      title: 'Clientes Qualificados',
      value: String(rows.length),
      icon: '\u{1F3E2}',
    },
    {
      title: 'Total Fomentos',
      value: String(rows.reduce((s, r) => s + r.total_projetos, 0)),
      icon: '\u{1F4CB}',
    },
    {
      title: 'Valor Desembolsado',
      value: formatCompactCurrency(rows.reduce((s, r) => s + Number(r.total_desembolsado), 0)),
      icon: '\u{1F4B0}',
    },
    {
      title: 'Alertas Ativos',
      value: String(rows.filter(r => r.tem_alerta).length),
      icon: '\u26A0',
    },
  ], [rows])

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900">Projetos em Execucao</h1>
        <p className="text-sm text-gray-500 mt-1">Convenios ativos por proponente — dados TransferenciaGov</p>
        {lastSynced && (
          <p className="text-xs text-gray-400 mt-1">Dados atualizados em {formatDate(lastSynced)}</p>
        )}
      </div>

      {/* KPI Row */}
      {!loading && !error && <KPIRow items={kpis} />}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por CNPJ ou nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
        />
        <select
          value={uf}
          onChange={e => setUf(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-[#0072F7]"
        >
          <option value="">UF</option>
          {UF_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={e => setAlertOnly(e.target.checked)}
            className="rounded border-gray-300 text-[#0072F7] focus:ring-[#0072F7]"
          />
          Apenas alertas
        </label>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-400">Carregando projetos...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-red-500">Erro ao carregar dados. Verifique sua conexao e tente novamente.</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <h2 className="text-lg font-medium text-gray-700">Nenhum projeto encontrado</h2>
          <p className="text-sm text-gray-400">Nao foram encontrados projetos em execucao. Verifique os filtros ou aguarde o proximo sync.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fomentos</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desembolsado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo em Conta</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Execucao</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vigencia</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alerta</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.cnpj}
                  onClick={() => setSelectedCnpj(row.cnpj)}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                    row.tem_alerta ? 'border-l-4 border-amber-400 bg-amber-50/30' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-sm text-gray-400">{formatCNPJ(row.cnpj)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate" title={row.nome_proponente || ''}>{row.nome_proponente || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 uppercase">{row.uf || '-'}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{row.total_projetos}</td>
                  <td className="px-4 py-3 text-[#0072F7] font-bold text-sm">{formatCompactCurrency(row.total_desembolsado)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatCompactCurrency(row.total_saldo)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.pct_execucao_ponderado != null ? `${Number(row.pct_execucao_ponderado).toFixed(1)}%` : '--'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.data_fim_vigencia_mais_proxima)}</td>
                  <td className="px-4 py-3">
                    {row.tem_alerta && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200" aria-label="Projeto com alerta de desembolso zero">
                        Alerta
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.contact_present && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#0072F7] border border-blue-200">
                        Contato
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Row count */}
      {!loading && !error && rows.length > 0 && (
        <div className="text-sm text-gray-500">
          {rows.length} CNPJs ({rows.reduce((s, r) => s + r.total_projetos, 0)} fomentos)
        </div>
      )}

      {/* Slide-over for CNPJ detail */}
      <ExecucaoSlideOver
        cnpj={selectedCnpj}
        nomeProponente={rows.find(r => r.cnpj === selectedCnpj)?.nome_proponente ?? null}
        temAlerta={rows.find(r => r.cnpj === selectedCnpj)?.tem_alerta ?? false}
        contactPresent={rows.find(r => r.cnpj === selectedCnpj)?.contact_present ?? false}
        onClose={() => setSelectedCnpj(null)}
      />
    </div>
  )
}
