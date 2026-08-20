'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'
import {
  OPERACAO_CHECKLIST_STYLES,
  OPERACAO_DOCUMENTO_STYLES,
  OPERACAO_ETAPA_STYLES,
  formatOperacaoStatus,
  type OperacaoDocumentoStatus,
  type OperacaoEtapa,
  type OperacaoItemStatus,
  type OperacaoPainel,
} from '@/lib/operacao'

interface OperacaoRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  situacao_tgov: string | null
  total_convenios: number
  total_valor_global: string | null
  total_desembolsado: string | null
  valor_venda: string | null
  tipo_servico: string | null
  commercial_status: string
  vendedor_nome: string | null
  data_fim_vigencia: string | null
  dia_limite_prest_contas: string | null
  checklist_total: number
  checklist_done: number
  documentos_total: number
  documentos_done: number
  etapa: OperacaoEtapa
}

interface DetailData {
  cnpj: string
  projects: Array<{
    nr_convenio: string
    id_proposta: string | null
    situacao: string | null
    objeto: string | null
    valor_global: string | null
    valor_desembolsado: string | null
    saldo_conta: string | null
    data_inicio_vigencia: string | null
    data_fim_vigencia: string | null
    dia_limite_prest_contas: string | null
  }>
  checklists: Array<{ nr_convenio: string; item_key: string; item_label: string; status: OperacaoItemStatus; note: string | null; updated_at: string }>
  documentos: Array<{ nr_convenio: string; document_key: string; document_label: string; status: OperacaoDocumentoStatus; note: string | null; updated_at: string }>
  history: Array<{ nr_convenio: string | null; situacao: string | null; data_historico: string | null; dias_historico: number | null; source: string }>
  events: Array<{ nr_convenio: string | null; event_type: string; from_status: string | null; to_status: string | null; note: string | null; source: string; occurred_at: string }>
  last_synced: string | null
}

const panelLabels: Record<OperacaoPainel, string> = {
  execucao: 'Execução',
  prestacao_contas: 'Prestação de contas',
}

const stageOptions: Array<OperacaoEtapa | ''> = ['', 'Aguardando execução', 'Em execução', 'Prestação de Contas', 'Concluído', 'Atenção']
const checklistStatuses: OperacaoItemStatus[] = ['pendente', 'em_andamento', 'concluido', 'nao_aplicavel']
const documentStatuses: OperacaoDocumentoStatus[] = ['pendente', 'em_analise', 'recebido', 'aprovado', 'rejeitado', 'nao_aplicavel']

function deadlineLabel(row: OperacaoRow): { value: string; tone: string } {
  const raw = row.dia_limite_prest_contas || row.data_fim_vigencia
  if (!raw) return { value: 'Sem prazo', tone: 'text-slate-400' }
  const days = Math.ceil((new Date(raw).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { value: `${Math.abs(days)}d vencido`, tone: 'text-rose-600 dark:text-rose-400' }
  if (days <= 30) return { value: `${days}d`, tone: 'text-amber-600 dark:text-amber-400' }
  return { value: `${days}d`, tone: 'text-slate-600 dark:text-slate-300' }
}

function ProgressPill({ done, total, label }: { done: number; total: number; label: string }) {
  const complete = total > 0 && done >= total
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      {label} {done}/{total}
    </span>
  )
}

function MetricCard({ eyebrow, value, caption, accent }: { eyebrow: string; value: string; caption: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <p className="pl-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{eyebrow}</p>
      <p className="pl-2 pt-2 font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      <p className="pl-2 pt-1 text-xs text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  )
}

function DetailPanel({
  cnpj,
  row,
  userRole,
  onClose,
}: {
  cnpj: string
  row: OperacaoRow
  userRole: string
  onClose: () => void
}) {
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const canWrite = ['gestor', 'admin', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao'].includes(userRole)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/operacao/${encodeURIComponent(cnpj)}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar')
      setData(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar')
    } finally {
      setLoading(false)
    }
  }, [cnpj])

  useEffect(() => { void load() }, [load])

  async function updateItem(kind: 'checklist' | 'documento', nrConvenio: string, itemKey: string, status: string, note: string | null) {
    const saveKey = `${kind}:${nrConvenio}:${itemKey}`
    setSavingKey(saveKey)
    try {
      const response = await fetch(`/api/operacao/${encodeURIComponent(cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, nr_convenio: nrConvenio, item_key: itemKey, status, note }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Não foi possível salvar')
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Fechar detalhe" className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[620px] flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-white px-6 pb-5 pt-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Área operacional v1</p>
              <h2 className="mt-2 font-heading text-xl font-bold text-slate-900 dark:text-white">{row.nome_proponente || 'Proponente sem nome'}</h2>
              <p className="mt-1 font-mono text-xs text-slate-400">{formatCNPJ(cnpj)}</p>
            </div>
            <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Fechar">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OPERACAO_ETAPA_STYLES[row.etapa]}`}>{row.etapa}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">TGov: {row.situacao_tgov || 'Sem situação'}</span>
            {row.tipo_servico && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">Comercial: {row.tipo_servico}</span>}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">Carregando fonte sincronizada...</div>}
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
          {data && !loading && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] uppercase tracking-wide text-slate-400">Convênios</p><p className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-white">{data.projects.length}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] uppercase tracking-wide text-slate-400">Valor global</p><p className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-white">{formatCompactCurrency(row.total_valor_global)}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] uppercase tracking-wide text-slate-400">Venda</p><p className="mt-1 font-heading text-lg font-bold text-emerald-600">{formatCompactCurrency(row.valor_venda)}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] uppercase tracking-wide text-slate-400">Sync</p><p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(data.last_synced)}</p></div>
              </div>

              {data.projects.map(project => {
                const checklist = data.checklists.filter(item => item.nr_convenio === project.nr_convenio)
                const documentos = data.documentos.filter(item => item.nr_convenio === project.nr_convenio)
                return (
                  <section key={project.nr_convenio} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">Convênio {project.nr_convenio}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{project.situacao || 'Sem situação'}</p>
                      </div>
                      <a className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400" href={`https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${project.nr_convenio}&destino=`} target="_blank" rel="noreferrer">Abrir no TGov ↗</a>
                    </div>
                    {project.objeto && <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{project.objeto}</p>}
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <div><p className="text-slate-400">Global</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{formatCompactCurrency(project.valor_global)}</p></div>
                      <div><p className="text-slate-400">Desembolsado</p><p className="mt-1 font-semibold text-blue-700 dark:text-blue-300">{formatCompactCurrency(project.valor_desembolsado)}</p></div>
                      <div><p className="text-slate-400">Saldo</p><p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{formatCompactCurrency(project.saldo_conta)}</p></div>
                      <div><p className="text-slate-400">Fim / PC</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{formatDate(project.dia_limite_prest_contas || project.data_fim_vigencia)}</p></div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Checklist</h3><span className="text-[11px] text-slate-400">{checklist.filter(item => ['concluido', 'nao_aplicavel'].includes(item.status)).length}/{checklist.length}</span></div>
                        <div className="space-y-2">
                          {checklist.map(item => {
                            const key = `checklist:${project.nr_convenio}:${item.item_key}`
                            return <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                              <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-700 dark:text-slate-300">{item.item_label}</span>{canWrite ? <select value={item.status} disabled={savingKey === key} onChange={event => void updateItem('checklist', project.nr_convenio, item.item_key, event.target.value, item.note)} className={`rounded-full border-0 px-2 py-1 text-[10px] font-semibold ${OPERACAO_CHECKLIST_STYLES[item.status]}`} aria-label={`Status de ${item.item_label}`}>{checklistStatuses.map(status => <option key={status} value={status}>{formatOperacaoStatus(status)}</option>)}</select> : <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${OPERACAO_CHECKLIST_STYLES[item.status]}`}>{formatOperacaoStatus(item.status)}</span>}</div>
                              {item.note && <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>}
                            </div>
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Documentos</h3><span className="text-[11px] text-slate-400">{documentos.filter(item => ['aprovado', 'nao_aplicavel'].includes(item.status)).length}/{documentos.length}</span></div>
                        <div className="space-y-2">
                          {documentos.map(item => {
                            const key = `documento:${project.nr_convenio}:${item.document_key}`
                            return <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                              <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-700 dark:text-slate-300">{item.document_label}</span>{canWrite ? <select value={item.status} disabled={savingKey === key} onChange={event => void updateItem('documento', project.nr_convenio, item.document_key, event.target.value, item.note)} className={`rounded-full border-0 px-2 py-1 text-[10px] font-semibold ${OPERACAO_DOCUMENTO_STYLES[item.status]}`} aria-label={`Status de ${item.document_label}`}>{documentStatuses.map(status => <option key={status} value={status}>{formatOperacaoStatus(status)}</option>)}</select> : <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${OPERACAO_DOCUMENTO_STYLES[item.status]}`}>{formatOperacaoStatus(item.status)}</span>}</div>
                              {item.note && <p className="mt-1 text-[11px] text-slate-400">{item.note}</p>}
                            </div>
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                )
              })}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Histórico do TransfereGov</h3><p className="mt-1 text-[11px] text-slate-400">Linha do tempo somente leitura, alimentada pelo sync.</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">Fonte única</span></div>
                {data.history.length === 0 && data.events.length === 0 ? <p className="text-xs text-slate-400">Sem histórico disponível para este convênio.</p> : <div className="space-y-3">{[...data.history.map(item => ({ date: item.data_historico, title: item.situacao || 'Atualização TGov', note: item.source })), ...data.events.map(item => ({ date: item.occurred_at, title: `${item.event_type === 'checklist_updated' ? 'Checklist atualizado' : 'Documento atualizado'} · ${item.to_status || ''}`, note: item.note || 'Operação' }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15).map((item, index) => <div key={`${item.date}-${index}`} className="flex gap-3"><div className="mt-1.5 h-2 w-2 flex-none rounded-full bg-blue-500 ring-4 ring-blue-500/10" /><div><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.title}</p><p className="mt-0.5 text-[11px] text-slate-400">{formatDate(item.date)} · {item.note}</p></div></div>)}</div>}
              </section>
            </>
          )}
        </div>
        <div className="border-t border-slate-200 bg-white px-6 py-3 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-900">Fonte: TransfereGov sync · Estado operacional editável separado dos fatos governamentais</div>
      </aside>
    </div>
  )
}

export default function OperacaoClient({ userRole }: { userRole: string }) {
  const initialPanel: OperacaoPainel = userRole === 'coord_prestacao' || userRole === 'assistente_prestacao' ? 'prestacao_contas' : 'execucao'
  const [panel, setPanel] = useState<OperacaoPainel>(initialPanel)
  const [rows, setRows] = useState<OperacaoRow[]>([])
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<OperacaoEtapa | ''>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [selected, setSelected] = useState<OperacaoRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ panel })
      if (search) params.set('search', search)
      const response = await fetch(`/api/operacao?${params}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a operação')
      setRows(payload.rows || [])
      setLastSynced(payload.last_synced || null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a operação')
    } finally {
      setLoading(false)
    }
  }, [panel, search])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const visibleRows = useMemo(() => stage ? rows.filter(row => row.etapa === stage) : rows, [rows, stage])
  const attentionRows = rows.filter(row => row.checklist_done < row.checklist_total || row.documentos_done < row.documentos_total || row.etapa === 'Atenção').length
  const commercialRows = rows.filter(row => Number(row.valor_venda) > 0).length
  const completeRows = rows.filter(row => row.checklist_done >= row.checklist_total && row.documentos_done >= row.documentos_total).length

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0d1b2a] px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">S4 · controle operacional</p><h1 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Execução que vira rotina.</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Uma fila para acompanhar execução e prestação de contas, com a visão comercial ao lado e o dado governamental no centro.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left lg:min-w-[240px]"><p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Fonte única</p><p className="mt-1 text-sm font-semibold text-white">TransfereGov sync</p><p className="mt-1 text-xs text-slate-400">Último sync: {formatDate(lastSynced)}</p></div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">{(['execucao', 'prestacao_contas'] as OperacaoPainel[]).map(item => <button key={item} onClick={() => setPanel(item)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${panel === item ? 'bg-[#0d1b2a] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{panelLabels[item]}</button>)}</div><span className="text-xs text-slate-400">{visibleRows.length} proponentes no painel · clique para abrir a área v1</span></div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard eyebrow="Fila atual" value={String(rows.length)} caption={panelLabels[panel]} accent="bg-blue-500" /><MetricCard eyebrow="Requer atenção" value={String(attentionRows)} caption="Checklist, documento ou etapa" accent="bg-amber-400" /><MetricCard eyebrow="Comercial conectado" value={String(commercialRows)} caption="Venda fechada identificada" accent="bg-emerald-500" /><MetricCard eyebrow="Base organizada" value={String(completeRows)} caption="Checklist e documentos concluídos" accent="bg-cyan-500" /></div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row"><div className="relative flex-1"><svg className="absolute left-3 top-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar proponente, CNPJ ou convênio" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-900" /></div><select value={stage} onChange={event => setStage(event.target.value as OperacaoEtapa | '')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{stageOptions.map(option => <option key={option || 'all'} value={option}>{option || 'Todas as etapas'}</option>)}</select><button onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Atualizar</button></div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
      {loading ? <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-slate-700">Consultando a fonte sincronizada...</div> : visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-slate-700">Nenhum item encontrado neste painel.</div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left"><thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"><tr>{['Proponente', 'Etapa TGov', 'Comercial', 'Financeiro', 'Próximo prazo', 'Controle v1'].map(label => <th key={label} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</th>)}</tr></thead><tbody>{visibleRows.map(row => { const deadline = deadlineLabel(row); return <tr key={row.cnpj} onClick={() => setSelected(row)} className="cursor-pointer border-b border-slate-100 transition hover:bg-blue-50/40 dark:border-slate-800 dark:hover:bg-blue-500/5"><td className="px-4 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#0d1b2a] text-xs font-bold text-cyan-300">{(row.nome_proponente || '?').slice(0, 1).toUpperCase()}</div><div><p className="max-w-[250px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{row.nome_proponente || 'Sem nome'}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{formatCNPJ(row.cnpj)} · {row.total_convenios} convênio(s)</p></div></div></td><td className="px-4 py-4"><div className="space-y-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${OPERACAO_ETAPA_STYLES[row.etapa]}`}>{row.etapa}</span><p className="max-w-[175px] truncate text-[11px] text-slate-400" title={row.situacao_tgov || ''}>{row.situacao_tgov || 'Sem situação'}</p></div></td><td className="px-4 py-4"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{row.commercial_status || 'Não Contatado'}</p><p className="mt-1 text-[11px] text-slate-400">{row.tipo_servico || 'Serviço não informado'}</p></td><td className="px-4 py-4"><p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{formatCompactCurrency(row.total_valor_global)}</p><p className="mt-1 text-[11px] text-blue-600 dark:text-blue-300">{formatCompactCurrency(row.total_desembolsado)} desembolsado</p></td><td className="px-4 py-4"><span className={`text-xs font-semibold ${deadline.tone}`}>{deadline.value}</span><p className="mt-1 text-[11px] text-slate-400">{formatDate(row.dia_limite_prest_contas || row.data_fim_vigencia)}</p></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><ProgressPill done={row.checklist_done} total={row.checklist_total} label="check" /><ProgressPill done={row.documentos_done} total={row.documentos_total} label="docs" /></div><p className="mt-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400">Abrir detalhe →</p></td></tr> })}</tbody></table></div></div>}

      {selected && <DetailPanel cnpj={selected.cnpj} row={selected} userRole={userRole} onClose={() => setSelected(null)} />}
    </div>
  )
}
