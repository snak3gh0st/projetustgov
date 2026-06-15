'use client'

import { useEffect, useRef, useState } from 'react'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const res = await fetch('/api/area/notifications')
      if (!res.ok) return
      const json = await res.json()
      setItems(json.data?.items ?? [])
      setUnread(json.data?.unread ?? 0)
    } catch {
      // silent — bell is non-critical
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      setUnread(0)
      try {
        await fetch('/api/area/notifications', { method: 'POST' })
      } catch {
        // ignore
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificações"
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition hover:text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-academy-gold px-1 text-[10px] font-bold leading-none text-black">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-white/10 bg-zinc-900 shadow-xl">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-white/50">Nenhuma notificação.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {items.map((n) => {
                const isUnread = !n.read_at
                const content = (
                  <div
                    className={`block px-4 py-3 transition hover:bg-white/5 ${
                      isUnread ? 'border-l-2 border-academy-gold' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <p className={`text-sm ${isUnread ? 'font-semibold text-white' : 'text-white/60'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-xs text-white/50">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-white/35">
                      {new Date(n.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <a href={n.link} className="block">
                        {content}
                      </a>
                    ) : (
                      content
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
