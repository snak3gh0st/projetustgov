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
import { canEditLeads, canModifyData } from '@/lib/roles'
import { isClosedCrmStatus, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'
import { execucaoStatusDoCnpj, responsaveis } from '@/lib/lead-timeline'

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
  const apiCnpj = first?.cnpj ?? cnpj
  const execStatus = useMemo(() => execucaoStatusDoCnpj(projetos.map((p) => p.status_contato_execucao)), [projetos])
  const timelineKey = useMemo(
    () => projetos.map((p) => `${p.status_contato}|${p.vendedor_id}|${p.status_contato_execucao ?? ''}`).join(','),
    [projetos]
  )

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

  const mergeCommission = (data: Record<string, unknown>) => ({
    ...(data.venda_etapa != null ? { venda_etapa: data.venda_etapa as VendedorProjeto['venda_etapa'] } : {}),
    ...(data.comissao_percentual != null ? { comissao_percentual: Number(data.comissao_percentual) } : {}),
    ...(data.comissao_valor != null ? { comissao_valor: Number(data.comissao_valor) } : {}),
    ...(data.comissao_bonus != null ? { comissao_bonus: Number(data.comissao_bonus) } : {}),
    ...(data.closer_id != null ? { closer_id: data.closer_id as string } : {}),
    ...(data.closer_comissao_percentual != null ? { closer_comissao_percentual: Number(data.closer_comissao_percentual) } : {}),
    ...(data.closer_comissao_valor != null ? { closer_comissao_valor: Number(data.closer_comissao_valor) } : {}),
  })

  async function updateProjeto(id: number, field: 'status_contato' | 'observacoes', value: string) {
    // Venda concluída passa pelo SaleModal (valor, serviço, contrato).
    if (field === 'status_contato' && isClosedCrmStatus(value)) {
      const projeto = projetos.find((p) => p.id === id)
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
    setProjetos((prev) => prev.map((p) => (p.id === id
      ? {
          ...p,
          [field]: field === 'status_contato' ? normalizeCrmStatus((data.status_contato as string) ?? value) : value,
          ...mergeCommission(data),
          // Sair de Vendas Concluídas apaga a comissão no servidor.
          ...(field === 'status_contato' && !isClosedCrmStatus(value)
            ? { comissao_valor: null, comissao_percentual: null, comissao_bonus: null, closer_comissao_valor: null, closer_comissao_percentual: null, contrato_assinado: false }
            : {}),
        }
      : p)))
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
          status_contato: normalizeCrmStatus((data.status_contato as string) ?? finalStatus),
          valor_venda: sale.valor_venda,
          tipo_servico: sale.tipo_servico as VendedorProjeto['tipo_servico'],
          ...mergeCommission(data),
        }
      : p)))
    setSaleModal(null)
    toast.success('Venda registrada.')
  }

  async function setContratoAssinado(projetoId: number, value: boolean) {
    setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, contrato_assinado: value } : p)))
    const data = await patchLead({ id: projetoId, contrato_assinado: value })
    if (!data) setProjetos((prev) => prev.map((p) => (p.id === projetoId ? { ...p, contrato_assinado: !value } : p)))
  }

  async function saveContato(campo: 'telefone' | 'email', valor: string): Promise<boolean> {
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
  const telefone = first?.telefone ?? null
  const email = first?.email ?? null
  const whatsappUrl = whatsappMeUrlFromTelefone(telefone)
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {first?.is_max_priority && <Tag tone="rose" title="Este CNPJ nunca executou um convênio: alta chance de conversão">Máxima prioridade</Tag>}
              {first?.is_existing_client && <Tag tone="violet">Cliente existente</Tag>}
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
        <LeadTimeline cnpj={apiCnpj} canWriteNotes={canModifyData(role)} refreshKey={timelineKey} />

        <aside className="min-w-0 space-y-4" aria-label="Detalhes do lead">
          <Panel title="Reunião" padded={false}>
            <div className="space-y-3 px-4 py-3">
              <p className="text-sm text-ink-2">
                {temReuniao
                  ? 'Reunião marcada. O horário aparece aqui quando o Google Meet estiver ligado ao PROJETE.'
                  : 'Nenhuma reunião marcada.'}
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
              />
            </Panel>
          )}

          {first && (
            <Panel title="Contato" padded={false}>
              <ContatoLead telefone={telefone} email={email} endereco={first.endereco ?? null} canModify={canModify} onSave={saveContato} />
            </Panel>
          )}

          <LeadContacts cnpj={apiCnpj} canModify={canModify} />
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
