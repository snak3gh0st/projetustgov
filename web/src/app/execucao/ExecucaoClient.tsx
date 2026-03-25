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
  total_valor_global: string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  qtd_alertas: number
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: string | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_telefone: string | null
  contact_email: string | null
  contact_nome: string | null
  contact_telefone_status: string | null
  total_propostas_db: number
  vendedor_nome: string | null
  tag_autossuficiente: boolean
  tag_iniciante: boolean
  tag_desembolso: boolean
  tag_lobby: boolean
  tag_rendimento: boolean
}

const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
]

export default function ExecucaoClient({ userRole }: { userRole: string }) {
  const isGestor = userRole === 'gestor' || userRole === 'coordenador'
  const [rows, setRows] = useState<ExecucaoAggRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uf, setUf] = useState('')
  const [alertOnly, setAlertOnly] = useState(false)
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<string>('execucao')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

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

  const toggleTag = (tag: string) => {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const TAG_KEYS: { key: string; field: keyof ExecucaoAggRow; label: string; bg: string; text: string; border: string }[] = [
    { key: 'autossuficiente', field: 'tag_autossuficiente', label: 'Autossuficiente', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    { key: 'iniciante', field: 'tag_iniciante', label: 'Iniciante', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { key: 'desembolso', field: 'tag_desembolso', label: 'Desembolso', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { key: 'lobby', field: 'tag_lobby', label: 'Lobby', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    { key: 'rendimento', field: 'tag_rendimento', label: 'Rendimento', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  ]

  const filteredRows = useMemo(() => {
    if (activeTags.size === 0) return rows
    const tagsArr = Array.from(activeTags)
    return rows.filter(r =>
      tagsArr.every(tag => {
        const def = TAG_KEYS.find(t => t.key === tag)
        return def ? r[def.field] : true
      })
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeTags])

  const kpis = useMemo(() => [
    {
      title: 'Clientes Qualificados',
      value: String(filteredRows.length),
      icon: '\u{1F3E2}',
    },
    {
      title: 'Total Fomentos',
      value: String(filteredRows.reduce((s, r) => s + r.total_projetos, 0)),
      icon: '\u{1F4CB}',
    },
    {
      title: 'Valor Total Convenios',
      value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_valor_global), 0)),
      icon: '\u{1F4B0}',
    },
    {
      title: 'Saldo em Conta',
      value: formatCompactCurrency(filteredRows.reduce((s, r) => s + Number(r.total_saldo), 0)),
      icon: '\u{1F4B3}',
    },
    {
      title: 'Alertas Ativos',
      value: String(filteredRows.filter(r => r.tem_alerta).length),
      icon: '\u26A0',
    },
  ], [filteredRows])

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    const sorted = [...filteredRows].sort((a, b) => {
      let va: string | number | boolean | null = null
      let vb: string | number | boolean | null = null
      switch (sortCol) {
        case 'cnpj': va = a.cnpj; vb = b.cnpj; break
        case 'nome': va = a.nome_proponente ?? ''; vb = b.nome_proponente ?? ''; break
        case 'uf': va = a.uf ?? ''; vb = b.uf ?? ''; break
        case 'fomentos': va = a.total_projetos; vb = b.total_projetos; break
        case 'valor_convenio': va = Number(a.total_valor_global); vb = Number(b.total_valor_global); break
        case 'desembolsado': va = Number(a.total_desembolsado); vb = Number(b.total_desembolsado); break
        case 'saldo': va = Number(a.total_saldo); vb = Number(b.total_saldo); break
        case 'execucao': va = Number(a.pct_execucao_ponderado ?? -1); vb = Number(b.pct_execucao_ponderado ?? -1); break
        case 'vigencia': va = a.data_fim_vigencia_mais_proxima ?? ''; vb = b.data_fim_vigencia_mais_proxima ?? ''; break
        case 'alerta': va = a.tem_alerta ? 1 : 0; vb = b.tem_alerta ? 1 : 0; break
        case 'propostas': va = a.total_propostas_db; vb = b.total_propostas_db; break
        case 'contato': va = a.contact_telefone ?? ''; vb = b.contact_telefone ?? ''; break
        case 'vendedor': va = (a.vendedor_nome ?? '').toLowerCase(); vb = (b.vendedor_nome ?? '').toLowerCase(); break
      }
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredRows, sortCol, sortDir])

  const SortIcon = ({ col }: { col: string }) => (
    <span className="inline-flex ml-1 text-gray-400">
      {sortCol === col ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
    </span>
  )

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
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

      {/* Tag filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium mr-1">Tags:</span>
        {TAG_KEYS.map(tag => {
          const active = activeTags.has(tag.key)
          return (
            <button
              key={tag.key}
              onClick={() => toggleTag(tag.key)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                active
                  ? `${tag.bg} ${tag.text} ${tag.border} ring-2 ring-offset-1 ring-current`
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {tag.label}
              {active && (
                <span className="ml-1 text-[10px]">&times;</span>
              )}
            </button>
          )
        })}
        {activeTags.size > 0 && (
          <button
            onClick={() => setActiveTags(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
          >
            Limpar
          </button>
        )}
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
                {[
                  { key: 'cnpj', label: 'CNPJ', sortable: true },
                  { key: 'nome', label: 'Nome', sortable: true },
                  ...(isGestor ? [{ key: 'vendedor', label: 'Vendedor', sortable: true }] : []),
                  { key: 'uf', label: 'UF', sortable: true },
                  { key: 'valor_convenio', label: 'Valor Convenio', sortable: true },
                  { key: 'fomentos', label: 'Fomentos', sortable: true },
                  { key: 'desembolsado', label: 'Desembolsado', sortable: true },
                  { key: 'saldo', label: 'Saldo em Conta', sortable: true },
                  { key: 'execucao', label: '% Execucao', sortable: true },
                  { key: 'vigencia', label: 'Vigencia', sortable: true },
                  { key: 'propostas', label: 'Propostas', sortable: true },
                  { key: 'alerta', label: 'Alerta', sortable: true },
                  { key: 'contato', label: 'Contato', sortable: true },
                  { key: 'tags', label: 'Tags', sortable: false },
                ].map(({ key, label, sortable }) => (
                  <th
                    key={key}
                    onClick={sortable ? () => toggleSort(key) : undefined}
                    className={`px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none whitespace-nowrap ${sortable ? 'cursor-pointer hover:text-gray-700' : ''}`}
                  >
                    {label}{sortable && <SortIcon col={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr
                  key={row.cnpj}
                  onClick={() => setSelectedCnpj(row.cnpj)}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                    row.tem_alerta ? 'border-l-4 border-amber-400 bg-amber-50/30' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{formatCNPJ(row.cnpj)}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-900 max-w-[300px]">
                    <span className="block leading-snug whitespace-normal break-words">{row.nome_proponente || '-'}</span>
                  </td>
                  {isGestor && (
                    <td className="px-3 py-2.5 text-sm text-gray-600 whitespace-nowrap">{row.vendedor_nome || <span className="text-gray-300">Sem dono</span>}</td>
                  )}
                  <td className="px-3 py-2.5 text-sm text-gray-500 uppercase">{row.uf || '-'}</td>
                  <td className="px-3 py-2.5 text-sm font-bold text-gray-900">{formatCompactCurrency(row.total_valor_global)}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-900">{row.total_projetos}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{formatCompactCurrency(row.total_desembolsado)}</td>
                  <td className="px-3 py-2.5 text-[#0072F7] font-bold text-sm">{formatCompactCurrency(row.total_saldo)}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{row.pct_execucao_ponderado != null ? `${Number(row.pct_execucao_ponderado).toFixed(1)}%` : '--'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-500">{formatDate(row.data_fim_vigencia_mais_proxima)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {row.total_propostas_db > 0 ? (
                      <span
                        className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                          row.total_propostas_db >= 6 ? 'bg-red-50 text-red-700 border border-red-200' :
                          row.total_propostas_db >= 3 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                          'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                        title={`${row.total_propostas_db} proposta(s) ja executadas — quanto mais, menor a prioridade`}
                      >
                        {row.total_propostas_db}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.tem_alerta && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-help"
                        title={`${row.qtd_alertas} de ${row.total_projetos} convenio(s) com valor desembolsado = R$ 0,00. O recurso foi aprovado mas nunca foi transferido.`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                        {row.qtd_alertas}/{row.total_projetos} sem desembolso
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    {row.contact_telefone || row.contact_email ? (
                      <div className="space-y-0.5">
                        {row.contact_telefone && (
                          <div className="flex items-center text-xs text-gray-600 truncate">
                            {row.contact_telefone_status === 'valido' && (
                              <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1 flex-shrink-0" title="Telefone valido" />
                            )}
                            {row.contact_telefone_status === 'invalido' && (
                              <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1 flex-shrink-0" title="Telefone invalido" />
                            )}
                            {row.contact_telefone_status === 'nao_atende' && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1 flex-shrink-0" title="Nao atende" />
                            )}
                            {row.contact_telefone}
                          </div>
                        )}
                        {row.contact_email && (
                          <div className="text-xs text-gray-400 truncate">{row.contact_email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-red-500/70">Sem contato</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.tag_autossuficiente && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200" title="Mais de 5 propostas executadas">
                          Autossuficiente
                        </span>
                      )}
                      {row.tag_iniciante && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200" title="Menos de 5 propostas executadas">
                          Iniciante
                        </span>
                      )}
                      {row.tag_desembolso && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title="Projeto com menos de 100 dias de execucao">
                          Desembolso
                        </span>
                      )}
                      {row.tag_lobby && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200" title="Projeto com +100 dias de execucao e desembolso zero">
                          Lobby
                        </span>
                      )}
                      {row.tag_rendimento && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200" title="Rendimento bancario significativo">
                          Rendimento
                        </span>
                      )}
                    </div>
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
          {activeTags.size > 0
            ? `${sortedRows.length} de ${rows.length} CNPJs (filtrado por tags)`
            : `${rows.length} CNPJs (${rows.reduce((s, r) => s + r.total_projetos, 0)} fomentos)`
          }
        </div>
      )}

      {/* Slide-over for CNPJ detail */}
      {(() => {
        const selectedRow = rows.find(r => r.cnpj === selectedCnpj)
        return (
          <ExecucaoSlideOver
            cnpj={selectedCnpj}
            nomeProponente={selectedRow?.nome_proponente ?? null}
            temAlerta={selectedRow?.tem_alerta ?? false}
            contactPresent={selectedRow ? !!selectedRow.contact_telefone : false}
            totalValorGlobal={selectedRow?.total_valor_global ?? null}
            totalPropostas={selectedRow?.total_propostas_db ?? 0}
            tagAutossuficiente={selectedRow?.tag_autossuficiente ?? false}
            tagIniciante={selectedRow?.tag_iniciante ?? false}
            tagDesembolso={selectedRow?.tag_desembolso ?? false}
            tagLobby={selectedRow?.tag_lobby ?? false}
            tagRendimento={selectedRow?.tag_rendimento ?? false}
            onClose={() => { setSelectedCnpj(null); fetchData() }}
          />
        )
      })()}
    </div>
  )
}
