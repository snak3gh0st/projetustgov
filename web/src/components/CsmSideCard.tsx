'use client'

import { useEffect, useState } from 'react'
import { formatCNPJ, formatCompactCurrency, formatDate } from '@/lib/format'

interface CsmContact {
  id: number
  nome_pessoa: string | null
  cargo: string | null
  telefone: string | null
  email: string | null
  principal: boolean
  status_contato: string | null
  created_at: string
  created_by: number | null
  created_by_nome: string | null
}

interface CsmProject {
  cnpj: string
  identifier: string
  nr_proposta: string
  objeto: string | null
  situacao: string | null
  valor_global: number | null
  valor_repasse: number | null
  valor_desembolsado: number | null
  saldo_conta: number | null
  rendimento_aplicacao: number | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  uf: string | null
  municipio: string | null
  priority_level: 1 | 2 | 3 | 5 | null
}

interface CsmClientDetails {
  cnpj: string
  contacts: CsmContact[]
  projects: CsmProject[]
  location: {
    uf: string | null
    municipio: string | null
  }
}

interface CsmSideCardProps {
  cnpj: string
  onClose: () => void
}

const getPadUrl = (nrConvenio: string) =>
  `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${nrConvenio}&destino=`

const SITUACAO_COLORS: Record<string, string> = {
  'Em execução': 'bg-blue-50 text-blue-600 border-blue-200',
  'Concluído': 'bg-green-50 text-green-600 border-green-200',
  'Prestaçao de contas': 'bg-amber-50 text-amber-600 border-amber-200',
  'Prestação de contas': 'bg-amber-50 text-amber-600 border-amber-200',
}

export default function CsmSideCard({ cnpj, onClose }: CsmSideCardProps) {
  const [data, setData] = useState<CsmClientDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits.length !== 14) {
      setError('CNPJ inválido')
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        const res = await fetch(`/api/csm/client-details/${cnpjDigits}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Falha ao carregar dados')
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error('[CsmSideCard] Fetch error:', err)
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [cnpj])

  useEffect(() => {
    if (!data) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [data, onClose])

  if (!data) return null

  const principalContact = data.contacts.find(c => c.principal) || data.contacts[0]
  const projectCount = data.projects.length

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0072F7] to-blue-400 pointer-events-none" />

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0072F7]" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="text-red-500 mb-2">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">{error}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="relative p-6 pb-4">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-800 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>

              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 pr-8">Detalhes do Cliente</h2>
                  <p className="font-mono text-sm text-gray-400 mt-1">{formatCNPJ(data.cnpj)}</p>
                </div>
              </div>

              {data.location.uf && (
                <span className="inline-block mt-3 text-xs font-medium rounded-full px-3 py-1 border bg-gray-50 text-gray-600 border-gray-200">
                  {data.location.uf} / {data.location.municipio}
                </span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
              {/* Principal Contact */}
              {principalContact && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contato Principal
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <p className="text-sm font-semibold text-gray-900">
                      {principalContact.nome_pessoa || '-'}
                    </p>
                    {principalContact.cargo && (
                      <p className="text-xs text-gray-500">{principalContact.cargo}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Contacts List */}
              {data.contacts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contatos ({data.contacts.length})
                  </h3>
                  {data.contacts.map((contact) => {
                    const phoneDigits = contact.telefone?.replace(/\D/g, '') || ''
                    return (
                      <div
                        key={contact.id}
                        className={`rounded-xl p-3 border ${
                          contact.principal
                            ? 'bg-white border-gray-300'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {contact.nome_pessoa || '-'}
                            </p>
                            {contact.cargo && (
                              <p className="text-xs text-gray-500">{contact.cargo}</p>
                            )}
                          </div>
                          {contact.principal && (
                            <span className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-[#0072F7] text-white">
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {contact.telefone && (
                            <div className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <path d="M1 3c0-1.1.9-2 2-2h2.5a1 1 0 01.98.8l.5 3a1 1 0 01-.27.9L5.1 7.3a10 10 0 004.6 4.6l1.6-1.6a1 1 0 01.9-.27l3 .5a1 1 0 01.8.98V14a2 2 0 01-2 2A13 13 0 011 3z"/>
                              </svg>
                              <a
                                href={`tel:${contact.telefone}`}
                                className="text-xs text-[#0072F7] hover:text-blue-700"
                              >
                                {contact.telefone}
                              </a>
                              {phoneDigits && (
                                <a
                                  href={`https://wa.me/55${phoneDigits}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-600 hover:text-green-700"
                                  title="WhatsApp"
                                >
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 1a7 7 0 00-6.1 10.4L1 15l3.7-.9A7 7 0 108 1zm3.6 9.8c-.15.43-.9.82-1.24.87-.34.05-.77.07-1.24-.08a11.4 11.4 0 01-1.12-.42 8.7 8.7 0 01-3.45-3.05c-.3-.39-.6-.8-.82-1.24-.22-.44-.11-.66.08-.87l.27-.31c.09-.1.19-.26.28-.39.1-.13.13-.22.19-.37.06-.15.03-.28-.02-.39s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31s-.86.84-.86 2.06.88 2.39 1 2.56c.13.17 1.75 2.67 4.23 3.74.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28z"/>
                                  </svg>
                                </a>
                              )}
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                                <path d="M1 4l7 5 7-5"/>
                              </svg>
                              <a
                                href={`mailto:${contact.email}`}
                                className="text-xs text-[#0072F7] hover:text-blue-700 truncate"
                              >
                                {contact.email}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Projects */}
              {projectCount > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Projetos ({projectCount})
                  </h3>
                  {data.projects.map((project) => (
                    <a
                      key={project.identifier}
                      href={getPadUrl(project.identifier)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-gray-50 rounded-xl p-3 border border-gray-200 hover:border-[#0072F7] hover:bg-blue-50/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">
                          {project.identifier}
                        </span>
                        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${
                          SITUACAO_COLORS[project.situacao || ''] ||
                          'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {project.situacao || '-'}
                        </span>
                      </div>
                      {project.objeto && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{project.objeto}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                        {project.valor_global != null && (
                          <span>Global: {formatCompactCurrency(project.valor_global)}</span>
                        )}
                        {project.valor_repasse != null && (
                          <span>Repasse: {formatCompactCurrency(project.valor_repasse)}</span>
                        )}
                        {project.saldo_conta != null && project.saldo_conta > 0 && (
                          <span className="text-green-600 font-medium">
                            Saldo: {formatCompactCurrency(project.saldo_conta)}
                          </span>
                        )}
                      </div>
                      {project.data_fim_vigencia && (
                        <p className="text-[10px] text-gray-400 mt-2">
                          Vigência: {formatDate(project.data_inicio_vigencia)} — {formatDate(project.data_fim_vigencia)}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {data.contacts.length === 0 && projectCount === 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-2">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8M12 8v8" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Nenhum dado encontrado</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}