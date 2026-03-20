'use client'

import { useState, useEffect } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'

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

  useEffect(() => {
    if (!cnpj) return

    // Clear stale data immediately (Pitfall 6 from RESEARCH)
    setDetailRows([])
    setDetailLoading(true)
    setDetailError(false)

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

    return () => document.removeEventListener('keydown', handler)
  }, [cnpj, onClose])

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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title="Mais de 5 propostas executadas">
                Autossuficiente
              </span>
            )}
            {tagIniciante && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200" title="Menos de 5 propostas executadas">
                Iniciante
              </span>
            )}
            {tagDesembolso && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200" title="Projeto com menos de 100 dias de execucao">
                Desembolso
              </span>
            )}
            {tagLobby && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200" title="Projeto com +100 dias de execucao e desembolso zero">
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
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                            Desembolso
                          </span>
                        )}
                        {conv.tag_lobby && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
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
