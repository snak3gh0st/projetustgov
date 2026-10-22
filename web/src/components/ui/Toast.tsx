'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TONE_STYLE: Record<ToastTone, { dot: string; label: string }> = {
  success: { dot: 'bg-emerald-500', label: 'Sucesso' },
  error: { dot: 'bg-red-500', label: 'Erro' },
  info: { dot: 'bg-accent', label: 'Aviso' },
}

const DURATION_MS = 4500

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setItems((prev) => [...prev.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? DURATION_MS * 1.5 : DURATION_MS)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
    }),
    [show]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-toast flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <m.div
              key={t.id}
              layout
              role={t.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-black/5 dark:bg-neutral-100 dark:text-neutral-900"
            >
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_STYLE[t.tone].dot}`} />
              <span className="sr-only">{TONE_STYLE[t.tone].label}:</span>
              <p className="flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar aviso"
                className="-mr-1 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa do ToastProvider')
  return ctx
}
