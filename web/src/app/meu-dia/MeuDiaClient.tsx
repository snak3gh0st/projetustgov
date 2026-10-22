'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import StatusPill from '@/components/ui/StatusPill'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import SectionTabs from '@/components/SectionTabs'
import { Tag, TAG_TONE } from '@/components/leads/list-ui'
import { formatCNPJ } from '@/lib/format'
import { LEAD_TAB_LABEL } from '@/lib/lead-tabs'
import { calendarDaysBetween, type MeuDia, type MeuDiaFunil, type MeuDiaItem } from '@/lib/meu-dia'

const REFRESH_MS = 60_000

type Filtro = 'todos' | MeuDiaFunil

const FUNIS: MeuDiaFunil[] = ['aprovacao', 'execucao', 'prestacao_contas']

const FUNIL_TONE: Record<MeuDiaFunil, keyof typeof TAG_TONE> = {
  aprovacao: 'sky',
  execucao: 'teal',
  prestacao_contas: 'violet',
}

// Ordem de prioridade do dia: quem acabou de chegar, quem está esfriando, quem já tem reunião.
const COLUMNS: { key: keyof MeuDia; title: string; hint: string; empty: string }[] = [
  {
    key: 'novos',
    title: 'Novos para você',
    hint: 'Atribuídos nos últimos 7 dias, sem contato ainda',
    empty: 'Nenhum lead novo esperando o primeiro contato.',
  },
  {
    key: 'parados',
    title: 'Parados',
    hint: 'Mais de 7 dias sem contato',
    empty: 'Nenhum lead parado. Todos tiveram contato na última semana.',
  },
  {
    key: 'reunioes',
    title: 'Reunião agendada',
    hint: 'Leads com reunião marcada',
    empty: 'Nenhuma reunião marcada.',
  },
]

function daysLabel(days: number): string {
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

function motivoLabel(item: MeuDiaItem): string {
  if (item.motivo === 'novo' && item.atribuido_em) {
    return `Chegou ${daysLabel(calendarDaysBetween(new Date(item.atribuido_em), new Date()))}`
  }
  if (item.motivo === 'parado') return `${item.dias_sem_contato} dias`
  if (item.dias_sem_contato != null) return `Contato ${daysLabel(item.dias_sem_contato)}`
  return ''
}

const todayLabel = () => {
  // Fuso fixo: o servidor (UTC) e o navegador mostram a mesma data, inclusive à noite.
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ItemRow({ item, index }: { item: MeuDiaItem; index: number }) {
  const place = [item.municipio, item.uf].filter(Boolean).join(', ')
  const nome = item.nome || formatCNPJ(item.cnpj)
  const motivo = motivoLabel(item)
  return (
    <m.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.025, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/lead/${encodeURIComponent(item.cnpj)}`}
        title={`Abrir card de ${nome}`}
        className="block px-4 py-2.5 transition-colors duration-fast hover:bg-raised focus:outline-none focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
      >
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{nome}</p>
          {motivo && (
            <span className={`shrink-0 text-xs tabular-nums ${item.motivo === 'parado' ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-ink-3'}`}>
              {motivo}
            </span>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <Tag tone={FUNIL_TONE[item.funil]}>{LEAD_TAB_LABEL[item.funil]}</Tag>
          {/* Em Novos e Reunião o status é o próprio motivo da coluna; só Parados varia. */}
          {item.motivo === 'parado' && <StatusPill status={item.status} />}
          {place && <span className="min-w-0 truncate text-xs text-ink-3">{place}</span>}
        </div>
      </Link>
    </m.li>
  )
}

function ColumnSkeleton() {
  return (
    <div className="space-y-4 px-4 py-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function MeuDiaClient() {
  const toast = useToast()
  const [data, setData] = useState<MeuDia | null>(null)
  const [failed, setFailed] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const loadingRef = useRef(false)

  const load = useCallback(async (silent: boolean) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const res = await fetch('/api/meu-dia', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
      setFailed(false)
    } catch {
      setFailed(true)
      if (!silent) toast.error('Não foi possível carregar o seu dia. Tente de novo.')
    } finally {
      loadingRef.current = false
    }
  }, [toast])

  // Recarrega ao voltar para a aba e a cada minuto: o item some quando o lead deixa de cumprir a regra.
  useEffect(() => {
    void load(false)
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  const all = useMemo(() => (data ? [...data.novos, ...data.parados, ...data.reunioes] : []), [data])
  const total = all.length

  const filterTabs = useMemo(() => [
    { id: 'todos', label: 'Todos', count: total },
    ...FUNIS.map((f) => ({ id: f, label: LEAD_TAB_LABEL[f], count: all.filter((i) => i.funil === f).length })),
  ], [all, total])

  const visible = (key: keyof MeuDia) => {
    const items = data?.[key] ?? []
    return filtro === 'todos' ? items : items.filter((i) => i.funil === filtro)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meu dia"
        description={todayLabel()}
        actions={data && total > 0 ? (
          <SectionTabs ariaLabel="Funil" value={filtro} onChange={(v) => setFiltro(v as Filtro)} tabs={filterTabs} />
        ) : undefined}
      />

      {failed && !data ? (
        <Panel>
          <EmptyState
            title="Não deu para carregar o seu dia"
            description="Confira a conexão e tente de novo."
            action={<Button size="sm" variant="primary" onClick={() => void load(false)}>Carregar de novo</Button>}
          />
        </Panel>
      ) : data && total === 0 ? (
        <Panel>
          <EmptyState
            title="Tudo em dia"
            description="Nenhum lead novo, parado ou com reunião marcada agora. Os próximos aparecem aqui assim que chegarem."
            icon={
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const items = visible(column.key)
            const headingId = `meu-dia-${column.key}`
            return (
              <section key={column.key} aria-labelledby={headingId} className="overflow-hidden rounded-xl border border-line bg-surface">
                <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="min-w-0">
                    <h2 id={headingId} className="text-sm font-semibold text-ink">{column.title}</h2>
                    <p className="mt-0.5 text-xs text-ink-3">{column.hint}</p>
                  </div>
                  {data && (
                    <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-2">
                      {items.length}
                    </span>
                  )}
                </header>
                {!data ? (
                  <ColumnSkeleton />
                ) : items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-3">{column.empty}</p>
                ) : (
                  <ul className="divide-y divide-line lg:max-h-[calc(100dvh-15rem)] lg:overflow-y-auto">
                    {items.map((item, index) => (
                      <ItemRow key={`${item.funil}-${item.cnpj}`} item={item} index={index} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
