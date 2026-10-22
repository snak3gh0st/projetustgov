'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatCNPJ, formatCompactCurrency, formatDate, whatsappMeUrlFromTelefone } from '@/lib/format'
import ContactNotesTimeline from '@/components/ContactNotesTimeline'
import { formatCrmStatusLabel, normalizeCrmStatus } from '@/lib/crm-catalog'
import SlideOver, { SlideOverSection } from '@/components/ui/SlideOver'
import StatusPill from '@/components/ui/StatusPill'
import { buttonClass } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Tag } from '@/components/leads/list-ui'

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
  observacoesExecucao?: string | null
  userRole?: string
  onContactSummaryUpdate?: (payload: {
    cnpj: string
    contact_telefone: string | null
    contact_email: string | null
    contact_nome: string | null
    contact_telefone_status: string | null
  }) => void
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
  rendimento_aplicacao: string | null
  ingresso_contrapartida: string | null
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
  if (dias == null) return 'text-ink-3'
  if (dias < 0) return 'font-semibold text-red-700 dark:text-red-300'
  if (dias < 30) return 'font-medium text-red-700 dark:text-red-300'
  if (dias <= 90) return 'text-amber-700 dark:text-amber-300'
  return 'text-ink-2'
}

const TX_BASE = 'https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta'

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
  observacoesExecucao: initialObs,
  userRole,
  onContactSummaryUpdate,
  onClose,
}: ExecucaoSlideOverProps) {
  const router = useRouter()
  const toast = useToast()
  const [detailRows, setDetailRows] = useState<ExecucaoDetailRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [crmStatus, setCrmStatus] = useState<string | null>(null)
  const [crmObservacoes, setCrmObservacoes] = useState<string | null>(null)
  const [obsExecucao, setObsExecucao] = useState(initialObs ?? '')
  const canModify = userRole !== 'visualizador'
  const detailCacheRef = useRef<Record<string, ExecucaoDetailRow[]>>({})
  const contactsCacheRef = useRef<Record<string, ContactRow[]>>({})
  const crmCacheRef = useRef<Record<string, { status: string | null; observacoes: string | null }>>({})

  const emitContactSummary = useCallback((targetCnpj: string, list: ContactRow[]) => {
    if (!onContactSummaryUpdate) return
    const principal = list.find(c => c.principal && (c.telefone || c.email))
      || list.find(c => c.telefone || c.email)
      || null

    onContactSummaryUpdate({
      cnpj: targetCnpj,
      contact_telefone: principal?.telefone ?? null,
      contact_email: principal?.email ?? null,
      contact_nome: principal?.nome_pessoa ?? null,
      contact_telefone_status: principal?.telefone_status ?? null,
    })
  }, [onContactSummaryUpdate])

  const fetchAndEnrichContacts = useCallback(async (targetCnpj: string, showLoader = true) => {
    setContactsLoading(showLoader)
    const cachedContacts = contactsCacheRef.current[targetCnpj]
    try {
      // 1. Fetch existing contacts from DB
      const res = await fetch(`/api/leads/${encodeURIComponent(targetCnpj)}/contacts`)
      if (res.ok) {
        const data = await res.json()
        const existing: ContactRow[] = Array.isArray(data) ? data : []
        if (existing.length > 0) {
          contactsCacheRef.current[targetCnpj] = existing
          setContacts(existing)
          emitContactSummary(targetCnpj, existing)
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
            const enriched = Array.isArray(data2) ? data2 : []
            contactsCacheRef.current[targetCnpj] = enriched
            setContacts(enriched)
            emitContactSummary(targetCnpj, enriched)
            return
          }
        }
      } catch {
        // BrasilAPI failed silently — no contacts to show
      }

      setContacts([])
      contactsCacheRef.current[targetCnpj] = []
      emitContactSummary(targetCnpj, [])
    } catch {
      if (cachedContacts === undefined) {
        setContacts([])
        contactsCacheRef.current[targetCnpj] = []
        emitContactSummary(targetCnpj, [])
      }
    } finally {
      setContactsLoading(false)
    }
  }, [emitContactSummary])

  useEffect(() => {
    if (!cnpj) return

    const cachedDetails = detailCacheRef.current[cnpj]
    const cachedContacts = contactsCacheRef.current[cnpj]
    const cachedCrm = crmCacheRef.current[cnpj]
    const hasCachedDetails = cachedDetails !== undefined
    const hasCachedContacts = cachedContacts !== undefined
    setDetailRows(cachedDetails ?? [])
    setDetailLoading(!hasCachedDetails)
    setDetailError(false)
    setContacts(cachedContacts ?? [])
    setContactsLoading(!hasCachedContacts)
    setCrmStatus(cachedCrm?.status ?? null)
    setCrmObservacoes(cachedCrm?.observacoes ?? null)
    setObsExecucao(initialObs ?? '')

    // Fetch CRM status + observacoes from vendedor_projetos via leads API
    fetch(`/api/leads?search=${encodeURIComponent(cnpj)}&limit=1`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const rows = Array.isArray(data) ? data : []
        const match = rows.find((r: { cnpj: string }) => r.cnpj?.replace(/\D/g, '') === cnpj.replace(/\D/g, ''))
        const next = {
          status: match?.status_contato || null,
          observacoes: match?.observacoes || null,
        }
        crmCacheRef.current[cnpj] = next
        setCrmStatus(next.status)
        setCrmObservacoes(next.observacoes)
      })
      .catch(() => {})

    fetch(`/api/execucao/${encodeURIComponent(cnpj)}`)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json()
      })
      .then(data => {
        const nextRows = Array.isArray(data) ? data : []
        detailCacheRef.current[cnpj] = nextRows
        setDetailRows(nextRows)
      })
      .catch(() => {
        if (!hasCachedDetails) setDetailError(true)
      })
      .finally(() => setDetailLoading(false))

    void fetchAndEnrichContacts(cnpj, !hasCachedContacts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj, fetchAndEnrichContacts])

  // O cabeçalho do último CNPJ aberto continua visível enquanto o painel fecha.
  const headerRef = useRef({ cnpj: '', nomeProponente, temAlerta, contactPresent, totalValorGlobal, totalPropostas, tagAutossuficiente, tagIniciante, tagDesembolso, tagLobby, tagRendimento })
  if (cnpj) {
    headerRef.current = { cnpj, nomeProponente, temAlerta, contactPresent, totalValorGlobal, totalPropostas, tagAutossuficiente, tagIniciante, tagDesembolso, tagLobby, tagRendimento }
  }
  const h = headerRef.current
  const whatsappContact = contacts.find(c => c.principal && c.telefone && whatsappMeUrlFromTelefone(c.telefone)) || contacts.find(c => c.telefone && whatsappMeUrlFromTelefone(c.telefone))
  const emailContact = contacts.find(c => c.principal && c.email) || contacts.find(c => c.email)

  async function saveObservacoes() {
    if (!h.cnpj) return
    try {
      const res = await fetch(`/api/execucao/${encodeURIComponent(h.cnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes_execucao: obsExecucao }),
      })
      if (!res.ok) throw new Error('patch failed')
    } catch {
      toast.error('Não foi possível salvar as observações. Tente de novo.')
    }
  }

  return (
    <SlideOver
      open={!!cnpj}
      onClose={onClose}
      widthClass="sm:max-w-[460px]"
      title={h.nomeProponente || 'Sem nome'}
      subtitle={h.cnpj ? formatCNPJ(h.cnpj) : undefined}
      headerExtra={
        <>
          {h.temAlerta && <Tag tone="amber">Alerta</Tag>}
          {h.contactPresent && <Tag tone="sky">Com contato</Tag>}
          {h.tagAutossuficiente && <Tag tone="rose" title="Mais de 5 propostas executadas">Autossuficiente</Tag>}
          {h.tagIniciante && <Tag tone="sky" title="Menos de 5 propostas executadas">Iniciante</Tag>}
          {h.tagDesembolso && <Tag tone="emerald" title="Projeto com menos de 100 dias de execução">Desembolso</Tag>}
          {h.tagLobby && <Tag tone="violet" title="Projeto com mais de 100 dias de execução e nenhum desembolso">Lobby</Tag>}
          {h.tagRendimento && <Tag tone="teal" title="Rendimento bancário significativo">Rendimento</Tag>}
        </>
      }
      footer={
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!whatsappContact}
            onClick={() => {
              const url = whatsappContact?.telefone ? whatsappMeUrlFromTelefone(whatsappContact.telefone) : null
              if (url) window.open(url, '_blank')
            }}
            className={buttonClass('secondary', 'md', 'w-full text-emerald-700 dark:text-emerald-300')}
          >
            WhatsApp
          </button>
          <button
            type="button"
            disabled={!emailContact}
            onClick={() => { if (emailContact?.email) window.open(`mailto:${emailContact.email}`, '_blank') }}
            className={buttonClass('secondary', 'md', 'w-full')}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => router.push(`/lead/${encodeURIComponent(h.cnpj)}`)}
            className={buttonClass('primary', 'md', 'w-full')}
          >
            Abrir card
          </button>
        </div>
      }
    >
      <div className="flex items-end justify-between gap-3 rounded-lg bg-raised/70 px-3 py-2.5">
        <div>
          <p className="text-xs text-ink-3">Valor total dos convênios</p>
          <p className="font-heading text-lg font-semibold tabular text-ink">{formatCompactCurrency(h.totalValorGlobal)}</p>
        </div>
        {h.totalPropostas > 0 && (
          <Tag
            tone={h.totalPropostas >= 6 ? 'rose' : h.totalPropostas >= 3 ? 'amber' : 'neutral'}
            title="Propostas já executadas por este proponente. Quanto mais, menor a prioridade."
          >
            {h.totalPropostas} {h.totalPropostas === 1 ? 'proposta executada' : 'propostas executadas'}
          </Tag>
        )}
      </div>

      <SlideOverSection title={contacts.length > 0 ? `Contatos (${contacts.length})` : 'Contatos'}>
        {contactsLoading ? (
          <div className="space-y-2" role="status" aria-label="Buscando contatos">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhum contato encontrado para este CNPJ.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map(c => (
              <li key={c.id} className={`rounded-lg p-3 ring-1 ring-inset ${c.principal ? 'bg-accent-soft/50 ring-accent/30' : 'ring-line'}`}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  {c.nome_pessoa && <span className="text-sm font-medium text-ink">{c.nome_pessoa}</span>}
                  {c.cargo && <Tag tone="neutral">{c.cargo}</Tag>}
                  {c.principal && <span className="text-xs font-medium text-accent-ink">Principal</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {c.telefone && whatsappMeUrlFromTelefone(c.telefone) && (
                    <a href={whatsappMeUrlFromTelefone(c.telefone)!} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 hover:underline dark:text-emerald-300" title="Conversar no WhatsApp">
                      {c.telefone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="text-accent-ink hover:underline">{c.email}</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SlideOverSection>

      <SlideOverSection title="Observações">
        {canModify ? (
          <textarea
            rows={3}
            aria-label="Observações da execução"
            value={obsExecucao}
            onChange={e => setObsExecucao(e.target.value)}
            onBlur={() => { void saveObservacoes() }}
            placeholder="Anote o que importa sobre este lead"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        ) : (
          <p className="whitespace-pre-wrap rounded-lg bg-raised/70 p-3 text-sm text-ink-2">{obsExecucao || 'Sem observações'}</p>
        )}
      </SlideOverSection>

      {(crmStatus || crmObservacoes) && (
        <SlideOverSection title="No funil de Aprovação">
          <div className="space-y-2 rounded-lg bg-raised/70 p-3">
            {crmStatus && <StatusPill status={normalizeCrmStatus(crmStatus)} label={formatCrmStatusLabel(crmStatus)} />}
            {crmObservacoes && <p className="whitespace-pre-wrap text-sm text-ink-2">{crmObservacoes}</p>}
          </div>
        </SlideOverSection>
      )}

      {h.cnpj && <ContactNotesTimeline cnpj={h.cnpj} canModify={canModify} />}

      <SlideOverSection title={detailRows.length > 0 ? `Convênios (${detailRows.length})` : 'Convênios'}>
        {detailLoading ? (
          <div className="space-y-2" role="status" aria-label="Carregando convênios">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : detailError ? (
          <p className="text-sm text-red-700 dark:text-red-300">Não foi possível carregar os convênios.</p>
        ) : detailRows.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhum convênio encontrado.</p>
        ) : (
          <ul className="space-y-3">
            {detailRows.map(conv => {
              const pct = Math.min(100, Number(conv.pct_execucao) || 0)
              const desembolsado = Number(conv.valor_desembolsado) || 0
              const contrapartida = Number(conv.ingresso_contrapartida) || 0
              const rendimento = Number(conv.rendimento_aplicacao) || 0
              const saldo = Number(conv.saldo_conta) || 0
              const gastoEfetivo = Math.max(0, desembolsado + contrapartida + rendimento - saldo)
              const semDesembolso = desembolsado === 0
              return (
                <li
                  key={conv.nr_convenio}
                  className={`space-y-3 rounded-lg p-4 ring-1 ring-inset ${semDesembolso ? 'bg-amber-50/50 ring-amber-200 dark:bg-amber-500/[0.06] dark:ring-amber-500/25' : 'ring-line'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <span className="font-mono text-ink-3">#{conv.nr_convenio}</span>
                      <a
                        href={`${TX_BASE}/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${conv.nr_convenio}&destino=`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent-ink hover:underline"
                      >
                        Convênio no TransfereGov
                      </a>
                      {conv.id_proposta && conv.situacao === 'Em execução' && (
                        <a
                          href={`${TX_BASE}/ResultadoDaConsultaDePropostaDetalharProposta.do?idProposta=${conv.id_proposta}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-2 hover:text-ink hover:underline"
                        >
                          Proposta
                        </a>
                      )}
                    </div>
                    {conv.modalidade && <Tag tone="neutral">{conv.modalidade}</Tag>}
                  </div>

                  {conv.objeto && <p className="line-clamp-2 text-xs text-ink-2" title={conv.objeto}>{conv.objeto}</p>}

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-3">Execução</span>
                      <span className="font-medium tabular text-ink">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-line">
                      <div
                        className="h-1.5 rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-label="Percentual de execução"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                    <div className="col-span-2 border-b border-line pb-2">
                      <dt className="text-xs text-ink-3">Valor do convênio</dt>
                      <dd className="font-heading text-lg font-semibold tabular text-ink">{formatCompactCurrency(conv.valor_global)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Desembolsado (federal)</dt>
                      <dd className="font-semibold tabular text-accent-ink">{formatCompactCurrency(conv.valor_desembolsado)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Saldo em conta</dt>
                      <dd className="font-medium tabular text-amber-700 dark:text-amber-300">{formatCompactCurrency(conv.saldo_conta)}</dd>
                    </div>
                    {contrapartida > 0 && (
                      <div>
                        <dt className="text-xs text-ink-3">Contrapartida depositada</dt>
                        <dd className="tabular text-ink-2">{formatCompactCurrency(contrapartida)}</dd>
                      </div>
                    )}
                    {rendimento > 0 && (
                      <div>
                        <dt className="text-xs text-ink-3">Rendimento da aplicação</dt>
                        <dd className="tabular text-ink-2">{formatCompactCurrency(rendimento)}</dd>
                      </div>
                    )}
                    <div className="col-span-2 rounded-md bg-raised/70 px-3 py-2">
                      <dt className="text-xs text-ink-3">Gasto efetivo (entradas menos saldo)</dt>
                      <dd className="font-semibold tabular text-ink">{formatCompactCurrency(gastoEfetivo)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Fim da vigência</dt>
                      <dd className="tabular text-ink-2">{formatDate(conv.data_fim_vigencia)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Dias em execução</dt>
                      <dd className="tabular text-ink-2">{conv.dias_em_execucao ?? '-'}</dd>
                    </div>
                    {conv.dias_ate_vencimento != null && (
                      <div className="col-span-2 flex items-center justify-between border-t border-line pt-2">
                        <dt className="text-xs text-ink-3">Até o vencimento</dt>
                        <dd className={`tabular ${diasColor(conv.dias_ate_vencimento)}`}>
                          {conv.dias_ate_vencimento < 0 ? `vencido há ${Math.abs(conv.dias_ate_vencimento)}d` : `${conv.dias_ate_vencimento}d`}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {(conv.tag_desembolso || conv.tag_lobby || semDesembolso) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {conv.tag_desembolso && <Tag tone="emerald">Desembolso</Tag>}
                      {conv.tag_lobby && <Tag tone="violet">Lobby</Tag>}
                      {semDesembolso && (
                        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                          Sem desembolso: repasse aprovado e nenhum valor movimentado.
                        </span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </SlideOverSection>
    </SlideOver>
  )
}
