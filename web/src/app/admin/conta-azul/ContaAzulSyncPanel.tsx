'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Run = {
  id: string
  trigger_type: 'cron' | 'manual' | 'web'
  status: 'running' | 'completed' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  error_message: string | null
  total_items: number
  success_items: number
  failed_items: number
  metadata: {
    phase?: string
    progress?: { done: number; total: number }
    api_calls?: number
    conferencia?: { ok: boolean; varredura_completa?: boolean; checks?: { tipo: string; campo: string; diferenca: number; ok: boolean }[] }
    detalhes?: { orcamento_esgotado?: boolean }
  }
}

type SyncStatus = { running: Run | null; runs?: Run[] }

const STATUS_LABEL: Record<Run['status'], { label: string; cls: string }> = {
  running: { label: 'Em andamento', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
  completed: { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  partial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  failed: { label: 'Falhou', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
}

const TRIGGER_LABEL: Record<Run['trigger_type'], string> = { cron: 'Agendada', manual: 'Manual', web: 'Botão' }

const PHASE_LABEL: Record<string, string> = {
  iniciando: 'Iniciando',
  dimensoes: 'Categorias e contas',
  saldos: 'Saldos',
  varredura: 'Varredura de títulos',
  detalhes: 'Lançamentos e baixas',
  pessoas: 'Clientes e fornecedores',
  conferencia: 'Conferência',
  concluido: 'Concluído',
  falhou: 'Falhou',
}

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function duration(run: Run) {
  if (!run.finished_at) return '—'
  const s = Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`
}

function note(run: Run) {
  if (run.error_message) return run.error_message
  const conf = run.metadata.conferencia
  if (run.metadata.detalhes?.orcamento_esgotado) return 'Tempo esgotado; a próxima execução continua.'
  if (conf && !conf.ok) {
    if (conf.varredura_completa === false) return 'Varredura incompleta; totais não conferidos.'
    const bad = (conf.checks ?? []).filter((c) => !c.ok)
    return bad.map((c) => `${c.tipo === 'RECEITA' ? 'Receber' : 'Pagar'} ${c.campo}: ${c.diferenca.toLocaleString('pt-BR')}`).join(' · ')
  }
  if (conf?.ok) return 'Totais conferidos com o Conta Azul.'
  return ''
}

export default function ContaAzulSyncPanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<SyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/financeiro/sync?history=1', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar as sincronizações')
      setData(body)
      setError(null)
      return body as SyncStatus
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return null
    }
  }, [])

  const poll = useCallback(async () => {
    const body = await load()
    if (timer.current) clearTimeout(timer.current)
    if (body?.running) timer.current = setTimeout(() => void poll(), 3000)
  }, [load])

  useEffect(() => {
    void poll()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [poll])

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/financeiro/sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao iniciar a sincronização')
      await poll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar')
    } finally {
      setStarting(false)
    }
  }

  const running = data?.running
  const progress = running?.metadata.progress

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Sincronização financeira</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Roda todo dia às 05:00 e alimenta o BI Financeiro.</p>
        </div>
        <button
          type="button"
          disabled={!enabled || starting || Boolean(running)}
          onClick={() => void start()}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {running && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          {PHASE_LABEL[running.metadata.phase ?? ''] ?? 'Em andamento'}
          {progress && progress.total > 0 && (
            <span className="tabular-nums"> · {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} lançamentos</span>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      {data?.runs && data.runs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Início</th>
                <th className="px-3 py-2 text-left font-semibold">Origem</th>
                <th className="px-3 py-2 text-left font-semibold">Situação</th>
                <th className="px-3 py-2 text-right font-semibold">Lançamentos</th>
                <th className="px-3 py-2 text-right font-semibold">Duração</th>
                <th className="px-3 py-2 text-left font-semibold">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">{fmt(run.started_at)}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{TRIGGER_LABEL[run.trigger_type] ?? run.trigger_type}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_LABEL[run.status].cls}`}>
                      {STATUS_LABEL[run.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {run.status === 'running' ? '—' : run.success_items.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{duration(run)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs">{note(run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhuma sincronização ainda. A primeira importa todo o histórico e leva cerca de 7 minutos.
        </p>
      )}
    </div>
  )
}
