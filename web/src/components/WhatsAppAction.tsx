'use client'

import { whatsappMeUrlFromTelefone } from '@/lib/format'
import type { MouseEventHandler } from 'react'

interface WhatsAppActionProps {
  telefone: string | null | undefined
  label?: string
  compact?: boolean
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1a7 7 0 0 0-6.1 10.4L1 15l3.7-.9A7 7 0 1 0 8 1Zm3.6 9.8c-.15.43-.9.82-1.24.87-.34.05-.77-.03-1.24-.08a11.4 11.4 0 0 1-1.12-.42 8.7 8.7 0 0 1-3.45-3.05c-.3-.39-.6-.8-.82-1.24-.22-.44-.11-.66.08-.87l.27-.31c.09-.1.19-.26.28-.39.1-.13.13-.22.19-.37.06-.15.03-.28-.02-.39s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31s-.86.84-.86 2.06.88 2.39 1 2.56c.13.17 1.75 2.67 4.23 3.74.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}

export default function WhatsAppAction({
  telefone,
  label = 'WhatsApp',
  compact = false,
  className = '',
  onClick,
}: WhatsAppActionProps) {
  const href = whatsappMeUrlFromTelefone(telefone)

  if (!href) {
    return (
      <span
        role="status"
        title="Cadastre um telefone válido para abrir o WhatsApp"
        className={`inline-flex items-center justify-center gap-1.5 text-gray-400 dark:text-gray-500 ${
          compact
            ? 'rounded-md px-1.5 py-1 text-[10px]'
            : 'rounded-xl px-3 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700'
        } ${className}`}
      >
        <WhatsAppIcon />
        {compact ? 'Sem WhatsApp' : 'WhatsApp indisponível'}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-label={`${label} para ${telefone}`}
      title="Abrir conversa no WhatsApp"
      className={`inline-flex items-center justify-center gap-1.5 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors ${
        compact
          ? 'rounded-md px-1.5 py-1 text-[10px] font-medium'
          : 'rounded-xl px-3 py-2.5 text-sm font-medium'
      } ${className}`}
    >
      <WhatsAppIcon />
      {label}
    </a>
  )
}
