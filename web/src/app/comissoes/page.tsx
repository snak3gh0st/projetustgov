'use client'

import { useEffect, useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import { normalizeTipoVendedor } from '@/lib/crm-catalog'

interface ComissaoLead {
  id: string
  cnpj: string
  nome: string
  valor_emenda: number
  valor_venda: number
  tipo_vendedor: 'SDR' | 'Closer' | 'In-Sites Sells' | 'Exclusivo'
  comissao_percentual: number
  comissao_valor: number
  comissao_bonus: number
  comissao_locked: boolean
  status_contato: string
  vendedor_nome: string
  vendedor_id: string
  closer_id: string | null
  closer_nome: string | null
  closer_comissao_percentual: number
  closer_comissao_valor: number
  updated_at: string
  has_override: boolean
  override_motivo: string | null
}

interface PauloBreakdown {
  consultor: { total: number; count: number; valor_venda: number }
  gestor: { total: number; count: number; valor_venda: number }
  fundo_comercial: { total: number; count: number; valor_venda: number }
  total_geral: number
}

interface OverrideForm {
  lead_id: number
  lead_nome: string
  current_percentual: number
  current_valor: number
  percentual_override: number
  taxa_fixa_override: number
  motivo: string
}

interface ComissaoData {
  role: string
  summary: {
    total_leads: number
    total_comissao: number
    total_bonus: number
    total_closer_comissao: number
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
  paulo_breakdown: PauloBreakdown | null
  lead_manager_name?: string
  leads: ComissaoLead[]
  vendedores_list: Array<{ id: string; nome: string }>
  filters_applied: {
    vendedor_id: string | null
    start_date: string | null
    end_date: string | null
    fechado_only: boolean
  }
  selected_vendedor_stats: {
    total_leads: number
    fechados: number
    fechados_com_comissao: number
    total_fechados_comissao: number
  } | null
}

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  'Não Contatado': { color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  'Sem Interesse': { color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  'Em Atendimento': { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  'Proposta Enviada': { color: 'text-[#0072F7]', bg: 'bg-blue-50 border-blue-200' },
  'Fechado': { color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
}

interface FundoLancamento {
  id: number
  tipo: 'credito' | 'debito'
  valor: number
  descricao: string
  lead_id: number | null
  criado_em: string
  criado_por_nome: string
}

export default function ComissoesPage() {
  const [data, setData] = useState<ComissaoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [overrideForm, setOverrideForm] = useState<OverrideForm | null>(null)
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [fundo, setFundo] = useState<{ saldo: number; lancamentos: FundoLancamento[] } | null>(null)
  const [novoDebito, setNovoDebito] = useState({ valor: '', descricao: '' })
  const [debitoLoading, setDebitoLoading] = useState(false)

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
  }, [vendedorFilter, startDate, endDate, refreshKey])

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

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortCol !== col) return <span className="ml-1 text-gray-300">↕</span>
    return <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const isGestor = data?.role === 'gestor'

  useEffect(() => {
    if (!isGestor) return
    fetch('/api/fundo-comercial')
      .then(r => r.ok ? r.json() : null)
      .then(setFundo)
      .catch(() => {})
  }, [isGestor, refreshKey])

  async function submitDebito() {
    const valor = Number(novoDebito.valor)
    if (!valor || valor <= 0 || !novoDebito.descricao.trim()) return
    setDebitoLoading(true)
    try {
      const res = await fetch('/api/fundo-comercial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, descricao: novoDebito.descricao.trim() }),
      })
      if (res.ok) {
        setNovoDebito({ valor: '', descricao: '' })
        setRefreshKey(k => k + 1)
      }
    } finally {
      setDebitoLoading(false)
    }
  }

  function openOverride(lead: ComissaoLead) {
    setOverrideForm({
      lead_id: Number(lead.id),
      lead_nome: lead.nome,
      current_percentual: lead.comissao_percentual,
      current_valor: lead.comissao_valor,
      percentual_override: lead.comissao_percentual,
      taxa_fixa_override: lead.comissao_bonus,
      motivo: '',
    })
  }

  async function submitOverride() {
    if (!overrideForm || !overrideForm.motivo.trim()) return
    setOverrideLoading(true)
    try {
      const res = await fetch('/api/commission-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: overrideForm.lead_id,
          percentual_override: overrideForm.percentual_override,
          taxa_fixa_override: overrideForm.taxa_fixa_override,
          motivo: overrideForm.motivo.trim(),
        }),
      })
      if (res.ok) {
        setOverrideForm(null)
        setRefreshKey(k => k + 1)
      }
    } finally {
      setOverrideLoading(false)
    }
  }

  const sortedLeads = useMemo(() => {
    if (!data?.leads || !sortCol) return data?.leads || []
    return [...data.leads].sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortCol) {
        case 'nome': va = (a.nome || '').toLowerCase(); vb = (b.nome || '').toLowerCase(); break
        case 'vendedor': va = (a.vendedor_nome || '').toLowerCase(); vb = (b.vendedor_nome || '').toLowerCase(); break
        case 'tipo': va = a.tipo_vendedor || ''; vb = b.tipo_vendedor || ''; break
        case 'valor_venda': va = a.valor_venda || 0; vb = b.valor_venda || 0; break
        case 'percentual': va = a.comissao_percentual || 0; vb = b.comissao_percentual || 0; break
        case 'comissao': va = a.comissao_valor || 0; vb = b.comissao_valor || 0; break
        case 'bonus': va = a.comissao_bonus || 0; vb = b.comissao_bonus || 0; break
        case 'data': va = a.updated_at || ''; vb = b.updated_at || ''; break
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data?.leads, sortCol, sortDir])

  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-[1800px] mx-auto">
        <div className="h-8 w-96 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-2xl mx-auto space-y-4">
        <p className="text-red-500 text-lg">Erro ao carregar comissoes</p>
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
  const selectedVendedorNome = vendedorFilter
    ? (data.vendedores_list.find(v => v.id === vendedorFilter)?.nome || 'Vendedor selecionado')
    : null

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-gray-900 dark:text-gray-100">
          Comissionamento — Campanha Emendas 2026
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Visao completa de comissoes por lead e status
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Vendedor filter (gestor only) */}
          {hasVendedoresList && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vendedor</label>
              <select
                value={vendedorFilter}
                onChange={(e) => setVendedorFilter(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none w-full sm:min-w-[180px]"
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
            <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Ate</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none"
            />
          </div>

          {/* Quick period buttons */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Periodo</label>
            <div className="flex gap-2">
              <button
                onClick={setCurrentMonth}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#0072F7] text-gray-900 dark:text-gray-100 text-sm rounded-lg transition-colors"
              >
                Este Mes
              </button>
              <button
                onClick={setLastMonth}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#0072F7] text-gray-900 dark:text-gray-100 text-sm rounded-lg transition-colors"
              >
                Ultimo Mes
              </button>
              <button
                onClick={setAllTime}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:border-[#0072F7] text-gray-900 dark:text-gray-100 text-sm rounded-lg transition-colors"
              >
                Todos
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Summary cards */}
      {data.role === 'coordenador' && data.paulo_breakdown ? (
        /* Lead manager's view: show personal commission total */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 border-2 border-[#0072F7] shadow-sm rounded-xl p-5">
            <p className="text-xs text-[#0072F7] uppercase tracking-wider font-medium">Minha Comissão Total</p>
            <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
              {formatCurrency(data.paulo_breakdown.total_geral)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Consultor + Gestor + Fundo Comercial</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fundo Comercial</p>
            <p className="text-3xl font-heading font-bold text-green-600 mt-2">
              {formatCurrency(data.summary.total_bonus)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vendas Concluídas</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">{data.summary.total_leads}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Faturamento Total</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">
              {formatCurrency(data.summary.total_valor_venda)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Valor vendas concluídas</p>
          </div>
        </div>
      ) : data.role === 'gestor' ? (
        /* Gestor view: show total paid out to everyone */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Comissões Consultores</p>
            <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
              {formatCurrency(data.summary.total_comissao)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">5% do consultor sobre a receita</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Comissão Gestor</p>
            <p className="text-2xl font-heading font-bold text-purple-600 mt-2">
              {formatCurrency(data.summary.total_closer_comissao)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fundo Comercial</p>
            <p className="text-3xl font-heading font-bold text-green-600 mt-2">
              {formatCurrency(data.summary.total_bonus)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Faturamento Total</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">
              {formatCurrency(data.summary.total_valor_venda)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Valor vendas fechadas</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-900 dark:text-gray-100 uppercase tracking-wider font-medium">Total Pago</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">
              {formatCurrency(
                data.summary.total_comissao
                + data.summary.total_closer_comissao
                + (data.paulo_breakdown?.fundo_comercial.total || 0)
                + data.summary.total_bonus
              )}
            </p>
          </div>
        </div>
      ) : (
        /* Vendedor view: show their own commission */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Minha Comissão</p>
            <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
              {formatCurrency(data.summary.total_comissao)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Somente vendas concluídas</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fundo Comercial</p>
            <p className="text-3xl font-heading font-bold text-green-600 mt-2">
              {formatCurrency(data.summary.total_bonus)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">2% da receita por venda concluída</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vendas Concluídas</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">{data.summary.total_leads}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Faturamento Total</p>
            <p className="text-3xl font-heading font-bold text-gray-900 dark:text-gray-100 mt-2">
              {formatCurrency(data.summary.total_valor_venda)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Valor vendas fechadas</p>
          </div>
        </div>
      )}

      {/* Lead manager's 3-type commission breakdown */}
      {data.paulo_breakdown && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Comissão Gerencial
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <p className="text-xs text-emerald-600 uppercase tracking-wider font-medium">Consultor (5%)</p>
              <p className="text-2xl font-heading font-bold text-emerald-700 mt-2">
                {formatCurrency(data.paulo_breakdown.consultor.total)}
              </p>
              <p className="text-xs text-emerald-500 mt-1">
                {data.paulo_breakdown.consultor.count} clientes • {formatCurrency(data.paulo_breakdown.consultor.valor_venda)} em vendas
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 rounded-xl p-5">
              <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wider font-medium">Gestor (3%)</p>
              <p className="text-2xl font-heading font-bold text-purple-700 mt-2">
                {formatCurrency(data.paulo_breakdown.gestor.total)}
              </p>
              <p className="text-xs text-purple-500 mt-1">
                {data.paulo_breakdown.gestor.count} leads aprovados • {formatCurrency(data.paulo_breakdown.gestor.valor_venda)} em vendas
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-5">
              <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wider font-medium">Fundo Comercial (2%)</p>
              <p className="text-2xl font-heading font-bold text-amber-700 mt-2">
                {formatCurrency(data.paulo_breakdown.fundo_comercial.total)}
              </p>
              <p className="text-xs text-amber-500 mt-1">
                {data.paulo_breakdown.fundo_comercial.count} vendas concluídas • {formatCurrency(data.paulo_breakdown.fundo_comercial.valor_venda)} em receita
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border-2 border-[#0072F7] rounded-xl p-5">
              <p className="text-xs text-[#0072F7] uppercase tracking-wider font-medium">Total Geral</p>
              <p className="text-3xl font-heading font-bold text-[#0072F7] mt-2">
                {formatCurrency(data.paulo_breakdown.total_geral)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Consultor + Gestor + Fundo Comercial</p>
            </div>
          </div>
        </div>
      )}

      {/* Per-vendedor breakdown (gestor only) */}
      {showPerVendedor && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Resumo por Pessoa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.per_vendedor.map(v => (
              <div
                key={v.vendedor_id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{v.vendedor_nome}</h3>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] rounded font-medium">
                    {v.fechados_count} fechados
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 dark:text-gray-500">Comissão</span>
                    <span className="text-lg font-semibold text-[#0072F7]">
                      {formatCurrency(v.total_comissao)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 dark:text-gray-500">Fundo Comercial</span>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(v.total_bonus)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
                    <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Total</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(v.total_comissao + v.total_bonus)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {/* Lead manager card — consultor + gestor + fundo */}
            {data.paulo_breakdown && isGestor && (
              <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-purple-900">{data.lead_manager_name || 'Rooger'} (Gestor)</h3>
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                    {data.paulo_breakdown.gestor.count + data.paulo_breakdown.consultor.count} vendas
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-500">Consultor (5%)</span>
                    <span className="text-sm font-semibold text-emerald-700">
                      {formatCurrency(data.paulo_breakdown.consultor.total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-500">Gestor (3%)</span>
                    <span className="text-sm font-semibold text-purple-700">
                      {formatCurrency(data.paulo_breakdown.gestor.total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-500">Fundo Comercial (2%)</span>
                    <span className="text-sm font-semibold text-amber-700">
                      {formatCurrency(data.paulo_breakdown.fundo_comercial.total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-purple-200 pt-1 mt-1">
                    <span className="text-xs text-purple-700 font-medium">Total {data.lead_manager_name || 'Rooger'}</span>
                    <span className="text-base font-bold text-purple-900">
                      {formatCurrency(data.paulo_breakdown.total_geral)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deals table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100">
            Detalhamento por Lead
          </h2>
        </div>

        {sortedLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th onClick={() => handleSort('nome')} className="text-left px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Lead<SortIcon col="nome" /></th>
                  <th onClick={() => handleSort('vendedor')} className="text-left px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Responsável<SortIcon col="vendedor" /></th>
                  <th onClick={() => handleSort('tipo')} className="text-left px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Categoria<SortIcon col="tipo" /></th>
                  <th onClick={() => handleSort('valor_venda')} className="text-right px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Valor da Venda<SortIcon col="valor_venda" /></th>
                  <th onClick={() => handleSort('percentual')} className="text-right px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">%<SortIcon col="percentual" /></th>
                  <th onClick={() => handleSort('comissao')} className="text-right px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Comissão Consultor<SortIcon col="comissao" /></th>
                  <th className="text-right px-6 py-3">Gestor</th>
                  <th onClick={() => handleSort('bonus')} className="text-right px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Fundo Comercial<SortIcon col="bonus" /></th>
                  <th onClick={() => handleSort('data')} className="text-left px-6 py-3 cursor-pointer hover:text-[#0072F7] select-none">Data da Venda<SortIcon col="data" /></th>
                  {isGestor && <th className="text-center px-4 py-3">Acao</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4">
                      <a
                        href={`/lead/${lead.cnpj}`}
                        className="text-sm text-[#0072F7] hover:text-blue-700 font-medium"
                      >
                        {lead.nome}
                      </a>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{lead.cnpj}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 dark:text-gray-100">{lead.vendedor_nome}</span>
                      {lead.closer_nome && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Gestor: {lead.closer_nome}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        normalizeTipoVendedor(lead.tipo_vendedor) === 'SDR'
                          ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7]'
                          : normalizeTipoVendedor(lead.tipo_vendedor) === 'In-Sites Sells'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      }`}>
                        {normalizeTipoVendedor(lead.tipo_vendedor)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatCurrency(lead.valor_venda)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-400 dark:text-gray-500">
                      {Number(lead.comissao_percentual || 0).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-base font-semibold text-[#0072F7]">
                          {formatCurrency(lead.comissao_valor || 0)}
                        </span>
                        {lead.comissao_locked && (
                          <span className="text-xs text-green-600">(Confirmada)</span>
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
                    <td className="px-6 py-4 text-right">
                      {lead.closer_comissao_valor > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold text-purple-600">
                            {formatCurrency(lead.closer_comissao_valor)}
                          </span>
                          <span className="text-xs text-purple-400">
                            {lead.closer_comissao_percentual}% • {lead.closer_nome}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-green-600 font-medium">
                      {formatCurrency(lead.comissao_bonus || 0)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(lead.updated_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    {isGestor && (
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => openOverride(lead)}
                          className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-[#0072F7]/10 hover:text-[#0072F7] text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                          title="Alterar comissao deste lead"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            <p className="text-base">Nenhum lead com comissão encontrado no período selecionado</p>
            {vendedorFilter && data.selected_vendedor_stats ? (
              <p className="text-sm mt-2">
                {selectedVendedorNome}: {data.selected_vendedor_stats.total_leads} leads no período, {data.selected_vendedor_stats.fechados} vendas concluídas,
                {' '}{data.selected_vendedor_stats.fechados_com_comissao} com comissão (&gt; 0).
              </p>
            ) : (
              <p className="text-sm mt-2">Ajuste os filtros acima para ver outros resultados</p>
            )}
          </div>
        )}
      </div>
      {/* Fundo Comercial — extrato e débitos (gestor only) */}
      {isGestor && fundo && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100">Fundo Comercial — Extrato</h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Saldo atual: <span className="font-semibold text-green-600">{formatCurrency(fundo.saldo)}</span></p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Valor do débito (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={novoDebito.valor}
                  onChange={e => setNovoDebito(f => ({ ...f, valor: e.target.value }))}
                  className="bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 w-32 focus:border-[#0072F7] focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Incentivo equipe — julho"
                  value={novoDebito.descricao}
                  onChange={e => setNovoDebito(f => ({ ...f, descricao: e.target.value }))}
                  className="bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 w-64 focus:border-[#0072F7] focus:outline-none"
                />
              </div>
              <button
                onClick={submitDebito}
                disabled={debitoLoading || !novoDebito.valor || !novoDebito.descricao.trim()}
                className="px-4 py-2 bg-[#0072F7] text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {debitoLoading ? 'Salvando...' : 'Lançar débito'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="min-w-[700px] w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-6 py-3">Data</th>
                  <th className="text-left px-6 py-3">Tipo</th>
                  <th className="text-left px-6 py-3">Descrição</th>
                  <th className="text-left px-6 py-3">Por</th>
                  <th className="text-right px-6 py-3">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {fundo.lancamentos.map(l => (
                  <tr key={l.id}>
                    <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(l.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${l.tipo === 'credito' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300">{l.descricao}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{l.criado_por_nome}</td>
                    <td className={`px-6 py-3 text-right text-sm font-semibold ${l.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {l.tipo === 'credito' ? '+' : '-'}{formatCurrency(l.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setOverrideForm(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100 mb-1">Alterar Comissão</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">{overrideForm.lead_nome}</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">Percentual Atual</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">{overrideForm.current_percentual}% = {formatCurrency(overrideForm.current_valor)}</p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Novo Percentual (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={overrideForm.percentual_override}
                  onChange={e => setOverrideForm(f => f ? { ...f, percentual_override: Number(e.target.value) } : null)}
                  className="w-full bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Fundo Comercial (R$)</label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={overrideForm.taxa_fixa_override}
                  onChange={e => setOverrideForm(f => f ? { ...f, taxa_fixa_override: Number(e.target.value) } : null)}
                  className="w-full bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Motivo *</label>
                <input
                  type="text"
                  placeholder="Ex: Ajuste negociado com vendedor"
                  value={overrideForm.motivo}
                  onChange={e => setOverrideForm(f => f ? { ...f, motivo: e.target.value } : null)}
                  className="w-full bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 border border-gray-300 text-gray-900 text-sm rounded-lg px-3 py-2 focus:border-[#0072F7] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setOverrideForm(null)}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={submitOverride}
                disabled={overrideLoading || !overrideForm.motivo.trim()}
                className="flex-1 px-4 py-2 bg-[#0072F7] text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {overrideLoading ? 'Salvando...' : 'Salvar Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
