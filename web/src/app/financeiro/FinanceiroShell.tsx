'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { money, relativeStamp } from '@/components/financeiro/format'
import { Panel, Pill, REFRESH_EVENT } from '@/components/financeiro/ui'

type Run = {
  id: string
  status: 'running' | 'completed' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  error_message: string | null
  metadata: {
    phase?: string
    progress?: { done: number; total: number }
    conferencia?: { ok: boolean; varredura_completa?: boolean; checks?: { tipo: string; campo: string; diferenca: number; ok: boolean }[] }
    detalhes?: { orcamento_esgotado?: boolean; cota_excedida?: boolean }
  }
}

type SyncStatus = {
  connection: { status: string; companyName: string | null } | null
  running: Run | null
  lastFinished: Run | null
  lastSuccessful: Run | null
}

const TABS = [
  { href: '/financeiro', label: 'Visão geral' },
  { href: '/financeiro/resultado', label: 'Resultado' },
  { href: '/financeiro/caixa', label: 'Caixa' },
  { href: '/financeiro/pagar-receber', label: 'Pagar e receber' },
  { href: '/financeiro/clientes', label: 'Clientes e CRM' },
]

const PHASES: Record<string, string> = {
  iniciando: 'iniciando',
  dimensoes: 'categorias e contas',
  saldos: 'saldos',
  pessoas: 'clientes e fornecedores',
  varredura: 'varredura de títulos',
  detalhes: 'lançamentos',
  conferencia: 'conferência',
}

const STALE_MS = 26 * 3600_000

export default function FinanceiroShell({ canSync, children }: { canSync: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const wasRunning = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/financeiro/sync', { cache: 'no-store' })
      const body = (await res.json()) as SyncStatus & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Falha ao ler o status')
      setStatus(body)
      if (wasRunning.current && !body.running) window.dispatchEvent(new Event(REFRESH_EVENT))
      wasRunning.current = Boolean(body.running)
      if (timer.current) clearTimeout(timer.current)
      if (body.running) timer.current = setTimeout(() => void load(), 3000)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Falha ao ler o status')
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [load])

  async function sync() {
    setStarting(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/financeiro/sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Não foi possível iniciar a sincronização')
      await load()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally {
      setStarting(false)
    }
  }

  const conn = status?.connection
  const running = status?.running
  const last = status?.lastSuccessful
  const finished = status?.lastFinished
  const expired = conn && conn.status !== 'active'
  const stale = last?.finished_at ? Date.now() - new Date(last.finished_at).getTime() > STALE_MS : false
  const conf = finished?.metadata.conferencia
  const divergent = finished?.status === 'partial' && conf && conf.varredura_completa !== false && !conf.ok
  const importing = finished?.status === 'partial' && (finished.metadata.detalhes?.orcamento_esgotado || finished.metadata.detalhes?.cota_excedida)

  let dot = 'bg-emerald-600 dark:bg-emerald-400'
  let stamp = last ? `Atualizado ${relativeStamp(last.finished_at)}` : 'Ainda sem dados'
  if (running) {
    const p = running.metadata.progress
    dot = 'bg-blue-600 animate-pulse'
    stamp = `Sincronizando ${PHASES[running.metadata.phase ?? ''] ?? ''}${p && p.total ? ` · ${p.done.toLocaleString('pt-BR')} de ${p.total.toLocaleString('pt-BR')}` : ''}`
  } else if (expired) {
    dot = 'bg-red-600 dark:bg-red-400'
    stamp = 'Conexão com o Conta Azul expirada'
  } else if (stale || divergent) {
    dot = 'bg-amber-500'
  }

  let body: React.ReactNode = children
  if (status && !conn) {
    body = (
      <Panel>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">Conecte o Conta Azul para ver o financeiro</h2>
        <p className="mt-1 max-w-prose text-sm text-slate-600 dark:text-gray-400">
          Os números desta área vêm do Conta Azul da empresa. Depois de conectar, a primeira sincronização importa todo o histórico.
        </p>
        {canSync && (
          <Link href="/admin/conta-azul" className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#0072F7] px-4 text-sm font-semibold text-white hover:bg-[#0058C4]">
            Conectar Conta Azul
          </Link>
        )}
      </Panel>
    )
  } else if (status && !last) {
    const p = running?.metadata.progress
    const ratio = p && p.total ? Math.min(1, p.done / p.total) : 0
    body = (
      <Panel>
        <Pill tone="accent">Primeira sincronização</Pill>
        <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-gray-100">
          {running ? 'Importando o histórico do Conta Azul' : 'Nenhum dado importado ainda'}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-slate-600 dark:text-gray-400">
          {running
            ? 'Estamos trazendo lançamentos, baixas, categorias e contas. Leva alguns minutos; você pode sair desta tela e voltar depois.'
            : 'A sincronização roda todo dia às 05:00. Para ver os números agora, sincronize manualmente.'}
        </p>
        {running && (
          <div className="mt-4 w-full max-w-xl">
            <div className="h-2 overflow-hidden rounded bg-slate-100 dark:bg-gray-800">
              <div className="h-full rounded bg-[#0072F7] transition-[width] duration-300" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            {p && p.total > 0 && (
              <p className="mt-2 text-sm font-semibold tabular-nums text-slate-800 dark:text-gray-200">
                {p.done.toLocaleString('pt-BR')} de {p.total.toLocaleString('pt-BR')} lançamentos
              </p>
            )}
          </div>
        )}
      </Panel>
    )
  }

  return (
    <div className="fin mx-auto flex w-full max-w-[1440px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900 dark:text-gray-50">Financeiro</h1>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-gray-400">{conn?.companyName ?? 'PROJETUS'} · dados do Conta Azul</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300" role="status">
            <span className={`h-2 w-2 flex-none rounded-full ${dot}`} />
            {stamp}
          </span>
          {canSync && conn && !expired && (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={starting || Boolean(running)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-900 transition-colors duration-150 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 4v5h-5" />
              </svg>
              {running ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          )}
        </div>
      </header>

      <nav aria-label="Seções do financeiro" className="-mt-1 flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] dark:border-gray-800">
        {TABS.map((t) => {
          const active = t.href === '/financeiro' ? pathname === '/financeiro' : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`relative whitespace-nowrap px-3 pb-3 pt-2.5 text-sm transition-colors duration-150 ${
                active
                  ? 'font-semibold text-slate-900 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded after:bg-[#0072F7] dark:text-gray-50'
                  : 'font-medium text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>

      {syncError && <Banner tone="bad" text={syncError} />}
      {expired && (
        <Banner
          tone="bad"
          text={`A conexão com o Conta Azul expirou. Os números abaixo param em ${last?.finished_at ? relativeStamp(last.finished_at) : 'a última sincronização'}.`}
          action={canSync ? { href: '/api/integrations/conta-azul/connect', label: 'Reconectar Conta Azul' } : undefined}
          hint={canSync ? undefined : 'Peça a um gestor para reconectar.'}
        />
      )}
      {!expired && stale && last && (
        <Banner tone="warn" text={`Os dados têm mais de 26 horas (${relativeStamp(last.finished_at)}). A sincronização da madrugada não terminou.`} />
      )}
      {!expired && divergent && conf && (
        <Banner
          tone="warn"
          text={`Os totais diferem do Conta Azul (${(conf.checks ?? [])
            .filter((c) => !c.ok)
            .map((c) => `${c.tipo === 'RECEITA' ? 'a receber' : 'a pagar'} ${c.campo === 'itens' ? `${c.diferenca} títulos` : money(c.diferenca)}`)
            .join(', ')}). Normalmente a próxima sincronização corrige.`}
        />
      )}
      {!expired && !divergent && importing && last && (
        <Banner tone="info" text="A importação de lançamentos ainda não terminou; a próxima sincronização continua de onde parou. Os totais abaixo podem estar incompletos." />
      )}

      {body}
    </div>
  )
}

function Banner({
  tone,
  text,
  action,
  hint,
}: {
  tone: 'warn' | 'bad' | 'info'
  text: string
  action?: { href: string; label: string }
  hint?: string
}) {
  const cls =
    tone === 'bad'
      ? 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10'
        : 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10'
  const icon = tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 ${cls}`} role={tone === 'info' ? 'status' : 'alert'}>
      <svg className={`h-5 w-5 flex-none ${icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
      <p className="min-w-[240px] flex-1 text-[13.5px] text-slate-800 dark:text-gray-200">
        {text} {hint}
      </p>
      {action && (
        <a href={action.href} className="inline-flex h-8 items-center rounded-lg bg-[#0072F7] px-3 text-[12.5px] font-semibold text-white hover:bg-[#0058C4]">
          {action.label}
        </a>
      )}
    </div>
  )
}
