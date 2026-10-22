'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCNPJ, formatCurrency, googleCalendarEventUrl } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import { formatCrmStatusLabel, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'
import WhatsAppAction from '@/components/WhatsAppAction'
import { LeadHistory } from '@/components/LeadEvents'
import SlideOver, { Field, SlideOverSection } from '@/components/ui/SlideOver'
import StatusPill from '@/components/ui/StatusPill'
import { buttonClass } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Tag } from '@/components/leads/list-ui'

interface LeadSlideOverProps {
  lead: VendedorProjeto | null
  allEmendas?: VendedorProjeto[]
  onClose: () => void
  canModify?: boolean
}

const fieldInputClass =
  'min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30'

export default function LeadSlideOver({ lead, allEmendas, onClose, canModify = false }: LeadSlideOverProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingField, setEditingField] = useState<'telefone' | 'email' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [localLead, setLocalLead] = useState<VendedorProjeto | null>(lead)
  const [emendas, setEmendas] = useState<VendedorProjeto[] | undefined>(allEmendas)

  // O último lead aberto continua no painel enquanto ele fecha (animação de saída).
  useEffect(() => {
    if (lead) {
      setLocalLead(lead)
      setEmendas(allEmendas)
    }
  }, [lead, allEmendas])

  useEffect(() => {
    setEditingField(null)
  }, [lead?.id])

  // Esc cancela a edição em curso; sem edição, fecha o painel.
  useEffect(() => {
    if (!lead) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editingField) setEditingField(null)
      else onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lead, onClose, editingField])

  async function patchLead(body: Record<string, unknown>): Promise<boolean> {
    if (!localLead) return false
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(localLead.cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: localLead.id, ...body }),
      })
      if (!res.ok) throw new Error('patch failed')
      return true
    } catch (err) {
      console.error('Lead update error:', err)
      toast.error('Não foi possível salvar. Tente de novo.')
      return false
    }
  }

  async function updateContact(field: 'telefone' | 'email', value: string) {
    if (await patchLead({ [field]: value })) {
      setLocalLead(prev => prev ? { ...prev, [field]: value } : null)
      toast.success(field === 'telefone' ? 'Telefone salvo.' : 'Email salvo.')
    }
    setEditingField(null)
  }

  function finishEdit(field: 'telefone' | 'email') {
    if (!localLead) return
    if (editValue !== (localLead[field] || '')) void updateContact(field, editValue)
    else setEditingField(null)
  }

  const shown = localLead
  const tipo = shown ? normalizeTipoVendedor(shown.tipo_vendedor) : null
  const status = shown ? normalizeCrmStatus(shown.status_contato) : null

  return (
    <SlideOver
      open={!!lead}
      onClose={onClose}
      closeOnEscape={false}
      title={shown?.nome || 'Sem nome'}
      subtitle={shown ? formatCNPJ(shown.cnpj) : undefined}
      headerExtra={shown && (
        <>
          {shown.status_contato && <StatusPill status={status} label={formatCrmStatusLabel(shown.status_contato, shown.venda_etapa)} />}
          {tipo && <Tag tone={tipo === 'Closer' ? 'violet' : 'sky'}>{tipo === 'Closer' ? 'Gestor (3%)' : 'Consultor (5%)'}</Tag>}
        </>
      )}
      footer={shown && (
        <div className="grid grid-cols-2 gap-2">
          <WhatsAppAction telefone={shown.telefone} label="WhatsApp" className="min-h-10 w-full" />
          <button
            type="button"
            disabled={!shown.email}
            onClick={() => window.open(`mailto:${shown.email}`, '_blank')}
            className={buttonClass('secondary', 'md', 'w-full')}
          >
            <MailIcon />
            Email
          </button>
          <a
            href={googleCalendarEventUrl({
              title: `Reunião PROJETUS: ${shown.nome || shown.cnpj}`,
              details: [
                shown.nome ? `Instituição: ${shown.nome}` : null,
                shown.telefone ? `Telefone: ${shown.telefone}` : null,
                shown.email ? `Email: ${shown.email}` : null,
                `CNPJ: ${shown.cnpj}`,
                'Local: Google Meet',
              ].filter(Boolean).join('\n'),
              guestEmail: shown.email,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('secondary', 'md', 'w-full')}
            title="Abrir Google Calendar com o Meet"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path d="M2 6.5h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
            </svg>
            Agendar
          </a>
          <button
            type="button"
            onClick={() => router.push(`/lead/${encodeURIComponent(shown.cnpj)}`)}
            className={buttonClass('primary', 'md', 'w-full')}
          >
            Abrir card
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      )}
    >
      {shown && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="UF e município" value={[shown.uf, shown.municipio].filter(Boolean).join(' / ') || '-'} />
            <Field label="Natureza jurídica" value={shown.natureza_juridica || '-'} />
            <Field label="Responsável" value={shown.vendedor_nome || 'Sem dono'} />
            {(!emendas || emendas.length <= 1) && (
              <Field label="Valor da emenda" value={formatCurrency(shown.valor_emenda || shown.valor_global || 0)} emphasis />
            )}
          </div>

          {emendas && emendas.length > 1 ? (
            <SlideOverSection title={`Emendas (${emendas.length})`}>
              <ul className="space-y-2">
                {emendas.map(emenda => (
                  <li key={emenda.id} className="space-y-1.5 rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular text-ink">{formatCurrency(Number(emenda.valor_emenda) || 0)}</span>
                      <StatusPill status={normalizeCrmStatus(emenda.status_contato)} label={formatCrmStatusLabel(emenda.status_contato, emenda.venda_etapa)} />
                    </div>
                    {(emenda.parlamentar || emenda.nr_emenda) && (
                      <p className="text-xs text-ink-2">
                        {emenda.parlamentar && <span className="font-medium">{emenda.parlamentar}</span>}
                        {emenda.nr_emenda && <span className="ml-1.5 text-ink-3">#{emenda.nr_emenda}</span>}
                      </p>
                    )}
                    <p className="text-xs text-ink-3 [overflow-wrap:anywhere]">{emenda.orgao_concedente || '-'}</p>
                    {emenda.link_externo && (
                      <a href={emenda.link_externo} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium text-accent-ink hover:underline">
                        Ver no TransfereGov
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </SlideOverSection>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ministério" value={shown.orgao_concedente || '-'} />
                <Field label="Parlamentar" value={shown.parlamentar || '-'} />
              </div>
              {shown.link_externo && (
                <a href={shown.link_externo} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md', 'w-full')}>
                  Ver no TransfereGov
                </a>
              )}
            </>
          )}

          {/* Venda e comissão: a API só manda a comissão para quem pode vê-la */}
          {(status === 'Fechado' || status === 'Em Aprovação') && shown.valor_venda ? (
            <dl className="space-y-2 rounded-lg bg-emerald-50/70 p-3 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25">
              <Row label="Valor da venda" value={formatCurrency(shown.valor_venda)} tone="won" />
              {shown.tipo_servico && <Row label="Tipo de serviço" value={<Tag tone="violet">{shown.tipo_servico}</Tag>} />}
              {shown.comissao_valor != null && shown.comissao_valor > 0 && (
                <Row label={`Comissão (${Number(shown.comissao_percentual || 0).toFixed(1)}%)`} value={formatCurrency(shown.comissao_valor)} />
              )}
              {shown.comissao_bonus != null && shown.comissao_bonus > 0 && (
                <Row label="Fundo comercial" value={formatCurrency(shown.comissao_bonus)} tone="won" />
              )}
            </dl>
          ) : null}
          {!shown.valor_venda && shown.comissao_valor != null && shown.comissao_valor > 0 && (
            <dl className="rounded-lg bg-raised/70 p-3">
              <Row label={`Comissão (${tipo || 'SDR'}, ${Number(shown.comissao_percentual || 0).toFixed(1)}%)`} value={formatCurrency(shown.comissao_valor)} />
            </dl>
          )}

          {shown.endereco && (
            <SlideOverSection title="Endereço">
              <p className="text-sm text-ink-2">{shown.endereco}</p>
              {shown.municipio && shown.uf && <p className="text-xs text-ink-3">{shown.municipio}, {shown.uf}</p>}
            </SlideOverSection>
          )}

          {(shown.telefone || shown.email || canModify) && (
            <SlideOverSection title="Contato">
              {(shown.telefone || canModify) && (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <PhoneIcon />
                  {editingField === 'telefone' ? (
                    <input
                      type="tel"
                      aria-label="Telefone"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => finishEdit('telefone')}
                      onKeyDown={e => { if (e.key === 'Enter') finishEdit('telefone') }}
                      autoFocus
                      className={fieldInputClass}
                    />
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {shown.telefone ? (
                          <>
                            <span className="truncate">{shown.telefone}</span>
                            <WhatsAppAction telefone={shown.telefone} compact label="Abrir" />
                          </>
                        ) : (
                          <span className="text-ink-3">Sem telefone</span>
                        )}
                      </span>
                      {canModify && <EditButton label="Editar telefone" onClick={() => { setEditingField('telefone'); setEditValue(shown.telefone || '') }} />}
                    </>
                  )}
                </div>
              )}
              {(shown.email || canModify) && (
                <div className="flex items-center gap-2 text-sm text-ink-2">
                  <MailIcon />
                  {editingField === 'email' ? (
                    <input
                      type="email"
                      aria-label="Email"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => finishEdit('email')}
                      onKeyDown={e => { if (e.key === 'Enter') finishEdit('email') }}
                      autoFocus
                      className={fieldInputClass}
                    />
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate">{shown.email || <span className="text-ink-3">Sem email</span>}</span>
                      {canModify && <EditButton label="Editar email" onClick={() => { setEditingField('email'); setEditValue(shown.email || '') }} />}
                    </>
                  )}
                </div>
              )}
            </SlideOverSection>
          )}

          {(shown.observacoes || canModify) && (
            <SlideOverSection title="Observações">
              {canModify ? (
                <textarea
                  key={shown.id}
                  aria-label="Observações sobre o lead"
                  defaultValue={shown.observacoes || ''}
                  placeholder="Anote o que importa sobre este lead"
                  onBlur={async (e) => {
                    const newValue = e.target.value
                    if (newValue !== (shown.observacoes || '') && await patchLead({ observacoes: newValue })) {
                      setLocalLead(prev => prev ? { ...prev, observacoes: newValue } : null)
                    }
                  }}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              ) : (
                <p className="rounded-lg bg-raised/70 p-3 text-sm text-ink-2">{shown.observacoes || 'Sem observações'}</p>
              )}
            </SlideOverSection>
          )}

          <SlideOverSection title="Histórico">
            <LeadHistory cnpj={shown.cnpj} refreshKey={shown.status_contato} />
          </SlideOverSection>
        </>
      )}
    </SlideOver>
  )
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'won' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className={`text-sm font-semibold tabular ${tone === 'won' ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-ink-3 transition-colors duration-fast hover:bg-raised hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z" />
      </svg>
    </button>
  )
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden>
      <path d="M1 3c0-1.1.9-2 2-2h2.5a1 1 0 01.98.8l.5 3a1 1 0 01-.27.9L5.1 7.3a10 10 0 004.6 4.6l1.6-1.6a1 1 0 01.9-.27l3 .5a1 1 0 01.8.98V14a2 2 0 01-2 2A13 13 0 011 3z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <rect x="1" y="3" width="14" height="10" rx="1.5" />
      <path d="M1 4l7 5 7-5" />
    </svg>
  )
}
