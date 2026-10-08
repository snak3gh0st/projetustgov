'use client'

import { useEffect, useRef, useState } from 'react'
import type { TituloDetalhe } from '@/lib/financeiro/types'
import { fullDate, money } from './format'
import { Pill } from './ui'

/** Right-hand panel, the app's existing pattern for record details. */
export function SlideOver({
  open,
  kicker,
  title,
  onClose,
  children,
}: {
  open: boolean
  kicker: string
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    const last = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      setShown(true)
      closeRef.current?.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      last?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-slide-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-900 ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-gray-400">{kicker}</div>
            <h3 id="fin-slide-title" className="text-base font-semibold text-slate-900 dark:text-gray-100">
              {title}
            </h3>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8 pt-4">{children}</div>
      </aside>
    </div>
  )
}

export function KeyValues({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500 dark:text-gray-400">{k}</dt>
          <dd className="m-0 font-medium text-slate-900 dark:text-gray-100">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Detail of one Conta Azul parcela: status, split and payment history. */
export function TituloSlideOver({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<TituloDetalhe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancel = false
    setData(null)
    setError(null)
    fetch(`/api/financeiro/titulos/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Falha ao carregar')
        if (!cancel) setData(body)
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : 'Falha ao carregar'))
    return () => {
      cancel = true
    }
  }, [id])

  const isIn = data?.tipo === 'RECEITA'
  return (
    <SlideOver open={Boolean(id)} onClose={onClose} kicker={data ? (isIn ? 'Conta a receber' : 'Conta a pagar') : 'Título'} title={data?.pessoa_nome ?? (error ? 'Título' : 'Carregando…')}>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!data && !error && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />}
      {data && (
        <>
          <div>
            <Pill tone={data.status.tone}>{data.status.label}</Pill>
          </div>
          <KeyValues
            items={[
              [isIn ? 'Cliente' : 'Fornecedor', data.pessoa_nome ?? '—'],
              ['Descrição', data.descricao ?? '—'],
              ['Vencimento', <span key="v" className="tabular-nums">{fullDate(data.data_vencimento)}</span>],
              ['Competência', <span key="c" className="tabular-nums">{fullDate(data.data_competencia)}</span>],
              ['Valor', <span key="vl" className="tabular-nums">{money(data.valor_total)}</span>],
              ['Em aberto', <span key="a" className="tabular-nums">{money(data.nao_pago)}</span>],
              ['Conta', data.conta ?? '—'],
            ]}
          />
          {data.rateio.length > 0 && (
            <div>
              <div className="mb-2 text-[13px] font-medium text-slate-600 dark:text-gray-300">Categorias do lançamento</div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-[13px] dark:divide-gray-800 dark:border-gray-800">
                {data.rateio.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-slate-800 dark:text-gray-200">
                      {r.categoria ?? 'Sem categoria'}
                      {r.centro_custo && <span className="text-slate-500 dark:text-gray-400"> · {r.centro_custo}</span>}
                    </span>
                    <span className="tabular-nums text-slate-900 dark:text-gray-100">{money(r.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2.5 text-[13px] font-medium text-slate-600 dark:text-gray-300">Pagamentos</div>
            {data.baixas.length === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-gray-400">Nenhum pagamento registrado.</p>
            ) : (
              <ol className="ml-1.5 border-l-2 border-slate-200 dark:border-gray-800">
                {data.baixas.map((b) => (
                  <li key={b.id} className="relative pb-3.5 pl-4 text-[13px]">
                    <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 bg-white dark:bg-gray-900" style={{ borderColor: isIn ? 'var(--fin-in)' : 'var(--fin-out)' }} />
                    <div className="text-slate-900 dark:text-gray-100">
                      {isIn ? 'Recebido' : 'Pago'} <span className="tabular-nums">{money(b.valor_liquido)}</span>
                      {(b.juros > 0 || b.multa > 0) && <span className="text-slate-500 dark:text-gray-400"> · juros e multa {money(b.juros + b.multa)}</span>}
                      {b.desconto > 0 && <span className="text-slate-500 dark:text-gray-400"> · desconto {money(b.desconto)}</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-gray-400">
                      <span className="tabular-nums">{fullDate(b.data_pagamento)}</span>
                      {b.metodo && ` · ${b.metodo.toLowerCase()}`}
                      {b.conta && ` · ${b.conta}`}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <a
            href="https://app.contaazul.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-[#0072F7] px-4 text-[13px] font-semibold text-white hover:bg-[#0058C4]"
          >
            Abrir o Conta Azul
          </a>
        </>
      )}
    </SlideOver>
  )
}
