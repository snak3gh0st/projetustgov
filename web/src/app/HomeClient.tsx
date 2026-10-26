'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { formatCNPJ, formatCompactCurrency, formatCurrency, formatDate } from '@/lib/format'
import { CRM_STATUS_CANONICAL, CRM_STATUS_FUNNEL_ORDER } from '@/lib/crm-catalog'
import { statusStyle } from '@/lib/status-style'
import { hasTeamCommercialView } from '@/lib/roles'
import SectionTabs from '@/components/SectionTabs'
import { RecentActivityFeed } from '@/components/LeadEvents'
import ConversasSemResposta from '@/components/whatsapp/ConversasSemResposta'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import StatTile from '@/components/dashboard/StatTile'
import FunnelStrip, { type FunnelStage } from '@/components/dashboard/FunnelStrip'
import SituacaoBars from '@/components/dashboard/SituacaoBars'

// --- Types ---
interface StatusCounts {
  'Não Contatado': number
  'Contatado': number
  'Sem Interesse': number
  'Em Atendimento': number
  'Reunião Agendada': number
  'Proposta Enviada': number
  'Aprovação': number
  'Vendas Aprovação': number
  'Execução/Prestação': number
  'Telefone Invalido'?: number
  [key: string]: number | undefined
}

interface GlobalStats {
  total_leads: number
  total_assigned: number
  total_unassigned: number
  total_valor_emenda: number
  by_status: StatusCounts
}

interface ExecucaoPipelineStats {
  total_cnpjs: number
  total_valor_global: number
  total_saldo: number
  total_alertas: number
  by_status: StatusCounts
}

interface VendedorStats {
  vendedor_id: string
  vendedor_nome: string
  total_leads: number
  nao_contatado: number
  sem_interesse: number
  retorno: number
  proposta: number
  vendas_aprovacao: number
  vendas_execucao: number
  fechado: number
  valor_total_emenda: number
  comissao_total: number
  last_activity: string | null
  ligacoes_hoje: number
  propostas_hoje: number
  fechados_hoje: number
}

interface ContactHealth {
  stale_count: number
  never_contacted_count: number
  invalid_phone_count: number
}

interface ExecucaoVendedorStats {
  vendedor_id: string
  vendedor_nome: string
  total_cnpjs: number
  nao_contatado: number
  retorno: number
  proposta: number
  fechado: number
}

interface ExecucaoAlert {
  cnpj: string
  nome: string
  valor_global: number
  total_convenios: number
  alert_count: number
  vigencia_proxima: string | null
  vendedor_nome: string | null
}

interface PrestacaoContasPipelineStats {
  total_cnpjs: number
  total_valor_global: number
  em_risco: number
  concluidas: number
  by_status: { [situacao: string]: number }
  commercial_total: number
  commercial_by_status: StatusCounts
}

interface DashboardData {
  role?: string
  global: GlobalStats
  execucao_pipeline: ExecucaoPipelineStats
  prestacao_contas_pipeline?: PrestacaoContasPipelineStats
  vendedores: VendedorStats[]
  contact_health?: ContactHealth
  execucao_vendedores?: ExecucaoVendedorStats[]
  execucao_alerts?: ExecucaoAlert[]
}

interface SyncLog {
  ran_at: string
  inserted: number
  updated: number
  errors: number
  duration_ms: number
  execucao_inserted?: number
  execucao_updated?: number
  execucao_errors?: number
}

const STATUS_ORDER = CRM_STATUS_FUNNEL_ORDER
// Execução/PC: etapas canônicas, as mesmas das abas Execução e Prestação de Leads (normalizeCrmStatus).
const EXECUCAO_STATUS_ORDER = CRM_STATUS_CANONICAL

const PC_STATUS_ORDER = [
  'Aguardando Prestação de Contas',
  'Prestação de Contas Iniciada Por Antecipação',
  'Prestação de Contas enviada para Análise',
  'Prestação de Contas em Análise',
  'Prestação de Contas em Complementação',
  'Prestação de Contas Comprovada',
  'Prestação de Contas Comprovada em Análise',
  'Prestação de Contas Aprovada com Ressalvas',
  'Prestação de Contas Aprovada',
  'Prestação de Contas Concluída',
  'Prestação de Contas Rejeitada',
] as const

type PipelineTab = 'aprovacao' | 'execucao' | 'prestacao_contas'

const TAB_EASE = [0.16, 1, 0.3, 1] as const

function timeAgo(date: string | null): string {
  if (!date) return 'nunca'
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

const formatMoney = (n: number) => formatCompactCurrency(n)

// Rótulo de etapa no funil: as chaves do funil já são o rótulo, menos as canônicas.
const FUNNEL_LABEL: Record<string, string> = { 'Em Aprovação': 'Aprovação', 'Fechado': 'Vendas concluídas' }
const stageLabel = (status: string) => FUNNEL_LABEL[status] ?? status

function stagesFor(
  statuses: readonly string[],
  counts: Record<string, number | undefined>,
  href: (status: string) => string
): FunnelStage[] {
  return statuses.map((status) => ({
    status,
    label: stageLabel(status),
    count: counts[status] || 0,
    href: href(status),
  }))
}

// --- SyncBar: status da sincronização com o governo (gestor, diretoria e admin) ---
type SyncRunLog = { inserted: number; updated: number; errors: number; ran_at?: string; duration_ms?: number }

const canSyncGov = (role: string | undefined) => hasTeamCommercialView(role) || role === 'admin'

function formatFonte(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function SyncBar({ role, onSynced }: { role: string | undefined; onSynced: () => void }) {
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null)
  const [fonteEm, setFonteEm] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [justFinished, setJustFinished] = useState(false)

  useEffect(() => {
    if (!canSyncGov(role)) return
    fetch('/api/debug-sync')
      .then(r => r.json())
      .then(d => {
        const leads: SyncRunLog | null = d.last_sync_log ?? null
        const execucao: SyncRunLog | null = d.last_execucao_log ?? null
        if (leads) {
          setSyncLog({
            ran_at: leads.ran_at ?? new Date().toISOString(),
            inserted: leads.inserted,
            updated: leads.updated,
            errors: leads.errors,
            duration_ms: leads.duration_ms ?? 0,
            execucao_inserted: execucao?.inserted,
            execucao_updated: execucao?.updated,
            execucao_errors: execucao?.errors,
          })
        }
        setFonteEm(d.fonte_atualizada_em ?? null)
      })
      .catch(() => {})
  }, [role])

  if (!canSyncGov(role)) return null

  const run = (route: string) =>
    fetch(`/api/cron/${route}`).then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))

  const handleSync = async () => {
    setSyncing(true)
    setSyncError(null)
    setJustFinished(false)
    try {
      // Um de cada vez: leads e execução juntos disputam o banco e o download do governo.
      const leads = await run('sync-leads')
      if (!leads.ok) {
        const rawError: string = leads.d?.error || 'Erro ao sincronizar leads'
        setSyncError(leads.status === 409
          ? 'Já existe uma sincronização em andamento. Aguarde terminar.'
          : rawError.includes('bloqueada') || rawError.includes('indisponível')
            ? 'A fonte de dados do governo não respondeu. Nada foi alterado na base.'
            : rawError)
        return
      }
      const execucao = await run('sync-execucao').catch(() => null)

      setSyncLog({
        ran_at: new Date().toISOString(),
        inserted: leads.d.inserted ?? 0,
        updated: leads.d.updated ?? 0,
        errors: leads.d.errors ?? 0,
        duration_ms: leads.d.duration_ms ?? 0,
        execucao_inserted: execucao?.ok ? (execucao.d.inserted ?? 0) : undefined,
        execucao_updated: execucao?.ok ? (execucao.d.updated ?? 0) : undefined,
        execucao_errors: execucao?.ok ? (execucao.d.errors ?? 0) : undefined,
      })
      if (execucao && !execucao.ok) {
        setSyncError(execucao.status === 409
          ? 'Leads sincronizados. A execução já estava sincronizando em outra aba.'
          : 'Leads sincronizados, mas a execução falhou. Tente de novo em alguns minutos.')
      } else {
        setJustFinished(true)
        setTimeout(() => setJustFinished(false), 8000)
      }
      onSynced()
    } catch {
      setSyncError('Erro de conexão ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const dot = syncing ? 'bg-accent animate-pulse' : syncError ? 'bg-red-500' : justFinished ? 'bg-emerald-500' : 'bg-neutral-400'

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm transition-colors duration-base ${
        syncError ? 'bg-red-50 dark:bg-red-500/10' : justFinished ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-raised/70'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {syncing ? (
          <span className="font-medium text-accent-ink">Sincronizando dados do TransfereGov…</span>
        ) : syncError ? (
          <span className="text-red-700 dark:text-red-300">{syncError}</span>
        ) : syncLog ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-2">
            <span className="whitespace-nowrap">Sincronizado {timeAgo(syncLog.ran_at)}</span>
            <span className="hidden text-ink-3 sm:inline">·</span>
            <span className="tabular">
              Leads: <span className="font-medium text-ink">{syncLog.inserted}</span> novos,{' '}
              <span className="font-medium text-ink">{syncLog.updated}</span> atualizados
              {syncLog.errors > 0 && <span className="text-red-600 dark:text-red-400">, {syncLog.errors} erros</span>}
            </span>
            {syncLog.execucao_updated !== undefined && (
              <span className="tabular">
                Execução: <span className="font-medium text-ink">{syncLog.execucao_inserted ?? 0}</span> novos,{' '}
                <span className="font-medium text-ink">{syncLog.execucao_updated}</span> atualizados
                {(syncLog.execucao_errors ?? 0) > 0 && (
                  <span className="text-red-600 dark:text-red-400">, {syncLog.execucao_errors} erros</span>
                )}
              </span>
            )}
            {fonteEm && (
              <span className="text-xs text-ink-3 tabular">Dados do governo de {formatFonte(fonteEm)}</span>
            )}
          </p>
        ) : (
          <span className="text-ink-3">Nenhuma sincronização registrada</span>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleSync}
        loading={syncing}
        icon={
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" /></svg>
        }
      >
        <span className="sr-only sm:not-sr-only">{syncing ? 'Sincronizando' : 'Sincronizar agora'}</span>
      </Button>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Carregando pipeline" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-line bg-surface px-5 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4"><Skeleton className="h-4 w-40" /></div>
        <div className="flex divide-x divide-line">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-1 space-y-3 px-4 py-4">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-1 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionHeading({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-body text-base font-semibold tracking-normal text-ink">{children}</h2>
      {hint && <div className="text-sm">{hint}</div>}
    </div>
  )
}

// Contato pendente: três sinais em uma faixa só, cada um leva à lista de leads.
function ContactHealthStrip({ health }: { health: ContactHealth }) {
  const items = [
    { label: 'Sem contato há mais de 7 dias', value: health.stale_count, tone: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
    { label: 'Nunca contatados', value: health.never_contacted_count, tone: 'text-ink', dot: 'bg-neutral-400' },
    { label: 'Telefone principal inválido', value: health.invalid_phone_count, tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  ].filter(i => i.value > 0)
  if (items.length === 0) return null
  return (
    <section aria-label="Contato pendente" className="grid divide-y divide-line rounded-xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(item => (
        <Link
          key={item.label}
          href="/leads"
          className="flex items-center gap-3 px-5 py-3.5 transition-colors duration-fast hover:bg-raised"
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
          <span className="min-w-0 flex-1 text-sm text-ink-2">{item.label}</span>
          <span className={`font-heading text-xl font-semibold tabular ${item.tone}`}>{item.value.toLocaleString('pt-BR')}</span>
        </Link>
      ))}
    </section>
  )
}

const SELLER_SEGMENTS = [
  { key: 'nao_contatado', status: 'Não Contatado' },
  { key: 'retorno', status: 'Em Atendimento' },
  { key: 'proposta', status: 'Proposta Enviada' },
  { key: 'vendas_aprovacao', status: 'Vendas Aprovação' },
  { key: 'vendas_execucao', status: 'Execução/Prestação' },
  { key: 'sem_interesse', status: 'Sem Interesse' },
] as const

// Desempenho por vendedor em tabela: comparar linhas é a tarefa, não admirar cartões.
function SellerTable({ vendedores, showCommission }: { vendedores: VendedorStats[]; showCommission: boolean }) {
  return (
    <section aria-label="Desempenho por vendedor">
      <SectionHeading
        hint={
          <ul className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3 lg:flex">
            {SELLER_SEGMENTS.map(s => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className={`h-2 w-2 rounded-sm ${statusStyle(s.status).bar}`} />
                {stageLabel(s.status)}
              </li>
            ))}
          </ul>
        }
      >
        Desempenho por vendedor
      </SectionHeading>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-ink-3">
              <th scope="col" className="px-5 py-2.5 font-medium">Vendedor</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th scope="col" className="w-[32%] px-3 py-2.5 font-medium">Distribuição por etapa</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Hoje</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Valor em emendas</th>
              {showCommission && <th scope="col" className="px-3 py-2.5 text-right font-medium">Comissão</th>}
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Última atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {vendedores.map(v => {
              const total = Math.max(1, v.total_leads)
              return (
                <tr key={v.vendedor_id} className="transition-colors duration-fast hover:bg-raised/60">
                  <th scope="row" className="px-5 py-3 text-left font-medium text-ink">{v.vendedor_nome}</th>
                  <td className="px-3 py-3 text-right font-medium text-ink tabular">{v.total_leads.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-3">
                    <div
                      className="flex h-2 overflow-hidden rounded-full bg-line/70"
                      title={SELLER_SEGMENTS.map(s => `${stageLabel(s.status)}: ${v[s.key] ?? 0}`).join(' · ')}
                    >
                      {SELLER_SEGMENTS.map(s => {
                        const n = v[s.key] ?? 0
                        if (!n) return null
                        return <span key={s.key} className={statusStyle(s.status).bar} style={{ width: `${(n / total) * 100}%` }} />
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2 tabular">
                    {v.ligacoes_hoje || v.propostas_hoje || v.fechados_hoje ? (
                      <span className="flex flex-wrap gap-x-2">
                        {v.ligacoes_hoje > 0 && <span>{v.ligacoes_hoje} em atendimento</span>}
                        {v.propostas_hoje > 0 && <span>{v.propostas_hoje} propostas</span>}
                        {v.fechados_hoje > 0 && <span className="text-emerald-700 dark:text-emerald-300">{v.fechados_hoje} fechados</span>}
                      </span>
                    ) : (
                      <span className="text-ink-3">Sem movimento</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-ink tabular">{formatCompactCurrency(v.valor_total_emenda)}</td>
                  {showCommission && (
                    <td className="px-3 py-3 text-right font-medium text-ink tabular">{formatCurrency(v.comissao_total)}</td>
                  )}
                  <td className="px-5 py-3 text-right text-xs text-ink-3">{timeAgo(v.last_activity)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ExecucaoAlerts({ alerts }: { alerts: ExecucaoAlert[] }) {
  return (
    <section aria-label="CNPJs com alerta">
      <SectionHeading
        hint={
          <Link href="/leads?fase=execucao&alert_only=true" className="font-medium text-accent-ink hover:underline">
            Ver todos os alertas
          </Link>
        }
      >
        Convênios sem desembolso
      </SectionHeading>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {alerts.map(a => (
          <li key={a.cnpj}>
            <Link href="/leads?fase=execucao&alert_only=true" className="flex items-center gap-4 px-5 py-3 transition-colors duration-fast hover:bg-raised">
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 tabular dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25">
                {a.alert_count}/{a.total_convenios}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{a.nome || formatCNPJ(a.cnpj)}</span>
                <span className="block text-xs text-ink-3">{a.vendedor_nome || 'Sem dono'}</span>
              </span>
              {a.vigencia_proxima && (
                <span className="hidden text-xs text-ink-3 sm:block">Vigência até {formatDate(a.vigencia_proxima)}</span>
              )}
              <span className="text-sm font-medium text-ink tabular">{formatCompactCurrency(a.valor_global)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ExecSellerTable({ rows }: { rows: ExecucaoVendedorStats[] }) {
  const cols = [
    { key: 'nao_contatado', label: 'Não contatado' },
    { key: 'retorno', label: 'Em atendimento' },
    { key: 'proposta', label: 'Proposta enviada' },
    { key: 'fechado', label: 'Fechados' },
  ] as const
  return (
    <section aria-label="Execução por vendedor">
      <SectionHeading>Execução por vendedor</SectionHeading>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th scope="col" className="px-5 py-2.5 font-medium">Vendedor</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">CNPJs</th>
              {cols.map(c => <th key={c.key} scope="col" className="px-3 py-2.5 text-right font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(v => (
              <tr key={v.vendedor_id} className="transition-colors duration-fast hover:bg-raised/60">
                <th scope="row" className="px-5 py-3 text-left font-medium text-ink">{v.vendedor_nome}</th>
                <td className="px-3 py-3 text-right font-medium text-ink tabular">{v.total_cnpjs}</td>
                {cols.map(c => <td key={c.key} className="px-3 py-3 text-right text-ink-2 tabular">{v[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function CRMDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>('aprovacao')

  const load = useCallback(() => {
    return fetch('/api/dashboard-crm')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(true); return }
        setError(false)
        setData(d)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { void load() }, [load])

  const role = data?.role
  const isVendedor = role === 'vendedor' || role === 'coordenador' || hasTeamCommercialView(role)

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <PageHeader
        title={!data || isVendedor ? 'Meu pipeline' : 'Pipeline da equipe'}
        description={
          !data || isVendedor
            ? 'Campanha Emendas 2026: seus leads, etapas e movimentações.'
            : 'Campanha Emendas 2026: trabalho da equipe de vendas por etapa.'
        }
        actions={
          <SectionTabs
            ariaLabel="Área do pipeline"
            value={pipelineTab}
            onChange={value => setPipelineTab(value as PipelineTab)}
            tabs={[
              { id: 'aprovacao', label: 'Aprovação' },
              { id: 'execucao', label: 'Execução' },
              { id: 'prestacao_contas', label: 'Prestação de contas' },
            ]}
          />
        }
      />

      <SyncBar role={role} onSynced={() => void load()} />

      {loading ? (
        <DashboardSkeleton />
      ) : error || !data ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title="Não foi possível carregar o pipeline"
            description="Verifique a conexão e tente de novo. Se continuar, avise o suporte."
            action={<Button variant="primary" onClick={() => { setLoading(true); void load() }}>Tentar novamente</Button>}
          />
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={pipelineTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: TAB_EASE }}
            className="space-y-6"
          >
            {pipelineTab === 'aprovacao' && (
              <AprovacaoView data={data} isVendedor={isVendedor} />
            )}
            {pipelineTab === 'execucao' && (
              <ExecucaoView data={data} isVendedor={isVendedor} />
            )}
            {pipelineTab === 'prestacao_contas' && (
              <PrestacaoView data={data} />
            )}
          </m.div>
        </AnimatePresence>
      )}

      {/* WhatsApp: só aparece para a gestão e com o canal ligado */}
      <ConversasSemResposta />

      {/* Atividade recente: movimentações reais (lead_events), atualiza a cada minuto */}
      <RecentActivityFeed />
    </div>
  )
}

function AprovacaoView({ data, isVendedor }: { data: DashboardData; isVendedor: boolean }) {
  const { global: g, vendedores, role } = data
  // Comissionamento: visível apenas para o gestor comercial
  const showCommission = hasTeamCommercialView(role)
  const comissaoTotal = vendedores.reduce((sum, v) => sum + (v.comissao_total || 0), 0)
  const pctOf = (n: number) => (g.total_leads > 0 ? `${Math.round((n / g.total_leads) * 100)}% do total` : '0% do total')

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <StatTile label="Leads" value={g.total_leads} href="/leads" hint="No funil de aprovação" />
        {!isVendedor && <StatTile label="Atribuídos" value={g.total_assigned} href="/leads" hint={pctOf(g.total_assigned)} />}
        {!isVendedor && (
          <StatTile
            label="Não atribuídos"
            value={g.total_unassigned}
            href="/distribuir"
            tone={g.total_unassigned > 0 ? 'warn' : 'default'}
            hint={pctOf(g.total_unassigned)}
          />
        )}
        <StatTile label="Valor em emendas" value={g.total_valor_emenda} format={formatMoney} href="/leads" hint={formatCurrency(g.total_valor_emenda)} />
        {showCommission && vendedores.length > 0 && (
          <StatTile label="Comissão de vendas" value={comissaoTotal} format={formatMoney} href="/comissoes" hint={formatCurrency(comissaoTotal)} />
        )}
      </div>

      <FunnelStrip
        title="Funil de aprovação"
        total={g.total_leads}
        totalLabel="leads"
        stages={stagesFor(STATUS_ORDER, g.by_status, status => `/leads?status_contato=${encodeURIComponent(status)}`)}
      />

      {data.contact_health && <ContactHealthStrip health={data.contact_health} />}

      {vendedores.length > 0 && !isVendedor && <SellerTable vendedores={vendedores} showCommission={showCommission} />}
    </>
  )
}

function ExecucaoView({ data, isVendedor }: { data: DashboardData; isVendedor: boolean }) {
  const ex = data.execucao_pipeline
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <StatTile label="CNPJs em execução" value={ex.total_cnpjs} href="/leads?fase=execucao" />
        <StatTile label="Valor dos convênios" value={ex.total_valor_global} format={formatMoney} href="/leads?fase=execucao" hint={formatCurrency(ex.total_valor_global)} />
        <StatTile label="Saldo em conta" value={ex.total_saldo} format={formatMoney} href="/leads?fase=execucao" hint={formatCurrency(ex.total_saldo)} />
        <StatTile
          label="Alertas ativos"
          value={ex.total_alertas}
          href="/leads?fase=execucao&alert_only=true"
          tone={ex.total_alertas > 0 ? 'warn' : 'default'}
          hint={ex.total_cnpjs > 0 ? `${Math.round((ex.total_alertas / ex.total_cnpjs) * 100)}% dos CNPJs` : undefined}
        />
      </div>

      <FunnelStrip
        title="Funil de execução"
        description="CNPJs com convênios em execução no TransfereGov."
        total={ex.total_cnpjs}
        totalLabel="CNPJs"
        stages={stagesFor(EXECUCAO_STATUS_ORDER, ex.by_status, status => `/leads?fase=execucao&status=${encodeURIComponent(status)}`)}
      />

      {data.execucao_alerts && data.execucao_alerts.length > 0 && <ExecucaoAlerts alerts={data.execucao_alerts} />}

      {data.execucao_vendedores && data.execucao_vendedores.length > 0 && !isVendedor && (
        <ExecSellerTable rows={data.execucao_vendedores} />
      )}
    </>
  )
}

function PrestacaoView({ data }: { data: DashboardData }) {
  const pc = data.prestacao_contas_pipeline
  if (!pc) return null
  const situacoes = PC_STATUS_ORDER
    .filter(s => (pc.by_status[s] || 0) > 0)
    .map(s => ({ label: s.replace('Prestação de Contas', 'PC'), count: pc.by_status[s] || 0 }))
  const pcHref = '/leads?fase=prestacao_contas'
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <StatTile label="CNPJs em prestação de contas" value={pc.total_cnpjs} href={pcHref} />
        <StatTile label="Valor global" value={pc.total_valor_global} format={formatMoney} href={pcHref} hint={formatCurrency(pc.total_valor_global)} />
        <StatTile label="Em risco" value={pc.em_risco} href={pcHref} tone={pc.em_risco > 0 ? 'danger' : 'default'} hint="Rejeitada ou em complementação" />
        <StatTile label="Concluídas" value={pc.concluidas} href={pcHref} tone="good" hint="Aprovada ou concluída" />
      </div>

      <FunnelStrip
        title="Funil de prestação de contas"
        description="Mesmo status comercial da Execução: os dois serviços são vendidos juntos."
        total={pc.commercial_total}
        totalLabel="CNPJs"
        stages={stagesFor(EXECUCAO_STATUS_ORDER, pc.commercial_by_status, status => `${pcHref}&status=${encodeURIComponent(status)}`)}
      />

      {situacoes.length > 0 && (
        <SituacaoBars
          title="Situação no TransfereGov"
          description="Etapa da prestação de contas de cada convênio."
          items={situacoes}
          href={pcHref}
        />
      )}
    </>
  )
}
