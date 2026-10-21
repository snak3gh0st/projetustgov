'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatCNPJ, formatCurrency } from '@/lib/format'

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

function Pill({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded border text-xs font-medium ${
        strong
          ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300'
          : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
      }`}
    >
      {children}
    </span>
  )
}

export function LeadEventLine({ event: e, showLead }: { event: LeadEventView; showLead?: boolean }) {
  const lead = showLead && (
    <a href={`/lead/${encodeURIComponent(e.cnpj)}`} className="text-gray-700 dark:text-gray-300 hover:underline">
      {e.nome || formatCNPJ(e.cnpj)}
    </a>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-gray-900 dark:text-gray-100 font-medium">{autorLabel(e)}</span>
      {e.tipo === 'atribuicao' ? (
        <>
          <span className="text-gray-400 dark:text-gray-500">{e.para ? 'atribuiu' : 'desatribuiu'}</span>
          {lead}
          {e.de && (
            <>
              <span className="text-gray-400 dark:text-gray-500">de</span>
              <Pill>{e.de}</Pill>
            </>
          )}
          {e.para && (
            <>
              <span className="text-gray-400 dark:text-gray-500">para</span>
              <Pill strong>{e.para}</Pill>
            </>
          )}
          {e.comissao_valor != null && e.comissao_valor > 0 && (
            <span className="text-xs text-green-600 dark:text-green-400">
              comissão {formatCurrency(e.comissao_valor)} {e.para ? 'transferida' : 'sem dono'}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-gray-400 dark:text-gray-500">
            {e.tipo === 'status_execucao' ? 'moveu (execução)' : 'moveu'}
          </span>
          {lead}
          <Pill>{e.de}</Pill>
          <span className="text-gray-400 dark:text-gray-500">→</span>
          <Pill strong>{e.para}</Pill>
        </>
      )}
      <span className="text-gray-400 dark:text-gray-500 text-xs ml-auto whitespace-nowrap">{formatDateTime(e.created_at)}</span>
    </div>
  )
}

// Atividade Recente da tela inicial: atualiza a cada minuto.
export function RecentActivityFeed() {
  const [events, setEvents] = useState<LeadEventView[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(() => {
    fetch('/api/atividade-recente')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d?.events) return
        setEvents(d.events)
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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-gray-100">Atividade Recente</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">Movimentações de leads, atualizadas a cada minuto</p>
        </div>
        {updatedAt && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">Nenhuma movimentação registrada ainda.</p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {events.map((e, i) => (
            <div key={`${e.cnpj}-${e.created_at}-${i}`} className={`px-4 py-3 ${i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}>
              <LeadEventLine event={e} showLead />
            </div>
          ))}
        </div>
      )}
    </div>
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
    return <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  }
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma movimentação registrada.</p>
  }
  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={`${e.created_at}-${i}`} className="pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <LeadEventLine event={e} />
        </div>
      ))}
    </div>
  )
}
