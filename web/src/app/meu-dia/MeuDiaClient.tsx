'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import StatusPill from '@/components/ui/StatusPill'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Tag, TAG_TONE } from '@/components/leads/list-ui'
import { formatCNPJ } from '@/lib/format'
import { LEAD_TAB_LABEL } from '@/lib/lead-tabs'
import type { MeuDia, MeuDiaFunil, MeuDiaItem } from '@/lib/meu-dia'

const REFRESH_MS = 60_000

const FUNIL_TONE: Record<MeuDiaFunil, keyof typeof TAG_TONE> = {
  aprovacao: 'sky',
  execucao: 'teal',
  prestacao_contas: 'violet',
}

const SECTIONS: { key: keyof MeuDia; title: string; description: string; empty: string }[] = [
  {
    key: 'novos',
    title: 'Novos leads para você',
    description: 'Atribuídos nos últimos 7 dias e ainda sem contato.',
    empty: 'Nenhum lead novo esperando o primeiro contato.',
  },
  {
    key: 'parados',
    title: 'Leads parados',
    description: 'Mais de 7 dias sem contato.',
    empty: 'Nenhum lead parado. Todos tiveram contato na última semana.',
  },
  {
    key: 'reunioes',
    title: 'Reunião agendada',
    description: 'Leads com reunião marcada.',
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
    const days = Math.floor((Date.now() - new Date(item.atribuido_em).getTime()) / 86_400_000)
    return `Atribuído ${daysLabel(days)}`
  }
  if (item.motivo === 'parado') return `${item.dias_sem_contato} dias sem contato`
  if (item.dias_sem_contato != null) return `Último contato ${daysLabel(item.dias_sem_contato)}`
  return 'Reunião marcada'
}

const todayLabel = () => {
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ItemRow({ item, index }: { item: MeuDiaItem; index: number }) {
  const place = [item.municipio, item.uf].filter(Boolean).join(', ')
  const motivoTone = item.motivo === 'parado' ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-ink-2'
  return (
    <m.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/lead/${encodeURIComponent(item.cnpj)}`}
        className="group flex items-center gap-3 px-5 py-3 transition-colors duration-fast hover:bg-raised focus:outline-none focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-ink sm:truncate">{item.nome || formatCNPJ(item.cnpj)}</p>
          <p className={`mt-0.5 text-xs sm:hidden ${motivoTone}`}>{motivoLabel(item)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag tone={FUNIL_TONE[item.funil]}>{LEAD_TAB_LABEL[item.funil]}</Tag>
            <StatusPill status={item.status} />
            {place && <span className="truncate text-xs text-ink-3">{place}</span>}
          </div>
        </div>
        <span className={`hidden shrink-0 text-right text-xs sm:block ${motivoTone}`}>
          {motivoLabel(item)}
        </span>
        <svg className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-fast group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
    </m.li>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-3 px-5 py-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}

export default function MeuDiaClient() {
  const toast = useToast()
  const [data, setData] = useState<MeuDia | null>(null)
  const [failed, setFailed] = useState(false)
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

  const total = data ? data.novos.length + data.parados.length + data.reunioes.length : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Meu dia" description={todayLabel()} />

      {failed && !data ? (
        <Panel>
          <EmptyState
            title="Não deu para carregar o seu dia"
            description="Confira a conexão e tente de novo."
            action={
              <Button size="sm" variant="primary" onClick={() => void load(false)}>
                Carregar de novo
              </Button>
            }
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
        SECTIONS.map((section) => {
          const items = data?.[section.key] ?? []
          return (
            <Panel
              key={section.key}
              padded={false}
              title={
                <span className="flex items-center gap-2">
                  {section.title}
                  {data && <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium tabular-nums text-ink-2">{items.length}</span>}
                </span>
              }
              description={section.description}
            >
              {!data ? (
                <SectionSkeleton />
              ) : items.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-3">{section.empty}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {items.map((item, index) => (
                    <ItemRow key={`${item.funil}-${item.cnpj}`} item={item} index={index} />
                  ))}
                </ul>
              )}
            </Panel>
          )
        })
      )}
    </div>
  )
}
