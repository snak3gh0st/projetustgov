'use client'

import { useState, useEffect, useCallback } from 'react'

interface NotificationItem {
  propostaKey: string
  titulo: string | null
  eventType: 'comment' | 'situacao' | 'assignment'
  eventAt: string
}

interface StaleItem {
  propostaKey: string
  titulo: string | null
  tecnicoNome: string | null
  assignedAt: string
  hoursWithoutAccess: number
}

interface NotificationsData {
  count: number
  items: NotificationItem[]
  stale: StaleItem[]
}

const EVENT_LABELS: Record<string, string> = {
  comment: 'Novo comentário',
  situacao: 'Situação atualizada',
  assignment: 'Técnico atribuído',
}

export default function NotificationBell() {
  const [data, setData] = useState<NotificationsData | null>(null)
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(() => {
    fetch('/api/tgov/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const totalCount = (data?.count ?? 0) + (data?.stale?.length ?? 0)

  const handleItemClick = async (propostaKey: string, eventType?: string) => {
    await fetch('/api/tgov/seen', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposta_key: propostaKey }),
    }).catch(() => {})
    setOpen(false)
    const url = `/tgov?highlight=${encodeURIComponent(propostaKey)}${eventType === 'comment' ? '&scrollTo=comments' : ''}`
    window.location.href = url
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const hours = Math.floor(diff / 3_600_000)
    if (hours < 1) return 'agora'
    if (hours < 24) return `${hours}h atrás`
    return `${Math.floor(hours / 24)}d atrás`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Notificações"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Notificações</h3>
            </div>

            {totalCount === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                Nenhuma notificação
              </div>
            ) : (
              <>
                {data?.items.map(item => (
                  <button
                    key={item.propostaKey}
                    onClick={() => handleItemClick(item.propostaKey, item.eventType)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {item.propostaKey}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                        {timeAgo(item.eventAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                      {EVENT_LABELS[item.eventType] || item.eventType}
                      {item.titulo ? ` — ${item.titulo}` : ''}
                    </p>
                  </button>
                ))}

                {data?.stale && data.stale.length > 0 && (
                  <>
                    <div className="px-3 py-2 bg-amber-50 border-y border-amber-100">
                      <span className="text-xs font-semibold text-amber-700">
                        Sem acesso há +24h
                      </span>
                    </div>
                    {data.stale.map(item => (
                      <button
                        key={`stale-${item.propostaKey}`}
                        onClick={() => handleItemClick(item.propostaKey)}
                        className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {item.propostaKey}
                          </span>
                          <span className="text-[10px] text-amber-600 ml-auto flex-shrink-0">
                            {item.hoursWithoutAccess}h
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 ml-4 truncate">
                          {item.tecnicoNome || 'Técnico'} não acessou
                          {item.titulo ? ` — ${item.titulo}` : ''}
                        </p>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
