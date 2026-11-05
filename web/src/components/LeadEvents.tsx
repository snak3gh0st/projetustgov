'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import { formatCNPJ, formatCurrency } from '@/lib/format'
import StatusPill from '@/components/ui/StatusPill'
import { Skeleton } from '@/components/ui/Skeleton'

// Mesmo formato de LeadEvent em lib/lead-events.ts (server-only).
export interface LeadEventView {
  cnpj: string
  nome: string | null
  tipo: 'status' | 'status_execucao' | 'atribuicao'
  de: string | null
  para: string | null
  autor_nome: string | null
  origem: string
  linhas: number
  comissao_valor: number | null
  created_at: string
}

const ACTIVITY_REFRESH_MS = 60_000

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function autorLabel(e: LeadEventView): string {
  if (e.autor_nome) return e.autor_nome
  return e.origem === 'sincronizacao' ? 'Sincronização' : 'Sistema'
}

function NameChip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
        strong ? 'bg-accent-soft text-accent-ink' : 'bg-raised text-ink-2'
      }`}
    >
      {children}
    </span>
  )
}

export function LeadEventLine({ event: e, showLead }: { event: LeadEventView; showLead?: boolean }) {
  const lead = showLead && (
    <Link href={`/lead/${encodeURIComponent(e.cnpj)}`} className="font-medium text-ink hover:text-accent-ink hover:underline">
      {e.nome || formatCNPJ(e.cnpj)}
    </Link>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-ink">{autorLabel(e)}</span>
      {e.tipo === 'atribuicao' ? (
        <>
          <span className="text-ink-3">{e.para ? 'atribuiu' : 'desatribuiu'}</span>
          {lead}
          {e.de && (
            <>
              <span className="text-ink-3">de</span>
              <NameChip>{e.de}</NameChip>
            </>
          )}
          {e.para && (
            <>
              <span className="text-ink-3">para</span>
              <NameChip strong>{e.para}</NameChip>
            </>
          )}
          {e.comissao_valor != null && e.comissao_valor > 0 && (
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              comissão {formatCurrency(e.comissao_valor)} {e.para ? 'transferida' : 'sem dono'}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-ink-3">
            {e.tipo === 'status_execucao' ? 'moveu (execução)' : 'moveu'}
          </span>
          {lead}
          <StatusPill status={e.de} label={e.de ?? undefined} />
          <span aria-hidden className="text-ink-3">→</span>
          <span className="sr-only">para</span>
          <StatusPill status={e.para} label={e.para ?? undefined} />
        </>
      )}
      <time dateTime={e.created_at} className="ml-auto whitespace-nowrap text-xs text-ink-3 tabular">{formatDateTime(e.created_at)}</time>
    </div>
  )
}

const eventKey = (e: LeadEventView) => `${e.cnpj}|${e.tipo}|${e.de}|${e.para}|${e.created_at}`

// Atividade Recente da tela inicial: atualiza a cada minuto; novidades entram deslizando.
export function RecentActivityFeed() {
  const [events, setEvents] = useState<LeadEventView[] | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const load = useCallback(() => {
    fetch('/api/atividade-recente')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.events) return
        const list: LeadEventView[] = d.events
        const keys = list.map(eventKey)
        // Só destaca o que chegou depois da primeira carga
        setFresh(seen.current ? new Set(keys.filter(k => !seen.current!.has(k))) : new Set())
        seen.current = new Set(keys)
        setEvents(list)
        setUpdatedAt(new Date())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, ACTIVITY_REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  return (
    <section aria-label="Atividade recente" className="rounded-xl border border-line bg-surface">
      <div className="flex items-end justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="font-body text-base font-semibold tracking-normal text-ink">Atividade recente</h2>
          <p className="mt-0.5 text-sm text-ink-2">Movimentações de leads, atualizadas a cada minuto.</p>
        </div>
        {updatedAt && (
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {events === null ? (
        <div className="space-y-3 px-5 py-4" role="status" aria-label="Carregando atividade">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-full max-w-xl" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-2">
          Nenhuma movimentação registrada ainda. Mudanças de status e atribuições aparecem aqui assim que acontecem.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {events.map(e => (
              <m.li
                key={eventKey(e)}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative px-5 py-3"
              >
                {fresh.has(eventKey(e)) && (
                  <m.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-accent/10"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                  />
                )}
                <div className="relative">
                  <LeadEventLine event={e} showLead />
                </div>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

// Histórico de movimentação no card/página do lead.
export function LeadHistory({ cnpj, refreshKey }: { cnpj: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<LeadEventView[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${encodeURIComponent(cnpj)}/historico`)
      .then(r => (r.ok ? r.json() : { events: [] }))
      .then(d => { if (!cancelled) setEvents(d.events ?? []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [cnpj, refreshKey])

  if (events === null) {
    return <Skeleton className="h-10 w-full" />
  }
  if (events.length === 0) {
    return <p className="text-sm text-ink-3">Nenhuma movimentação registrada.</p>
  }
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {events.map((e, i) => (
        <li key={`${e.created_at}-${i}`} className="relative">
          <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" />
          <LeadEventLine event={e} />
        </li>
      ))}
    </ol>
  )
}
