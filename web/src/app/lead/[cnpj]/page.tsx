'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatCNPJ, formatCurrency, googleCalendarEventUrl, whatsappMeUrlFromTelefone } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'
import LeadContacts from '@/components/LeadContacts'
import SaleModal from '@/components/SaleModal'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Tag } from '@/components/leads/list-ui'
import LeadTimeline from '@/components/lead-card/LeadTimeline'
import EmendasAprovacao from '@/components/lead-card/EmendasAprovacao'
import ConveniosExecucao, { type ConvenioRow } from '@/components/lead-card/ConveniosExecucao'
import ContatoLead from '@/components/lead-card/ContatoLead'
import { canEditLeads, canModifyData, hasTeamCommercialView } from '@/lib/roles'
import { canUseWhatsapp } from '@/lib/whatsapp/access'
import { canonicalPhone } from '@/lib/whatsapp/phone'
import { CRM_STATUS_SELECT_OPTIONS, isClosedCrmStatus, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'
import { abreModalDeVenda, contatoExibido, execucaoStatusDoCnpj, responsaveis } from '@/lib/lead-timeline'
import type { LeadContact } from '@/lib/types'

type SaleModalState = { projetoId: number; tipoVendedor: string | null; isExclusivo: boolean; contratoAssinado: boolean }

function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/leads'))}
      className="inline-flex items-center gap-1 text-sm text-ink-3 transition-colors duration-fast hover:text-ink focus:outline-none focus-visible:text-ink focus-visible:underline"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Voltar
    </button>
  )
}

function CardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando lead">
      <Skeleton className="h-4 w-16" />
      <div className="space-y-2"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-96 w-full" />
        <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const params = useParams()
  const toast = useToast()
  const cnpj = decodeURIComponent(params.cnpj as string)
  const cnpjClean = cnpj.replace(/\D/g, '')

  const [projetos, setProjetos] = useState<VendedorProjeto[]>([])
  const [convenios, setConvenios] = useState<ConvenioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [saleModal, setSaleModal] = useState<SaleModalState | null>(null)
  const [contatos, setContatos] = useState<LeadContact[]>([])
  // Sobem depois de uma gravação confirmada: recarregam histórico e lista de contatos.
  const [historyBump, setHistoryBump] = useState(0)
  const [contactsBump, setContactsBump] = useState(0)
  const [contatosReload, setContatosReload] = useState(0)
  // WhatsApp ligado para este usuário: o botão do topo abre a conversa no PROJETE.
  const [whatsappOn, setWhatsappOn] = useState(false)
  useEffect(() => {
    fetch(`/api/whatsapp/conversas?filtro=todas&cnpj=${cnpjClean}`, { cache: 'no-store' })
      .then((r) => setWhatsappOn(r.ok))
      .catch(() => setWhatsappOn(false))
  }, [cnpjClean])

  useEffect(() => {
    Promise.all([
      fetch(`/api/leads?search=${encodeURIComponent(cnpj)}&limit=100`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/execucao/${encodeURIComponent(cnpjClean)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([leadsData, execData]) => {
      const rows = (Array.isArray(leadsData) ? leadsData : [])
        .filter((p: VendedorProjeto) => p.cnpj?.replace(/\D/g, '') === cnpjClean)
        .map((p: VendedorProjeto) => ({
          ...p,
          status_contato: normalizeCrmStatus(p.status_contato),
          tipo_vendedor: normalizeTipoVendedor(p.tipo_vendedor),
        }))
      setProjetos(rows)
      setConvenios(Array.isArray(execData) ? execData : [])
      setLoading(false)
    })

    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((session) => { if (session?.user?.role) setUserRole(session.user.role) })
      .catch(() => {})
  }, [cnpj, cnpjClean])

  const role = userRole ?? ''
  const canModify = canEditLeads(role)
  const first = projetos[0]
  // As rotas do lead comparam o CNPJ exato gravado em vendedor_projetos.
  const apiCnpj = first?.cnpj ?? cnpjClean
  const execStatus = useMemo(
    () => execucaoStatusDoCnpj(projetos.map((p) => ({ status: p.status_contato_execucao, updated_at: p.updated_at }))),
    [projetos]
  )
  const bumpHistory = () => setHistoryBump((n) => n + 1)

  useEffect(() => {
    if (loading) return
    let cancelled = false
    fetch(`/api/leads/${encodeURIComponent(apiCnpj)}/contacts`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setContatos(Array.isArray(d) ? d : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [apiCnpj, loading, contactsBump, contatosReload])

  async function patchLead(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(apiCnpj)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ? `Não foi possível salvar: ${err.error}` : 'Não foi possível salvar. Tente de novo.')
        return null
      }
      return await res.json().catch(() => ({}))
    } catch {
      toast.error('Sem conexão. Recarregue a página e tente de novo.')
      return null
    }
  }

  // A resposta do PATCH traz a linha como ficou no banco (comissão já com a redação do papel).
  const NUMERIC_KEYS = ['comissao_percentual', 'comissao_valor', 'comissao_bonus', 'closer_comissao_percentual', 'closer_comissao_valor'] as const
  const mergeFromServer = (data: Record<string, unknown>): Partial<VendedorProjeto> => {
    const out: Record<string, unknown> = {}
    for (const key of NUMERIC_KEYS) if (key in data) out[key] = data[key] == null ? null : Number(data[key])
    if ('venda_etapa' in data) out.venda_etapa = data.venda_etapa
    if ('closer_id' in data) out.closer_id = data.closer_id
    if ('contrato_assinado' in data) out.contrato_assinado = Boolean(data.contrato_assinado)
    if ('status_contato' in data && data.status_contato != null) out.status_contato = normalizeCrmStatus(data.status_contato as string)
    return out as Partial<VendedorProjeto>
  }

  async function updateProjeto(id: number, field: 'status_contato' | 'observacoes', value: string) {
    // Venda concluída passa pelo SaleModal (valor, serviço, contrato).
    const projeto = projetos.find((p) => p.id === id)
    if (field === 'status_contato' && abreModalDeVenda(projeto?.status_contato, value)) {
      setSaleModal({
        projetoId: id,
        tipoVendedor: projeto?.tipo_vendedor || null,
        isExclusivo: projeto?.tipo_vendedor === 'In-Sites Sells' || projeto?.tipo_vendedor === 'Exclusivo',
        contratoAssinado: !!projeto?.contrato_assinado,
      })
      return
    }
    const data = await patchLead({ id, [field]: value })
    if (!data) return
    setProjetos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value, ...mergeFromServer(data) } : p)))
    if (field === 'status_contato') bumpHistory()
  }

  async function submitFechado(projetoId: number, sale: { valor_venda: number; status_contato?: string; contrato_assinado?: boolean; tipo_servico: string }) {
    const finalStatus = sale.status_contato || 'Vendas Aprovação'
    const body: Record<string, unknown> = { id: projetoId, status_contato: finalStatus, valor_venda: sale.valor_venda, tipo_servico: sale.tipo_servico }
    if (sale.contrato_assinado !== undefined) body.contrato_assinado = sale.contrato_assinado
    const data = await patchLead(body)
    if (!data) return
    setProjetos((prev) => prev.map((p) => (p.id === projetoId
      ? {
          ...p,
          status_contato: normalizeCrmStatus(finalStatus),
          valor_venda: sale.valor_venda,
          tipo_servico: sale.tipo_servico as VendedorProjeto['tipo_servico'],
          ...mergeFromServer(data),
        }
      : p)))
    setSaleModal(null)
    bumpHistory()
    toast.success('Venda registrada.')
  }

  async function setContratoAssinado(projetoId: number, value: boolean) {
    setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, contrato_assinado: value } : p)))
    const data = await patchLead({ id: projetoId, contrato_assinado: value })
    if (!data) setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, contrato_assinado: !value } : p)))
  }

  async function saveContato(campo: 'telefone' | 'email', valor: string, contatoId: number | null): Promise<boolean> {
    if (contatoId != null) {
      // O valor exibido vem do contato principal: a edição vai para ele, senão some ao recarregar.
      const res = await fetch(`/api/leads/${encodeURIComponent(apiCnpj)}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contatoId, [campo]: valor }),
      }).catch(() => null)
      if (!res?.ok) {
        toast.error('Não foi possível salvar o contato. Tente de novo.')
        return false
      }
      setContatos((prev) => prev.map((c) => (c.id === contatoId ? { ...c, [campo]: valor } : c)))
      setContactsBump((n) => n + 1)
      return true
    }
    if (!first) return false
    const data = await patchLead({ id: first.id, [campo]: valor })
    if (!data) return false
    setProjetos((prev) => prev.map((p) => (p.id === first.id ? { ...p, [campo]: valor } : p)))
    return true
  }

  async function updateExecStatus(value: string) {
    const previous = projetos.map((p) => p.status_contato_execucao)
    setProjetos((prev) => prev.map((p) => ({ ...p, status_contato_execucao: value })))
    try {
      const res = await fetch(`/api/execucao/${encodeURIComponent(cnpjClean)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_contato: value }),
      })
      if (!res.ok) throw new Error(String(res.status))
      bumpHistory()
    } catch {
      setProjetos((prev) => prev.map((p, i) => ({ ...p, status_contato_execucao: previous[i] })))
      toast.error('Não foi possível salvar o status de Execução. Tente de novo.')
    }
  }

  if (loading) return <CardSkeleton />

  if (projetos.length === 0 && convenios.length === 0) {
    return (
      <div className="space-y-5">
        <BackButton />
        <Panel>
          <EmptyState title="Lead não encontrado" description="Este CNPJ não tem emendas nem convênios que você possa ver." />
        </Panel>
      </div>
    )
  }

  const nome = first?.nome || (convenios[0] as ConvenioRow & { nome_proponente?: string | null })?.nome_proponente || 'Sem nome'
  const place = [first?.municipio, first?.uf].filter(Boolean).join(', ')
  const donos = responsaveis(projetos)
  // Mesma regra de /api/leads: primeiro contato (principal antes), senão o do lead.
  const exibido = contatoExibido(contatos, { telefone: first?.telefone ?? null, email: first?.email ?? null })
  const telefone = exibido.telefone.valor
  const email = exibido.email.valor
  // Telefones do lead para o WhatsApp: contatos e o do próprio lead, sem repetir.
  const telefonesWhatsapp = Array.from(new Map(
    [...contatos.map((c) => ({ raw: c.telefone, nome: c.nome_pessoa })), { raw: first?.telefone ?? null, nome: null }]
      .map((t) => ({ valor: canonicalPhone(t.raw), nome: t.nome }))
      .filter((t): t is { valor: string; nome: string | null } => Boolean(t.valor))
      .map((t) => [t.valor, { valor: t.valor, label: `${t.nome ? `${t.nome} · ` : ''}(${t.valor.slice(2, 4)}) ${t.valor.slice(4, -4)}-${t.valor.slice(-4)}` }] as const)
  ).values())
  const telefonePrincipal = canonicalPhone(telefone)
  const whatsappUrl = whatsappOn && telefonePrincipal
    ? `/conversas?telefone=${telefonePrincipal}&cnpj=${cnpjClean}`
    : whatsappMeUrlFromTelefone(telefone)
  const temReuniao = projetos.some((p) => p.status_contato === 'Reunião Agendada') || normalizeCrmStatus(execStatus) === 'Reunião Agendada'
  const totalEmendas = projetos.reduce((sum, p) => sum + (Number(p.valor_emenda) || 0), 0)
  // Mesma trava da lista de Execução: gestão acompanha, consultor muda.
  const execEditable = canModify && role !== 'gestor' && role !== 'diretoria' && role !== 'coordenador'

  return (
    <div className="space-y-5">
      <BackButton />

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold text-ink [overflow-wrap:anywhere] [text-wrap:balance]">{nome}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <span className="font-mono text-ink-3">{formatCNPJ(cnpjClean)}</span>
            {place && <><span aria-hidden className="text-ink-3">·</span><span>{place}</span></>}
            <span aria-hidden className="text-ink-3">·</span>
            <span>{donos.length === 0 ? 'Sem dono' : `${donos.length > 1 ? 'Responsáveis' : 'Responsável'}: ${donos.join(', ')}`}</span>
          </p>
          {(first?.is_max_priority || first?.is_existing_client) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              {first?.is_max_priority && <Tag tone="rose">Máxima prioridade</Tag>}
              {first?.is_existing_client && <Tag tone="violet">Cliente existente</Tag>}
              {first?.is_max_priority && <span className="text-xs text-ink-3">Nunca executou um convênio: alta chance de conversão.</span>}
            </div>
          )}
        </div>
        {(whatsappUrl || email) && (
          <div className="flex flex-wrap gap-2">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('secondary', 'sm')}
              >
                WhatsApp
              </a>
            )}
            {email && <a href={`mailto:${email}`} className={buttonClass('secondary', 'sm')}>Email</a>}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <LeadTimeline
          cnpj={apiCnpj}
          canWriteNotes={canModifyData(role)}
          refreshKey={historyBump}
          cnpjDigits={projetos.length > 0 ? cnpjClean : undefined}
          telefones={telefonesWhatsapp}
          canSendWhatsapp={canUseWhatsapp(role) && canModify}
        />

        {/* No celular, status e ações vêm antes da linha do tempo. */}
        <aside className="order-first min-w-0 space-y-4 lg:order-none" aria-label="Detalhes do lead">
          <Panel title="Reunião" padded={false}>
            <div className="space-y-3 px-4 py-3">
              <p className="text-sm text-ink-2">
                {temReuniao ? 'Reunião marcada com este lead.' : 'Nenhuma reunião marcada.'}
              </p>
              <a
                href={googleCalendarEventUrl({
                  title: `Reunião PROJETUS: ${nome}`,
                  details: [
                    `Instituição: ${nome}`,
                    telefone ? `Telefone: ${telefone}` : null,
                    email ? `Email: ${email}` : null,
                    `CNPJ: ${formatCNPJ(cnpjClean)}`,
                    'Local: Google Meet',
                  ].filter(Boolean).join('\n'),
                  guestEmail: email,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('secondary', 'sm', 'w-full')}
              >
                Agendar no Google Agenda
              </a>
            </div>
          </Panel>

          {projetos.length > 0 && (
            <Panel
              title={`Emendas em Aprovação (${projetos.length})`}
              description={projetos.length > 1 ? `Total ${formatCurrency(totalEmendas)}` : undefined}
              padded={false}
            >
              <EmendasAprovacao
                projetos={projetos}
                userRole={userRole}
                canModify={canModify}
                onStatus={(id, value) => void updateProjeto(id, 'status_contato', value)}
                onObservacao={(id, value) => void updateProjeto(id, 'observacoes', value)}
                onContrato={(id, value) => void setContratoAssinado(id, value)}
                onAutorizar={(p) => setSaleModal({ projetoId: p.id, tipoVendedor: p.tipo_vendedor || null, isExclusivo: false, contratoAssinado: !!p.contrato_assinado })}
              />
            </Panel>
          )}

          {convenios.length > 0 && (
            <Panel title={`Convênios em Execução e Prestação (${convenios.length})`} padded={false}>
              <ConveniosExecucao
                convenios={convenios}
                status={execStatus}
                onStatus={projetos.length > 0 ? (v) => void updateExecStatus(v) : null}
                canChange={execEditable}
                options={hasTeamCommercialView(role) || role === 'admin' ? CRM_STATUS_SELECT_OPTIONS : CRM_STATUS_SELECT_OPTIONS.filter((o) => !isClosedCrmStatus(o))}
              />
            </Panel>
          )}

          {first && (
            <Panel title="Contato" padded={false}>
              <ContatoLead
                telefone={exibido.telefone}
                email={exibido.email}
                endereco={first.endereco ?? null}
                // Contato principal grava pela rota de contatos (canModifyData); o do lead, pela de leads.
                canEdit={(campo) => (exibido[campo].contatoId != null ? canModifyData(role) : canModify)}
                onSave={saveContato}
              />
            </Panel>
          )}

          <LeadContacts cnpj={apiCnpj} canModify={canModifyData(role)} refreshKey={contactsBump} onChange={() => setContatosReload((n) => n + 1)} />
        </aside>
      </div>

      {first && (
        <SaleModal
          open={!!saleModal}
          leadNome={nome}
          currentTipoVendedor={saleModal?.tipoVendedor}
          userRole={userRole}
          isExclusivo={saleModal?.isExclusivo}
          leadContratoAssinado={saleModal?.contratoAssinado}
          onCancel={() => setSaleModal(null)}
          onConfirm={(data) => { if (saleModal) void submitFechado(saleModal.projetoId, data) }}
        />
      )}
    </div>
  )
}
