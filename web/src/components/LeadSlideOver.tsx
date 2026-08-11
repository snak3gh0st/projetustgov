'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCNPJ, formatCurrency, googleCalendarEventUrl, whatsappMeUrlFromTelefone } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import { formatCrmStatusLabel, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'

const STATUS_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
  'Sem Interesse': 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-300',
  'Em Atendimento': 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  'Contatado': 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/20',
  'Reunião Agendada': 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20',
  'Proposta Enviada': 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border-blue-200 dark:border-blue-500/20',
  'Em Aprovação': 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
  'Fechado': 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20',
  'Impedimento Técnico': 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/20',
  'Cancelado': 'bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-500/20',
  'Telefone Invalido': 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600',
}

interface LeadSlideOverProps {
  lead: VendedorProjeto | null
  allEmendas?: VendedorProjeto[]
  onClose: () => void
  canModify?: boolean
}

export default function LeadSlideOver({ lead, allEmendas, onClose, canModify = false }: LeadSlideOverProps) {
  const router = useRouter()
  const [editingField, setEditingField] = useState<'telefone' | 'email' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [localLead, setLocalLead] = useState<VendedorProjeto | null>(lead)

  // Update local lead when prop changes
  useEffect(() => {
    setLocalLead(lead)
  }, [lead])

  useEffect(() => {
    if (!lead) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingField) {
          setEditingField(null)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lead, onClose, editingField])

  async function updateContact(field: 'telefone' | 'email', value: string) {
    if (!localLead) return
    try {
      await fetch(`/api/leads/${encodeURIComponent(localLead.cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: localLead.id, [field]: value })
      })
      // Optimistic update on client
      setLocalLead(prev => prev ? {...prev, [field]: value} : null)
      setEditingField(null)
    } catch (err) {
      console.error('Update contact error:', err)
    }
  }

  if (!lead || !localLead) return null

  const waUrl = whatsappMeUrlFromTelefone(localLead.telefone)

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0072F7] to-blue-400 pointer-events-none" />

        {/* Header */}
        <div className="relative p-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>

          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 pr-8 whitespace-normal break-words">{lead.nome || 'Sem nome'}</h2>
              <p className="font-mono text-sm text-gray-400 dark:text-gray-500 mt-1">{formatCNPJ(lead.cnpj)}</p>
            </div>
          </div>

          {lead.status_contato && (
            <span className={`inline-block mt-3 text-xs font-medium rounded-full px-3 py-1 border ${STATUS_COLORS[normalizeCrmStatus(lead.status_contato)] || STATUS_COLORS['Não Contatado']}`}>
              {formatCrmStatusLabel(lead.status_contato, lead.venda_etapa)}
            </span>
          )}

          {localLead.tipo_vendedor && (
            <span className={`inline-block mt-2 text-xs font-medium rounded-full px-3 py-1 border ${
              normalizeTipoVendedor(localLead.tipo_vendedor) === 'SDR'
                ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7] border-blue-200 dark:border-blue-500/20'
                : normalizeTipoVendedor(localLead.tipo_vendedor) === 'In-Sites Sells'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20'
            }`}>
              {normalizeTipoVendedor(localLead.tipo_vendedor) === 'Closer' ? 'Gestor' : 'Consultor'} ({normalizeTipoVendedor(localLead.tipo_vendedor) === 'Closer' ? '3%' : '5%'})
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          {/* Common info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="UF / Municipio" value={[lead.uf, lead.municipio].filter(Boolean).join(' / ') || '-'} />
            <InfoCard label="Natureza Juridica" value={lead.natureza_juridica || '-'} />
            <InfoCard label="Vendedor" value={lead.vendedor_nome || '-'} />
            {(!allEmendas || allEmendas.length <= 1) && (
              <InfoCard label="Valor Emenda" value={formatCurrency(lead.valor_emenda || lead.valor_global || 0)} highlight />
            )}
          </div>

          {/* Emendas list (cascade) */}
          {allEmendas && allEmendas.length > 1 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Emendas ({allEmendas.length})
              </h3>
              {allEmendas.map((emenda, idx) => (
                <div key={emenda.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#0072F7] font-bold text-sm">
                      {formatCurrency(Number(emenda.valor_emenda) || 0)}
                    </span>
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${STATUS_COLORS[normalizeCrmStatus(emenda.status_contato)] || STATUS_COLORS['Não Contatado']}`}>
                      {formatCrmStatusLabel(emenda.status_contato, emenda.venda_etapa)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {emenda.parlamentar && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{emenda.parlamentar}</p>
                    )}
                    {emenda.nr_emenda && (
                      <span className="text-[10px] text-gray-600 dark:text-gray-300">#{emenda.nr_emenda}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-normal break-words">{emenda.orgao_concedente || '-'}</p>
                  {emenda.link_externo && (
                    <a
                      href={emenda.link_externo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#0072F7] hover:text-blue-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      TransferGov &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <InfoCard label="Ministerio" value={lead.orgao_concedente || '-'} />
                <InfoCard label="Parlamentar" value={lead.parlamentar || '-'} />
              </div>
              {lead.link_externo && (
                <a
                  href={lead.link_externo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-medium text-[#0072F7] border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 transition-colors"
                >
                  Abrir no TransferGov &rarr;
                </a>
              )}
            </>
          )}

          {/* Sale Value & Commission Info */}
          {(normalizeCrmStatus(localLead.status_contato) === 'Fechado' || normalizeCrmStatus(localLead.status_contato) === 'Em Aprovação') && localLead.valor_venda && (
            <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">Valor da Venda</span>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(localLead.valor_venda)}
                </span>
              </div>
              {localLead.tipo_servico && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Tipo de Serviço</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
                    {localLead.tipo_servico}
                  </span>
                </div>
              )}
              {localLead.comissao_valor != null && localLead.comissao_valor > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Comissão ({Number(localLead.comissao_percentual || 0).toFixed(1)}%)
                  </span>
                  <span className="text-sm font-semibold text-[#0072F7]">
                    {formatCurrency(localLead.comissao_valor)}
                  </span>
                </div>
              )}
              {localLead.comissao_bonus != null && localLead.comissao_bonus > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Fundo Comercial</span>
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(localLead.comissao_bonus)}
                  </span>
                </div>
              )}
            </div>
          )}
              {!localLead.valor_venda && localLead.comissao_valor != null && localLead.comissao_valor > 0 && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                Comissão ({normalizeTipoVendedor(localLead.tipo_vendedor) || 'SDR'} - {Number(localLead.comissao_percentual || 0).toFixed(1)}%)
                </span>
                <span className="text-sm font-semibold text-[#0072F7]">
                  {formatCurrency(localLead.comissao_valor)}
                </span>
              </div>
            </div>
          )}

          {/* Address */}
          {localLead.endereco && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Endereco</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{localLead.endereco}</p>
              {localLead.municipio && localLead.uf && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{localLead.municipio} - {localLead.uf}</p>
              )}
            </div>
          )}

          {/* Contact */}
          {(localLead.telefone || localLead.email || canModify) && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contato</h3>
              {(localLead.telefone || canModify) && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 3c0-1.1.9-2 2-2h2.5a1 1 0 01.98.8l.5 3a1 1 0 01-.27.9L5.1 7.3a10 10 0 004.6 4.6l1.6-1.6a1 1 0 01.9-.27l3 .5a1 1 0 01.8.98V14a2 2 0 01-2 2A13 13 0 011 3z"/>
                  </svg>
                  {editingField === 'telefone' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => {
                        if (editValue !== (localLead.telefone || '')) {
                          updateContact('telefone', editValue)
                        } else {
                          setEditingField(null)
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (editValue !== (localLead.telefone || '')) {
                            updateContact('telefone', editValue)
                          } else {
                            setEditingField(null)
                          }
                        } else if (e.key === 'Escape') {
                          setEditingField(null)
                        }
                      }}
                      autoFocus
                      className="flex-1 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:border-[#0072F7] dark:placeholder:text-gray-500"
                    />
                  ) : (
                    <>
                      <span className="flex-1">
                        {localLead.telefone ? (
                          waUrl ? (
                            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700" title="Conversar no WhatsApp">
                              {localLead.telefone}
                            </a>
                          ) : (
                            localLead.telefone
                          )
                        ) : (
                          <span className="text-gray-600 dark:text-gray-300">Sem telefone</span>
                        )}
                      </span>
                      {canModify && (
                        <button
                          onClick={() => {
                            setEditingField('telefone')
                            setEditValue(localLead.telefone || '')
                          }}
                          className="text-gray-500 dark:text-gray-400 hover:text-[#0072F7] transition-colors"
                          title="Editar telefone"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z"/>
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {(localLead.email || canModify) && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                    <path d="M1 4l7 5 7-5"/>
                  </svg>
                  {editingField === 'email' ? (
                    <input
                      type="email"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => {
                        if (editValue !== (localLead.email || '')) {
                          updateContact('email', editValue)
                        } else {
                          setEditingField(null)
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (editValue !== (localLead.email || '')) {
                            updateContact('email', editValue)
                          } else {
                            setEditingField(null)
                          }
                        } else if (e.key === 'Escape') {
                          setEditingField(null)
                        }
                      }}
                      autoFocus
                      className="flex-1 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:border-[#0072F7] dark:placeholder:text-gray-500"
                    />
                  ) : (
                    <>
                      <span className="flex-1">{localLead.email || <span className="text-gray-600 dark:text-gray-300">Sem email</span>}</span>
                      {canModify && (
                        <button
                          onClick={() => {
                            setEditingField('email')
                            setEditValue(localLead.email || '')
                          }}
                          className="text-gray-500 dark:text-gray-400 hover:text-[#0072F7] transition-colors"
                          title="Editar email"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 012 2L5 13l-4 1 1-4L11.5 2.5z"/>
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observacoes/Detalhes */}
          {(lead.observacoes || canModify) && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detalhes</h3>
              {canModify ? (
                <textarea
                  defaultValue={localLead.observacoes || ''}
                  placeholder="Adicione observações sobre este lead..."
                  onBlur={async (e) => {
                    const newValue = e.target.value
                    if (newValue !== (localLead.observacoes || '')) {
                      try {
                        await fetch(`/api/leads/${encodeURIComponent(localLead.cnpj)}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: localLead.id, observacoes: newValue })
                        })
                        setLocalLead(prev => prev ? {...prev, observacoes: newValue} : null)
                      } catch (err) {
                        console.error('Failed to update observacoes:', err)
                      }
                    }
                  }}
                  rows={4}
                  className="w-full bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 placeholder-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-[#0072F7] resize-none"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">{lead.observacoes || 'Sem observações'}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-3">
          <button
            disabled={!waUrl}
            onClick={() => {
              if (waUrl) window.open(waUrl, '_blank')
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 00-6.1 10.4L1 15l3.7-.9A7 7 0 108 1zm3.6 9.8c-.15.43-.9.82-1.24.87-.34.05-.77.07-1.24-.08a11.4 11.4 0 01-1.12-.42 8.7 8.7 0 01-3.45-3.05c-.3-.39-.6-.8-.82-1.24-.22-.44-.11-.66.08-.87l.27-.31c.09-.1.19-.26.28-.39.1-.13.13-.22.19-.37.06-.15.03-.28-.02-.39s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31s-.86.84-.86 2.06.88 2.39 1 2.56c.13.17 1.75 2.67 4.23 3.74.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28z"/>
            </svg>
            WhatsApp
          </button>
          <button
            disabled={!lead.email}
            onClick={() => window.open(`mailto:${lead.email}`, '_blank')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:border-gray-200 disabled:text-gray-400 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="14" height="10" rx="1.5"/>
              <path d="M1 4l7 5 7-5"/>
            </svg>
            Email
          </button>
          <a
            href={googleCalendarEventUrl({
              title: `Reunião Projetus — ${localLead.nome || localLead.cnpj}`,
              details: [
                localLead.nome ? `Instituição: ${localLead.nome}` : null,
                localLead.telefone ? `Telefone: ${localLead.telefone}` : null,
                localLead.email ? `Email: ${localLead.email}` : null,
                `CNPJ: ${localLead.cnpj}`,
                'Local: Google Meet',
              ].filter(Boolean).join('\n'),
              guestEmail: localLead.email,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
            title="Abrir Google Calendar / Meet"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path d="M2 6.5h12M5 1.5v3M11 1.5v3" strokeLinecap="round" />
            </svg>
            Agendar
          </a>
          <button
            onClick={() => router.push(`/lead/${encodeURIComponent(lead.cnpj)}`)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0072F7] hover:bg-[#0058C4] transition-all"
          >
            Ver Detalhes
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l5 5-5 5"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-medium whitespace-normal break-words ${highlight ? 'text-[#0072F7] font-bold' : 'text-gray-800 dark:text-gray-200'}`}>{value}</p>
    </div>
  )
}
