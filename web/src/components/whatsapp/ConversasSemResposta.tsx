'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Resumo { porConsultor: { user_id: string; nome: string; aguardando: number; mais_antiga: string }[]; emAberto: number }

// Bloco do Pipeline da equipe: conversas de WhatsApp sem resposta por consultor. Some sem canal ou sem permissão.
export default function ConversasSemResposta() {
  const [resumo, setResumo] = useState<Resumo | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => fetch('/api/whatsapp/resumo', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setResumo(d) })
      .catch(() => {})
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  if (!resumo) return null
  const total = resumo.porConsultor.reduce((s, c) => s + c.aguardando, 0)
  return (
    <section aria-labelledby="conversas-sem-resposta" className="rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="conversas-sem-resposta" className="text-sm font-semibold text-ink">Conversas sem resposta</h2>
        <Link href="/conversas" className="rounded text-xs font-medium text-accent-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">Abrir Conversas</Link>
      </header>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto]">
        {total === 0 ? (
          <p className="text-sm text-ink-3">Nenhum consultor com mensagem esperando resposta.</p>
        ) : (
          <ul className="space-y-1.5">
            {resumo.porConsultor.map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-2">{c.nome}</span>
                <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{c.aguardando}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/conversas?filtro=em-aberto" className="flex flex-col items-start rounded-lg bg-raised px-4 py-3 hover:bg-raised/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:items-end">
          <span className="text-xs text-ink-3">Em aberto</span>
          <span className="text-lg font-semibold tabular-nums text-ink">{resumo.emAberto}</span>
        </Link>
      </div>
    </section>
  )
}
