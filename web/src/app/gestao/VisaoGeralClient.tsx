'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCompactCurrency, formatNumber } from '@/lib/format'

// Visão geral da diretoria: poucos números por área, todos de APIs que já existem, e o link para o BI de cada uma.

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error' }

function useApi<T>(url: string): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: 'loading' })
  useEffect(() => {
    let cancelled = false
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: T) => { if (!cancelled) setResult({ state: 'ok', data }) })
      .catch(() => { if (!cancelled) setResult({ state: 'error' }) })
    return () => { cancelled = true }
  }, [url])
  return result
}

interface CrmDashboard {
  global: { total_leads: number; total_unassigned: number; total_valor_emenda: number; by_status: Record<string, number> }
  execucao_pipeline: { total_cnpjs: number; total_alertas: number }
}
interface TgovPipeline { byStatus: { status: string; count: number }[] }
interface FinanceOverview {
  saldo: { total: number | null }
  receber: { aberto: number; vencido: number }
  pagar: { atrasados: { total: number } }
  resultado: { mtd: { atual: number } }
}
interface CsmBi { totals: { total_projetos: number; total_saldo_conta: number; total_a_liberar: number; total_rendimento: number } }

const currency = (n: number) => formatCompactCurrency(n)

function AreaBlock({
  title,
  href,
  linkLabel,
  load,
  children,
  emptyText,
}: {
  title: string
  href: string
  linkLabel: string
  load: Load<unknown>
  children: React.ReactNode
  emptyText: string
}) {
  return (
    <section aria-labelledby={`area-${href}`} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id={`area-${href}`} className="text-sm font-semibold text-ink">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline focus:outline-none focus-visible:underline">
          {linkLabel}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      </header>
      <div className="flex-1 px-5 py-4">
        {load.state === 'loading' ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : load.state === 'error' ? (
          <p className="text-sm text-ink-3">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, format, tone = 'ink' }: { label: string; value: number; format?: (n: number) => string; tone?: 'ink' | 'warn' }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === 'warn' && value > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-ink'}`}>
        <AnimatedNumber value={value} format={format} />
      </dd>
    </div>
  )
}

// Barra empilhada do funil comercial: proporção de cada fase sobre o total de leads.
function FunnelBar({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (total === 0) return null
  return (
    <div className="mt-4 space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.map((p) => (p.value > 0 ? <span key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${p.className}`} />
            {p.label} <span className="tabular-nums text-ink-3">{formatNumber(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ComercialBlock() {
  const load = useApi<CrmDashboard>('/api/dashboard-crm')
  const s = load.state === 'ok' ? load.data.global.by_status : {}
  const n = (k: string) => Number(s[k]) || 0
  const prospeccao = n('Não Contatado') + n('Contatado') + n('Em Atendimento') + n('Reunião Agendada')
  const vendas = n('Vendas Aprovação') + n('Execução/Prestação')
  return (
    <AreaBlock title="Comercial" href="/bi" linkLabel="Abrir BI comercial" load={load} emptyText="Não foi possível carregar o funil comercial.">
      {load.state === 'ok' && (
        <>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="Leads no funil" value={load.data.global.total_leads} />
            <Stat label="Vendas concluídas" value={vendas} />
            <Stat label="Sem dono" value={load.data.global.total_unassigned} tone="warn" />
          </dl>
          <FunnelBar
            parts={[
              { label: 'Prospecção', value: prospeccao, className: 'bg-sky-500' },
              { label: 'Proposta', value: n('Proposta Enviada'), className: 'bg-indigo-500' },
              { label: 'Aprovação', value: n('Aprovação'), className: 'bg-violet-500' },
              { label: 'Vendas', value: vendas, className: 'bg-emerald-500' },
              { label: 'Sem interesse', value: n('Sem Interesse'), className: 'bg-ink-3' },
            ]}
          />
        </>
      )}
    </AreaBlock>
  )
}

function SituacaoList({ title, rows }: { title: string; rows: { status: string; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <div>
      <p className="flex items-baseline justify-between text-xs text-ink-3">
        {title}
        <span className="text-lg font-semibold tabular-nums text-ink"><AnimatedNumber value={total} /></span>
      </p>
      <ul className="mt-2 space-y-1">
        {rows.slice(0, 3).map((r) => (
          <li key={r.status} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-ink-2" title={r.status}>{r.status}</span>
            <span className="tabular-nums text-ink">{formatNumber(r.count)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-xs text-ink-3">Nenhum instrumento.</li>}
      </ul>
    </div>
  )
}

function OperacaoBlock() {
  const aprovacao = useApi<TgovPipeline>('/api/tgov/pipeline?tab=aprovacao')
  const execucao = useApi<TgovPipeline>('/api/tgov/pipeline?tab=execucao')
  const load: Load<unknown> =
    aprovacao.state === 'loading' || execucao.state === 'loading' ? { state: 'loading' }
      : aprovacao.state === 'error' && execucao.state === 'error' ? { state: 'error' }
        : { state: 'ok', data: null }
  return (
    <AreaBlock title="Operação TransfereGov" href="/tgov" linkLabel="Abrir análises" load={load} emptyText="Não foi possível carregar os instrumentos.">
      <div className="grid gap-5 sm:grid-cols-2">
        <SituacaoList title="Em aprovação" rows={aprovacao.state === 'ok' ? aprovacao.data.byStatus : []} />
        <SituacaoList title="Em execução" rows={execucao.state === 'ok' ? execucao.data.byStatus : []} />
      </div>
    </AreaBlock>
  )
}

function FinanceiroBlock() {
  const load = useApi<FinanceOverview>('/api/financeiro/overview')
  return (
    <AreaBlock title="Financeiro" href="/financeiro" linkLabel="Abrir BI financeiro" load={load} emptyText="Sem dados do Conta Azul. Confira a conexão em Conta Azul.">
      {load.state === 'ok' && (
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Saldo em conta" value={load.data.saldo.total ?? 0} format={currency} />
          <Stat label="Receita no mês" value={load.data.resultado.mtd.atual} format={currency} />
          <Stat label="A receber em aberto" value={load.data.receber.aberto} format={currency} />
          <Stat label="Contas a pagar atrasadas" value={load.data.pagar.atrasados.total} format={currency} tone="warn" />
        </dl>
      )}
    </AreaBlock>
  )
}

function CsmBlock() {
  const load = useApi<CsmBi>('/api/csm/bi')
  return (
    <AreaBlock title="CSM" href="/csm/bi" linkLabel="Abrir BI CSM" load={load} emptyText="Não foi possível carregar a carteira do CSM.">
      {load.state === 'ok' && (
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Projetos na carteira" value={load.data.totals.total_projetos} />
          <Stat label="Saldo em conta dos clientes" value={load.data.totals.total_saldo_conta} format={currency} />
          <Stat label="A liberar" value={load.data.totals.total_a_liberar} format={currency} />
          <Stat label="Rendimento" value={load.data.totals.total_rendimento} format={currency} />
        </dl>
      )}
    </AreaBlock>
  )
}

const todayLabel = () => {
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function VisaoGeralClient() {
  return (
    <div className="space-y-5">
      <PageHeader title="Visão geral" description={todayLabel()} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComercialBlock />
        <OperacaoBlock />
        <FinanceiroBlock />
        <CsmBlock />
      </div>
    </div>
  )
}
