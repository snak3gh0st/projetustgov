'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Pílulas e selos logo abaixo do título. */
  headerExtra?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  widthClass?: string
  /** Desligue quando o conteúdo trata o Esc (ex.: cancelar uma edição antes de fechar). */
  closeOnEscape?: boolean
}

// Painel lateral para espiar um registro sem sair da lista.
export default function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  children,
  widthClass = 'sm:max-w-[440px]',
  closeOnEscape = true,
}: SlideOverProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Foco vai para o painel ao abrir e volta para quem abriu ao fechar.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    return () => opener?.focus?.({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="slide-over" className="fixed inset-0 z-modal">
          <m.div
            aria-hidden
            className="absolute inset-0 bg-black/30 dark:bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <m.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-xl ${widthClass}`}
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-heading text-lg font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 font-mono text-xs text-ink-3">{subtitle}</p>}
                {headerExtra && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{headerExtra}</div>}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Fechar painel"
                className="-mr-1.5 -mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-fast hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line p-4">{footer}</footer>}
          </m.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Título de seção dentro do painel. */
export function SlideOverSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-ink-3">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Par rótulo e valor, em grade de duas colunas. */
export function Field({ label, value, emphasis = false }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="rounded-lg bg-raised/70 px-3 py-2.5">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`mt-0.5 text-sm [overflow-wrap:anywhere] ${emphasis ? 'font-semibold tabular text-accent-ink' : 'font-medium text-ink'}`}>{value}</p>
    </div>
  )
}
