'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCNPJ, formatCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  'Ainda Não': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Retorno': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Proposta': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Fechado': 'bg-green-500/20 text-green-400 border-green-500/30',
}

interface LeadSlideOverProps {
  lead: VendedorProjeto | null
  onClose: () => void
}

export default function LeadSlideOver({ lead, onClose }: LeadSlideOverProps) {
  const router = useRouter()

  useEffect(() => {
    if (!lead) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lead, onClose])

  if (!lead) return null

  const phoneDigits = lead.telefone?.replace(/\D/g, '') || ''

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-sigma-navy-card/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Glow */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-sigma-neon/5 to-transparent pointer-events-none" />

        {/* Header */}
        <div className="relative p-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-sigma-neon transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>

          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate pr-8">{lead.nome || 'Sem nome'}</h2>
              <p className="font-mono text-sm text-gray-400 mt-1">{formatCNPJ(lead.cnpj)}</p>
            </div>
          </div>

          {lead.status_contato && (
            <span className={`inline-block mt-3 text-xs font-medium rounded-full px-3 py-1 border ${STATUS_COLORS[lead.status_contato] || STATUS_COLORS['Ainda Não']}`}>
              {lead.status_contato}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          {/* Info Grid */}
          {/* Link do programa */}
          {lead.link_externo && (
            <a
              href={lead.link_externo}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-medium text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
            >
              Abrir no TransferGov &rarr;
            </a>
          )}

          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Ministerio" value={lead.orgao_concedente || '-'} />
            <InfoCard label="Parlamentar" value={lead.parlamentar || '-'} />
            <InfoCard label="UF / Municipio" value={[lead.uf, lead.municipio].filter(Boolean).join(' / ') || '-'} />
            <InfoCard label="Valor Emenda" value={formatCurrency(lead.valor_emenda || lead.valor_global || 0)} highlight />
            <InfoCard label="Natureza Juridica" value={lead.natureza_juridica || '-'} />
            <InfoCard label="Vendedor" value={lead.vendedor_nome || '-'} />
          </div>

          {/* Contact */}
          {(lead.telefone || lead.email) && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</h3>
              {lead.telefone && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 3c0-1.1.9-2 2-2h2.5a1 1 0 01.98.8l.5 3a1 1 0 01-.27.9L5.1 7.3a10 10 0 004.6 4.6l1.6-1.6a1 1 0 01.9-.27l3 .5a1 1 0 01.8.98V14a2 2 0 01-2 2A13 13 0 011 3z"/>
                  </svg>
                  {lead.telefone}
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                    <path d="M1 4l7 5 7-5"/>
                  </svg>
                  {lead.email}
                </div>
              )}
            </div>
          )}

          {/* Observacoes */}
          {lead.observacoes && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Observacoes</h3>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <p className="text-sm text-gray-400 italic">{lead.observacoes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t border-white/5 flex gap-3">
          <button
            disabled={!phoneDigits}
            onClick={() => window.open(`https://wa.me/55${phoneDigits}`, '_blank')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 00-6.1 10.4L1 15l3.7-.9A7 7 0 108 1zm3.6 9.8c-.15.43-.9.82-1.24.87-.34.05-.77.07-1.24-.08a11.4 11.4 0 01-1.12-.42 8.7 8.7 0 01-3.45-3.05c-.3-.39-.6-.8-.82-1.24-.22-.44-.11-.66.08-.87l.27-.31c.09-.1.19-.26.28-.39.1-.13.13-.22.19-.37.06-.15.03-.28-.02-.39s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31s-.86.84-.86 2.06.88 2.39 1 2.56c.13.17 1.75 2.67 4.23 3.74.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28z"/>
            </svg>
            WhatsApp
          </button>
          <button
            disabled={!lead.email}
            onClick={() => window.open(`mailto:${lead.email}`, '_blank')}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 border border-white/10 hover:bg-white/5 disabled:border-white/5 disabled:text-gray-600 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="14" height="10" rx="1.5"/>
              <path d="M1 4l7 5 7-5"/>
            </svg>
            Email
          </button>
          <button
            onClick={() => router.push(`/lead/${encodeURIComponent(lead.cnpj)}`)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-sigma-navy-dark bg-sigma-neon hover:brightness-110 transition-all"
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
    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-medium truncate ${highlight ? 'text-sigma-neon font-bold' : 'text-gray-200'}`}>{value}</p>
    </div>
  )
}
