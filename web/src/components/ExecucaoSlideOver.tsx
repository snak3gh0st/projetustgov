'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'

interface ContactRow {
  id: number
  lead_cnpj: string
  nome_pessoa: string | null
  cargo: string | null
  telefone: string | null
  email: string | null
  telefone_status: string | null
  principal: boolean
}

interface ExecucaoSlideOverProps {
  cnpj: string | null
  nomeProponente: string | null
  temAlerta: boolean
  contactPresent: boolean
  totalValorGlobal: string | null
  totalPropostas: number
  tagAutossuficiente: boolean
  tagIniciante: boolean
  tagDesembolso: boolean
  tagLobby: boolean
  tagRendimento: boolean
  onClose: () => void
}

interface ExecucaoDetailRow {
  nr_convenio: string
  id_proposta: string | null
  situacao: string | null
  modalidade: string | null
  objeto: string | null
  valor_global: string | null
  valor_repasse: string | null
  valor_desembolsado: string | null
  saldo_conta: string | null
  valor_empenhado: string | null
  pct_execucao: string | null
  dias_em_execucao: number | null
  dias_ate_vencimento: number | null
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  alerta_desembolso: boolean
  verificar_saldo: boolean
  tag_desembolso: boolean
  tag_lobby: boolean
}

function diasColor(dias: number | null): string {
  if (dias == null) return 'text-gray-400'
  if (dias < 0) return 'text-red-600 font-bold'
  if (dias < 30) return 'text-red-500 font-medium'
  if (dias <= 90) return 'text-amber-600'
  return 'text-gray-600'
}

export default function ExecucaoSlideOver({
  cnpj,
  nomeProponente,
  temAlerta,
  contactPresent,
  totalValorGlobal,
  totalPropostas,
  tagAutossuficiente,
  tagIniciante,
  tagDesembolso,
  tagLobby,
  tagRendimento,
  onClose,
}: ExecucaoSlideOverProps) {
  const [detailRows, setDetailRows] = useState<ExecucaoDetailRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  const fetchAndEnrichContacts = useCallback(async (targetCnpj: string) => {
    setContactsLoading(true)
    try {
      // 1. Fetch existing contacts from DB
      const res = await fetch(`/api/leads/${encodeURIComponent(targetCnpj)}/contacts`)
      if (res.ok) {
        const data = await res.json()
        const existing: ContactRow[] = Array.isArray(data) ? data : []
        if (existing.length > 0) {
          setContacts(existing)
          return
        }
      }

      // 2. No contacts — auto-enrich from BrasilAPI silently
      try {
        const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${targetCnpj}`, {
          signal: AbortSignal.timeout(10000),
        })
        if (apiRes.ok) {
          const data = await apiRes.json()
          const phone1 = (data.ddd_telefone_1 || '').replace(/\D/g, '')
          const phone2 = (data.ddd_telefone_2 || '').replace(/\D/g, '')
          const rawEmail = (data.email || '').trim().toLowerCase()
          const email = rawEmail && rawEmail !== 'none' && rawEmail.includes('@') ? rawEmail : null

          const fmtPhone = (digits: string) => {
            if (!digits || digits.length < 10) return null
            return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
          }

          const p1 = fmtPhone(phone1)
          if (p1 || email) {
            await fetch(`/api/leads/${encodeURIComponent(targetCnpj)}/contacts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ telefone: p1, email, telefone_status: 'desconhecido', principal: true }),
            })
          }

          const p2 = fmtPhone(phone2)
          if (p2 && p2 !== fmtPhone(phone1)) {
            await fetch(`/api/leads/${encodeURIComponent(targetCnpj)}/contacts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ telefone: p2, telefone_status: 'desconhecido' }),
            })
          }

          // 3. Re-fetch to show saved contacts
          const res2 = await fetch(`/api/leads/${encodeURIComponent(targetCnpj)}/contacts`)
          if (res2.ok) {
            const data2 = await res2.json()
            setContacts(Array.isArray(data2) ? data2 : [])
            return
          }
        }
      } catch {
        // BrasilAPI failed silently — no contacts to show
      }

      setContacts([])
    } catch {
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!cnpj) return

    // Clear stale data immediately (Pitfall 6 from RESEARCH)
    setDetailRows([])
    setDetailLoading(true)
    setDetailError(false)
    setContacts([])

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)

    fetch(`/api/execucao/${encodeURIComponent(cnpj)}`)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then(data => setDetailRows(Array.isArray(data) ? data : []))
      .catch(() => setDetailError(true))
      .finally(() => setDetailLoading(false))

    fetchAndEnrichContacts(cnpj)

    return () => document.removeEventListener('keydown', handler)
  }, [cnpj, onClose, fetchAndEnrichContacts])

  if (!cnpj) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0072F7] to-blue-400 pointer-events-none" />

        {/* Header */}
        <div className="relative p-6 pb-4">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>

          <h2 className="text-xl font-bold text-gray-900 pr-8 whitespace-normal break-words">
            {nomeProponente || 'Sem nome'}
          </h2>
          <p className="font-mono text-sm text-gray-400 mt-1">{formatCNPJ(cnpj)}</p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {temAlerta && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                Alerta
              </span>
            )}
            {contactPresent && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#0072F7] border border-blue-200">
                Contato
              </span>
            )}
            {tagAutossuficiente && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200" title="Mais de 5 propostas executadas">
                Autossuficiente
              </span>
            )}
            {tagIniciante && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200" title="Menos de 5 propostas executadas">
                Iniciante
              </span>
            )}
            {tagDesembolso && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title="Projeto com menos de 100 dias de execucao">
                Desembolso
              </span>
            )}
            {tagLobby && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200" title="Projeto com +100 dias de execucao e desembolso zero">
                Lobby
              </span>
            )}
            {tagRendimento && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200" title="Rendimento bancario significativo">
                Rendimento
              </span>
            )}
          </div>

          {/* Summary: total valor convenio + propostas badge */}
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500">Valor total dos convenios</span>
              <p className="text-lg font-bold text-gray-900">{formatCompactCurrency(totalValorGlobal)}</p>
            </div>
            {totalPropostas > 0 && (
              <span
                className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold ${
                  totalPropostas >= 6 ? 'bg-red-50 text-red-700 border border-red-200' :
                  totalPropostas >= 3 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                  'bg-gray-50 text-gray-600 border border-gray-200'
                }`}
                title={`${totalPropostas} proposta(s) ja executadas — quanto mais, menor a prioridade`}
              >
                {totalPropostas} proposta(s) ja executada(s)
              </span>
            )}
          </div>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {/* Contacts section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contatos {contacts.length > 0 && `(${contacts.length})`}
              </h3>
            </div>
            {contactsLoading && (
              <p className="text-xs text-gray-400">Buscando contatos...</p>
            )}
            {!contactsLoading && contacts.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum contato encontrado para este CNPJ.</p>
            )}
            {contacts.length > 0 && (
              <div className="space-y-2">
                {contacts.map(c => (
                  <div key={c.id} className={`bg-gray-50 rounded-lg p-3 border ${c.principal ? 'border-[#0072F7] bg-blue-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {c.nome_pessoa && <span className="text-sm font-medium text-gray-900">{c.nome_pessoa}</span>}
                      {c.cargo && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{c.cargo}</span>}
                      {c.principal && <span className="text-[10px] text-[#0072F7] font-medium">Principal</span>}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {c.telefone && (
                        <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.12 1.52 5.86L0 24l6.335-1.652A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.875 0-3.615-.525-5.1-1.44l-.36-.225-3.75.975.99-3.645-.24-.375A9.69 9.69 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/></svg>
                          {c.telefone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-xs text-[#0072F7] hover:text-blue-700">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                          {c.email}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200" />

          {detailLoading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-gray-400">Carregando convenios...</span>
            </div>
          )}

          {detailError && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-red-500">Erro ao carregar dados.</span>
            </div>
          )}

          {!detailLoading && !detailError && detailRows.length > 0 && (
            <>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Convenios ({detailRows.length})
              </h3>
              {detailRows.map(conv => {
                const pct = Math.min(100, Number(conv.pct_execucao) || 0)
                return (
                  <div
                    key={conv.nr_convenio}
                    className={`bg-gray-50 rounded-xl p-4 border ${conv.alerta_desembolso ? 'border-amber-300 bg-amber-50/20' : 'border-gray-200'} space-y-3`}
                  >
                    {/* Convenio number + modalidade + link */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">#{conv.nr_convenio}</span>
                        <a
                          href={`https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${conv.nr_convenio}&destino=`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-[#0072F7] hover:text-blue-800 transition-colors"
                          title="Ver convenio no TransfereGov"
                          onClick={e => e.stopPropagation()}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                          Convenio
                        </a>
                        {conv.id_proposta && (
                          <a
                            href={`https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDePropostaDetalharProposta.do?idProposta=${conv.id_proposta}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
                            title="Ver proposta no TransfereGov"
                            onClick={e => e.stopPropagation()}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                            Proposta
                          </a>
                        )}
                      </div>
                      {conv.modalidade && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{conv.modalidade}</span>
                      )}
                    </div>

                    {/* Objeto (truncated) */}
                    {conv.objeto && (
                      <p className="text-xs text-gray-600 line-clamp-2" title={conv.objeto}>{conv.objeto}</p>
                    )}

                    {/* Progress bar: % Execucao */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">% Execucao</span>
                        <span className="text-xs font-medium text-gray-700">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-[#0072F7] h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>

                    {/* Financial details grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 pb-1 mb-1 border-b border-gray-200">
                        <span className="text-xs text-gray-500">Valor do Convenio</span>
                        <p className="text-lg font-bold text-gray-900">{formatCompactCurrency(conv.valor_global)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Desembolsado</span>
                        <p className="text-sm font-bold text-[#0072F7]">{formatCompactCurrency(conv.valor_desembolsado)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Saldo em conta</span>
                        <p className="text-sm font-medium text-gray-800">{formatCompactCurrency(conv.saldo_conta)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Fim de vigencia</span>
                        <p className="text-sm text-gray-700">{formatDate(conv.data_fim_vigencia)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Dias em execucao</span>
                        <p className="text-sm text-gray-700">{conv.dias_em_execucao ?? '-'}</p>
                      </div>
                    </div>

                    {/* Dias ate vencimento with color */}
                    {conv.dias_ate_vencimento != null && (
                      <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                        <span className="text-xs text-gray-500">Dias ate vencimento</span>
                        <span className={`text-sm ${diasColor(conv.dias_ate_vencimento)}`}>
                          {conv.dias_ate_vencimento < 0 ? `${Math.abs(conv.dias_ate_vencimento)}d vencido` : `${conv.dias_ate_vencimento}d`}
                        </span>
                      </div>
                    )}

                    {/* Per-convenio tag badges */}
                    {(conv.tag_desembolso || conv.tag_lobby) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {conv.tag_desembolso && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Desembolso
                          </span>
                        )}
                        {conv.tag_lobby && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                            Lobby
                          </span>
                        )}
                      </div>
                    )}

                    {/* Alert badge per-convenio */}
                    {conv.alerta_desembolso && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-xs text-amber-700 font-medium" title="Projeto sem desembolso — repasse aprovado mas nenhum valor movimentado">Projeto sem desembolso — repasse aprovado mas nenhum valor movimentado</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer — contact badge summary (no action buttons — read-only) */}
        {contactPresent && (
          <div className="p-4 border-t border-gray-200">
            <span className="text-xs text-gray-500">Este proponente possui contato registrado no CRM.</span>
          </div>
        )}
      </div>
    </div>
  )
}
