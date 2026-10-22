'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import SectionTabs from '@/components/SectionTabs'
import Button, { buttonClass } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Tag, inputClass, selectClass } from '@/components/leads/list-ui'
import { formatCNPJ } from '@/lib/format'
import { MensagemBolha, type MensagemView } from '@/components/whatsapp/MensagemBolha'

interface Conversa {
  id: number
  telefone: string
  nome_contato: string | null
  lead_cnpj: string | null
  lead_nome: string | null
  atendente_id: string | null
  atendente_nome: string | null
  donos_nomes: string | null
  arquivada_em: string | null
  ultima_mensagem_em: string | null
  ultima_previa: string | null
  nao_lidas: number
  aguardando: boolean
}

type Filtro = 'minhas' | 'em-aberto' | 'todas' | 'arquivadas'
const POLL_MS = 10_000

const titulo = (c: Pick<Conversa, 'lead_nome' | 'nome_contato' | 'telefone'>) => c.lead_nome || c.nome_contato || formatTelefone(c.telefone)

function formatTelefone(t: string): string {
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t
}

function quando(iso: string | null): string {
  if (!iso) return ''
  const tz = { timeZone: 'America/Sao_Paulo' } as const
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', tz)
  const d = new Date(iso)
  return dia(d) === dia(new Date())
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...tz })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...tz })
}

function ConversaItem({ c, ativa, onOpen }: { c: Conversa; ativa: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={ativa ? 'true' : undefined}
        className={`block w-full px-4 py-3 text-left transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${ativa ? 'bg-accent-soft/50' : 'hover:bg-raised'}`}
      >
        <div className="flex items-baseline gap-2">
          <p className={`min-w-0 flex-1 truncate text-sm ${c.nao_lidas > 0 ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{titulo(c)}</p>
          <span className="shrink-0 text-xs tabular-nums text-ink-3">{quando(c.ultima_mensagem_em)}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-2">{c.ultima_previa ?? 'Sem mensagens'}</p>
          {c.aguardando && <Tag tone="amber">Esperando</Tag>}
          {c.nao_lidas > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white" aria-label={`${c.nao_lidas} não lidas`}>
              {c.nao_lidas}
            </span>
          )}
        </div>
        {!c.lead_cnpj && !c.atendente_id && <p className="mt-1 text-xs text-ink-3">Sem lead ligado</p>}
      </button>
    </li>
  )
}

function Composer({ onSend, disabled }: { onSend: (texto: string) => Promise<boolean>; disabled?: boolean }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    const ok = await onSend(t)
    setEnviando(false)
    if (ok) setTexto('')
  }
  return (
    <form className="flex items-end gap-2 border-t border-line bg-surface px-3 py-3" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
      <textarea
        aria-label="Mensagem de WhatsApp"
        rows={1}
        value={texto}
        disabled={disabled}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
        placeholder={disabled ? 'Você só pode consultar esta conversa.' : 'Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha.'}
        className={`${inputClass} max-h-40 min-h-10 flex-1 resize-y`}
      />
      <Button type="submit" variant="primary" disabled={disabled || enviando || !texto.trim()}>{enviando ? 'Enviando...' : 'Enviar'}</Button>
    </form>
  )
}

function PainelLead({ c, gestao, atendentes, onChange }: {
  c: Conversa
  gestao: boolean
  atendentes: { id: string; nome: string }[]
  onChange: (patch: { atendente_id?: string | null; lead_cnpj?: string | null; arquivar?: boolean }) => Promise<void>
}) {
  const [cnpj, setCnpj] = useState('')
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <p className="text-xs text-ink-3">Contato</p>
        <p className="font-medium text-ink">{c.nome_contato || 'Sem nome no WhatsApp'}</p>
        <p className="tabular-nums text-ink-2">{formatTelefone(c.telefone)}</p>
      </div>
      {c.lead_cnpj ? (
        <div>
          <p className="text-xs text-ink-3">Lead</p>
          <p className="font-medium text-ink">{c.lead_nome || 'Sem nome'}</p>
          <p className="font-mono text-xs text-ink-3">{formatCNPJ(c.lead_cnpj)}</p>
          <p className="mt-1 text-xs text-ink-2">Responsável: {c.donos_nomes || 'Sem dono'}</p>
          <Link href={`/lead/${c.lead_cnpj}`} className={buttonClass('secondary', 'sm', 'mt-2 w-full')}>Abrir card do lead</Link>
        </div>
      ) : (
        <p className="text-ink-3">Este número não está em nenhum lead.</p>
      )}
      {c.atendente_nome && <p className="text-xs text-ink-2">Direcionada para {c.atendente_nome}</p>}

      {gestao && (
        <div className="space-y-3 border-t border-line pt-4">
          <label className="block space-y-1">
            <span className="text-xs text-ink-3">Direcionar para</span>
            <select
              className={`${selectClass} w-full`}
              value={c.atendente_id ?? ''}
              onChange={(e) => void onChange({ atendente_id: e.target.value || null })}
            >
              <option value="">{c.lead_cnpj ? 'Dono do lead' : 'Ninguém (em aberto)'}</option>
              {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); if (cnpj.replace(/\D/g, '').length === 14) void onChange({ lead_cnpj: cnpj }) }}>
            <span className="text-xs text-ink-3">{c.lead_cnpj ? 'Trocar o lead (CNPJ)' : 'Ligar a um lead (CNPJ)'}</span>
            <div className="flex gap-2">
              <input aria-label="CNPJ do lead" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className={`${inputClass} min-w-0 flex-1`} />
              <Button type="submit" size="sm" disabled={cnpj.replace(/\D/g, '').length !== 14}>Ligar</Button>
            </div>
          </form>
          <Button size="sm" variant="ghost" onClick={() => void onChange({ arquivar: !c.arquivada_em })}>
            {c.arquivada_em ? 'Tirar do arquivo' : 'Arquivar conversa'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function ConversasClient({ gestao }: { gestao: boolean }) {
  const toast = useToast()
  const params = useSearchParams()
  const [filtro, setFiltro] = useState<Filtro>((params.get('filtro') as Filtro) || (gestao ? 'todas' : 'minhas'))
  const [busca, setBusca] = useState('')
  const [conversas, setConversas] = useState<Conversa[] | null>(null)
  const [ativaId, setAtivaId] = useState<number | null>(params.get('c') ? Number(params.get('c')) : null)
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<MensagemView[] | null>(null)
  const [atendentes, setAtendentes] = useState<{ id: string; nome: string }[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const novoTelefone = params.get('telefone')
  const novoCnpj = params.get('cnpj')

  const carregarLista = useCallback(async () => {
    const q = new URLSearchParams({ filtro })
    if (busca.trim()) q.set('busca', busca.trim())
    const r = await fetch(`/api/whatsapp/conversas?${q}`, { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setConversas((await r.json()).conversas)
    else setConversas((prev) => prev ?? [])
  }, [filtro, busca])

  const carregarConversa = useCallback(async (id: number) => {
    const r = await fetch(`/api/whatsapp/conversas/${id}`, { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) return
    const d = await r.json()
    setAtiva(d.conversa)
    setMensagens(d.mensagens)
  }, [])

  useEffect(() => { void carregarLista() }, [carregarLista])

  // Abrir pelo card do lead: usa a conversa do telefone, se já existir.
  useEffect(() => {
    if (!novoTelefone || ativaId) return
    fetch(`/api/whatsapp/conversas?filtro=todas&busca=${encodeURIComponent(novoTelefone.replace(/\D/g, '').slice(-8))}`)
      .then((r) => (r.ok ? r.json() : { conversas: [] }))
      .then((d) => { const c = (d.conversas as Conversa[]).find((x) => x.telefone.endsWith(novoTelefone.replace(/\D/g, '').slice(-8))); if (c) setAtivaId(c.id) })
      .catch(() => {})
  }, [novoTelefone, ativaId])

  useEffect(() => {
    if (!ativaId) return
    setMensagens(null)
    void carregarConversa(ativaId)
    void fetch(`/api/whatsapp/conversas/${ativaId}/lida`, { method: 'POST' }).then(() => carregarLista()).catch(() => {})
  }, [ativaId, carregarConversa, carregarLista])

  // Atualiza lista e conversa aberta a cada 10 s e ao voltar para a aba.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void carregarLista()
      if (ativaId) void carregarConversa(ativaId)
    }
    const t = window.setInterval(tick, POLL_MS)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(t); window.removeEventListener('focus', tick) }
  }, [ativaId, carregarLista, carregarConversa])

  useEffect(() => {
    if (!gestao) return
    fetch('/api/vendedores').then((r) => (r.ok ? r.json() : [])).then((d) => {
      if (Array.isArray(d)) setAtendentes(d.map((v: { id: string; nome: string }) => ({ id: v.id, nome: v.nome })))
    }).catch(() => {})
  }, [gestao])

  const ultimaQtd = useRef(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && mensagens && mensagens.length !== ultimaQtd.current) el.scrollTop = el.scrollHeight
    ultimaQtd.current = mensagens?.length ?? 0
  }, [mensagens])

  async function enviar(texto: string): Promise<boolean> {
    const body = ativa ? { conversa_id: ativa.id, texto } : { telefone: novoTelefone, cnpj: novoCnpj, texto }
    const r = await fetch('/api/whatsapp/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (d?.conversa_id && !ativaId) setAtivaId(d.conversa_id)
    else if (ativaId) await carregarConversa(ativaId)
    void carregarLista()
    if (!r?.ok) { toast.error(d?.error ?? 'Não foi possível enviar pelo WhatsApp.'); return r?.status === 502 }
    return true
  }

  async function alterar(patch: { atendente_id?: string | null; lead_cnpj?: string | null; arquivar?: boolean }) {
    if (!ativa) return
    const r = await fetch(`/api/whatsapp/conversas/${ativa.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null)
    if (!r?.ok) { toast.error((await r?.json().catch(() => null))?.error ?? 'Não foi possível salvar.'); return }
    toast.success(patch.arquivar ? 'Conversa arquivada.' : 'Conversa atualizada.')
    await carregarConversa(ativa.id)
    void carregarLista()
  }

  const tabs = useMemo(() => (gestao
    ? [{ id: 'todas', label: 'Todas' }, { id: 'em-aberto', label: 'Em aberto' }, { id: 'minhas', label: 'Minhas' }, { id: 'arquivadas', label: 'Arquivadas' }]
    : [{ id: 'minhas', label: 'Minhas' }, { id: 'todas', label: 'Todas' }]), [gestao])

  const mostrarConversa = ativaId !== null || Boolean(novoTelefone)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-ink">Conversas</h1>
        {gestao && <Link href="/conversas/conexao" className={buttonClass('secondary', 'sm')}>Conexão do WhatsApp</Link>}
      </div>

      <div className="grid min-h-[70dvh] grid-cols-1 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-[320px_minmax(0,1fr)_280px]">
        {/* Lista */}
        <aside className={`min-w-0 flex-col border-line lg:flex lg:border-r ${mostrarConversa ? 'hidden' : 'flex'}`} aria-label="Lista de conversas">
          <div className="space-y-2 border-b border-line p-3">
            <SectionTabs ariaLabel="Filtrar conversas" value={filtro} onChange={(v) => setFiltro(v as Filtro)} tabs={tabs} />
            <input aria-label="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className={`${inputClass} w-full`} />
          </div>
          <div className="max-h-[70dvh] flex-1 overflow-y-auto">
            {conversas === null ? (
              <div className="space-y-3 p-4" aria-hidden><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : conversas.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-3">{filtro === 'em-aberto' ? 'Nenhuma conversa esperando direcionamento.' : 'Nenhuma conversa aqui ainda.'}</p>
            ) : (
              <ul className="divide-y divide-line">
                {conversas.map((c) => <ConversaItem key={c.id} c={c} ativa={c.id === ativaId} onOpen={() => setAtivaId(c.id)} />)}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversa */}
        <section className={`min-w-0 flex-col lg:flex ${mostrarConversa ? 'flex' : 'hidden'}`} aria-label="Conversa">
          {mostrarConversa ? (
            <>
              <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <button type="button" onClick={() => { setAtivaId(null); setAtiva(null) }} className="text-sm text-ink-3 hover:text-ink lg:hidden">Voltar</button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{ativa ? titulo(ativa) : novoTelefone ? formatTelefone(novoTelefone.replace(/\D/g, '')) : ''}</p>
                  {ativa && <p className="text-xs text-ink-3">{formatTelefone(ativa.telefone)}</p>}
                </div>
              </header>
              <div ref={scrollRef} className="max-h-[60dvh] min-h-[40dvh] flex-1 space-y-2 overflow-y-auto bg-raised/40 px-4 py-4">
                {ativaId && mensagens === null ? (
                  <div className="space-y-2" aria-hidden><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /></div>
                ) : (mensagens ?? []).length === 0 ? (
                  <p className="py-10 text-center text-sm text-ink-3">Nenhuma mensagem ainda. Escreva abaixo para começar.</p>
                ) : (
                  mensagens!.map((m) => <MensagemBolha key={m.id} m={m} onRetry={(t) => void enviar(t)} />)
                )}
              </div>
              <Composer onSend={enviar} />
            </>
          ) : (
            <p className="m-auto p-10 text-center text-sm text-ink-3">Escolha uma conversa na lista.</p>
          )}
        </section>

        {/* Lead e controles da gestão */}
        <aside className="hidden min-w-0 border-l border-line lg:block" aria-label="Lead da conversa">
          {ativa ? <PainelLead c={ativa} gestao={gestao} atendentes={atendentes} onChange={alterar} /> : null}
        </aside>
      </div>

      {ativa && (
        <div className="rounded-xl border border-line bg-surface lg:hidden">
          <PainelLead c={ativa} gestao={gestao} atendentes={atendentes} onChange={alterar} />
        </div>
      )}
    </div>
  )
}
