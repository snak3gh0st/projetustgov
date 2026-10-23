'use client'

import { useState } from 'react'
import WhatsAppAction from '@/components/WhatsAppAction'
import { inputClass } from '@/components/leads/list-ui'
import type { ValorExibido } from '@/lib/lead-timeline'

type Campo = 'telefone' | 'email'

interface ContatoLeadProps {
  cnpj: string
  telefone: ValorExibido
  email: ValorExibido
  endereco: string | null
  /** Quem pode editar depende de onde o valor está gravado (contato principal ou lead). */
  canEdit: (campo: Campo) => boolean
  /** Devolve true quando salvou. contatoId null grava no lead. */
  onSave: (campo: Campo, valor: string, contatoId: number | null) => Promise<boolean>
}

function PencilButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors duration-fast hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z" />
      </svg>
    </button>
  )
}

// Telefone e email que o lead mostra: do contato principal quando há, senão do próprio lead.
export default function ContatoLead({ cnpj, telefone, email, endereco, canEdit, onSave }: ContatoLeadProps) {
  const [editing, setEditing] = useState<Campo | null>(null)
  const [valor, setValor] = useState('')

  async function commit(campo: Campo, exibido: ValorExibido) {
    if (valor === (exibido.valor ?? '')) {
      setEditing(null)
      return
    }
    if (await onSave(campo, valor, exibido.contatoId)) setEditing(null)
  }

  const row = (campo: Campo, label: string, exibido: ValorExibido) => {
    const atual = exibido.valor
    return (
    <div className="flex min-h-9 items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-ink-3">{label}</span>
      {editing === campo ? (
        <input
          autoFocus
          type={campo === 'email' ? 'email' : 'tel'}
          aria-label={label}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => void commit(campo, exibido)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit(campo, exibido)
            if (e.key === 'Escape') setEditing(null)
          }}
          className={`${inputClass} min-w-0 flex-1`}
        />
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {atual ? (
              campo === 'email'
                ? <a href={`mailto:${atual}`} className="truncate text-sm text-accent-ink hover:underline">{atual}</a>
                : <span className="truncate text-sm tabular-nums text-ink">{atual}</span>
            ) : (
              <span className="text-sm text-ink-3">{campo === 'email' ? 'Sem email' : 'Sem telefone'}</span>
            )}
            {campo === 'telefone' && atual && <WhatsAppAction telefone={atual} cnpj={cnpj} compact label="WhatsApp" />}
          </div>
          {canEdit(campo) && <PencilButton label={`Editar ${label.toLowerCase()}`} onClick={() => { setEditing(campo); setValor(atual ?? '') }} />}
        </>
      )}
    </div>
    )
  }

  return (
    <div className="space-y-1 px-4 py-3">
      {row('telefone', 'Telefone', telefone)}
      {row('email', 'Email', email)}
      {(telefone.contatoId != null || email.contatoId != null) && (
        <p className="pt-1 text-xs text-ink-3">Vem da lista de contatos abaixo. A edição atualiza esse contato.</p>
      )}
      {endereco && (
        <div className="flex gap-2 pt-1">
          <span className="w-16 shrink-0 text-xs text-ink-3">Endereço</span>
          <span className="min-w-0 text-sm text-ink-2 [overflow-wrap:anywhere]">{endereco}</span>
        </div>
      )}
    </div>
  )
}
