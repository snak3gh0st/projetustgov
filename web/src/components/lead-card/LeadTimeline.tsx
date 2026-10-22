'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import SectionTabs from '@/components/SectionTabs'
import Button from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { LeadEventLine } from '@/components/LeadEvents'
import { Tag, TAG_TONE, selectClass } from '@/components/leads/list-ui'
import { buildTimeline, type TimelineEvent, type TimelineFilter, type TimelineMensagem, type TimelineNote } from '@/lib/lead-timeline'
import { MensagemBolha } from '@/components/whatsapp/MensagemBolha'

type NoteTipo = TimelineNote['tipo']

const NOTE_TIPOS: { value: NoteTipo; label: string; tone: keyof typeof TAG_TONE }[] = [
  { value: 'ligacao', label: 'Ligação', tone: 'sky' },
  { value: 'whatsapp', label: 'WhatsApp', tone: 'emerald' },
  { value: 'email', label: 'Email', tone: 'indigo' },
  { value: 'reuniao', label: 'Reunião', tone: 'violet' },
  { value: 'outro', label: 'Outro', tone: 'neutral' },
  { value: 'impedimento_tecnico', label: 'Impedimento técnico', tone: 'rose' },
  { value: 'cancelamento', label: 'Cancelamento', tone: 'neutral' },
]
const TIPO_BY_VALUE = new Map(NOTE_TIPOS.map((t) => [t.value, t]))

const textareaClass =
  'w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const absolute = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

interface LeadTimelineProps {
  /** CNPJ como gravado em vendedor_projetos (as rotas de notas comparam o valor exato). */
  cnpj: string
  /** Mesma regra das rotas de notas (canModifyData). */
  canWriteNotes: boolean
  /** Muda quando status ou dono mudam no card: recarrega as movimentações. */
  refreshKey?: unknown
  /** CNPJ só com dígitos, para buscar as conversas de WhatsApp do lead. */
  cnpjDigits?: string
  /** Telefones válidos do lead (canônicos), para escolher para qual enviar. */
  telefones?: { valor: string; label: string }[]
  /** Pode enviar WhatsApp (canUseWhatsapp + canEditLeads). */
  canSendWhatsapp?: boolean
}

function NoteItem({
  note,
  canWrite,
  onSave,
  onDelete,
}: {
  note: TimelineNote
  canWrite: boolean
  onSave: (id: string, tipo: NoteTipo, observacao: string) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [tipo, setTipo] = useState<NoteTipo>(note.tipo)
  const [texto, setTexto] = useState(note.observacao ?? '')
  const [busy, setBusy] = useState(false)
  const tipoInfo = TIPO_BY_VALUE.get(note.tipo) ?? TIPO_BY_VALUE.get('outro')!
  const autor = note.vendedor_nome || 'Sem autor'

  async function save() {
    setBusy(true)
    const ok = await onSave(note.id, tipo, texto)
    setBusy(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-ink">{autor}</span>
        <Tag tone={tipoInfo.tone}>{tipoInfo.label}</Tag>
        <time dateTime={note.created_at} title={absolute(note.created_at)} className="ml-auto whitespace-nowrap text-xs tabular-nums text-ink-3">
          {formatWhen(note.created_at)}
        </time>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <select aria-label="Tipo de contato" value={tipo} onChange={(e) => setTipo(e.target.value as NoteTipo)} className={selectClass}>
            {NOTE_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea aria-label="Texto da nota" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className={textareaClass} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTipo(note.tipo); setTexto(note.observacao ?? '') }}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar nota'}</Button>
          </div>
        </div>
      ) : (
        note.observacao && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-2 [overflow-wrap:anywhere]">{note.observacao}</p>
      )}

      {canWrite && !editing && (
        <div className="mt-2 flex items-center justify-end gap-1 text-xs">
          {confirming ? (
            <>
              <span className="mr-1 text-ink-2" id={`confirmar-${note.id}`}>Excluir esta nota?</span>
              <Button size="sm" variant="ghost" autoFocus aria-describedby={`confirmar-${note.id}`} onClick={() => setConfirming(false)}>Manter</Button>
              <Button size="sm" variant="danger" onClick={() => { setConfirming(false); void onDelete(note.id) }}>Excluir nota</Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Editar nota de ${autor}`}
                onClick={() => { setTipo(note.tipo); setTexto(note.observacao ?? ''); setEditing(true) }}
              >
                Editar
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Excluir nota de ${autor}`} onClick={() => setConfirming(true)}>Excluir</Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function LeadTimeline({ cnpj, canWriteNotes, refreshKey, cnpjDigits, telefones = [], canSendWhatsapp = false }: LeadTimelineProps) {
  const toast = useToast()
  const [notes, setNotes] = useState<TimelineNote[] | null>(null)
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [filter, setFilter] = useState<TimelineFilter>('tudo')
  const [tipo, setTipo] = useState<NoteTipo>('ligacao')
  // WhatsApp: null = ainda não sabemos se o canal está ligado para este usuário.
  const [whatsappOn, setWhatsappOn] = useState<boolean | null>(null)
  const [mensagens, setMensagens] = useState<TimelineMensagem[]>([])
  const [modo, setModo] = useState<'nota' | 'whatsapp'>('nota')
  const [telefone, setTelefone] = useState<string>('')
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const notesUrl = `/api/leads/${encodeURIComponent(cnpj)}/notes`

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(notesUrl, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setNotes(Array.isArray(data) ? data : [])
    } catch {
      // Primeira carga sem resposta: lista vazia. Depois disso, mantém o que já está na tela.
      setNotes((prev) => prev ?? [])
    }
  }, [notesUrl])

  useEffect(() => { void loadNotes() }, [loadNotes])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leads/${encodeURIComponent(cnpj)}/historico`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { if (!cancelled) setEvents(d.events ?? []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [cnpj, refreshKey])

  const loadWhatsapp = useCallback(async () => {
    if (!cnpjDigits) { setWhatsappOn(false); return }
    try {
      const r = await fetch(`/api/whatsapp/conversas?filtro=todas&cnpj=${cnpjDigits}`, { cache: 'no-store' })
      if (!r.ok) { setWhatsappOn(false); return }
      const { conversas } = await r.json() as { conversas: { id: number; telefone: string }[] }
      const listas = await Promise.all(conversas.map(async (c) => {
        const d = await fetch(`/api/whatsapp/conversas/${c.id}`, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : { mensagens: [] }))
        return (d.mensagens as Omit<TimelineMensagem, 'telefone'>[]).map((m) => ({ ...m, telefone: c.telefone }))
      }))
      setMensagens(listas.flat())
      setWhatsappOn(true)
      // Padrão de envio: o número que já tem conversa, senão o primeiro do lead.
      setTelefone((atual) => atual || conversas[0]?.telefone || '')
    } catch {
      setWhatsappOn((prev) => prev ?? false)
    }
  }, [cnpjDigits])

  useEffect(() => { void loadWhatsapp() }, [loadWhatsapp, refreshKey])
  // Mensagens novas chegam pelo webhook: confere a cada 10 s enquanto o card está aberto.
  useEffect(() => {
    if (!whatsappOn) return
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadWhatsapp() }, 10_000)
    return () => window.clearInterval(t)
  }, [whatsappOn, loadWhatsapp])
  useEffect(() => { if (!telefone && telefones[0]) setTelefone(telefones[0].valor) }, [telefone, telefones])

  const ready = notes !== null && events !== null
  const items = useMemo(() => (ready ? buildTimeline(notes, events, filter, mensagens) : []), [ready, notes, events, filter, mensagens])
  const counts = useMemo(() => ({ notas: notes?.length ?? 0, movimentacoes: events?.length ?? 0, whatsapp: mensagens.length }), [notes, events, mensagens])
  const podeWhatsapp = Boolean(whatsappOn && canSendWhatsapp && (telefones.length > 0 || telefone))
  const numerosDistintos = new Set(mensagens.map((m) => m.telefone)).size > 1
  // Sem permissão de nota (ex.: admin), a caixa só envia WhatsApp.
  const modoAtual: 'nota' | 'whatsapp' = !canWriteNotes ? 'whatsapp' : podeWhatsapp ? modo : 'nota'

  // O mais recente fica embaixo, junto da caixa de nota: rola até ele ao abrir, ao trocar o filtro
  // e quando entra item novo (excluir não mexe na posição).
  const lastCount = useRef<{ filter: TimelineFilter; count: number } | null>(null)
  useLayoutEffect(() => {
    if (!ready) return
    const el = scrollRef.current
    const prev = lastCount.current
    if (el && (!prev || prev.filter !== filter || items.length > prev.count)) el.scrollTop = el.scrollHeight
    lastCount.current = { filter, count: items.length }
  }, [ready, items.length, filter])

  async function sendWhatsapp() {
    const t = texto.trim()
    if (!t || sending || !telefone || !cnpjDigits) return
    setSending(true)
    try {
      const r = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone, cnpj: cnpjDigits, texto: t }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) toast.error(d.error ?? 'Não foi possível enviar pelo WhatsApp.')
      if (r.ok || r.status === 502) setTexto('')
      if (filter === 'notas' || filter === 'movimentacoes') setFilter('tudo')
      await loadWhatsapp()
    } finally {
      setSending(false)
    }
  }

  async function addNote() {
    const observacao = texto.trim()
    if (!observacao || sending) return
    setSending(true)
    try {
      const res = await fetch(notesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, observacao }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setTexto('')
      if (filter === 'movimentacoes') setFilter('tudo')
      await loadNotes()
    } catch {
      toast.error('Não foi possível adicionar a nota. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  async function saveNote(id: string, novoTipo: NoteTipo, observacao: string): Promise<boolean> {
    const res = await fetch(notesUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_id: id, tipo: novoTipo, observacao }),
    }).catch(() => null)
    if (!res?.ok) {
      toast.error('Não foi possível salvar a nota. Tente de novo.')
      return false
    }
    await loadNotes()
    return true
  }

  async function deleteNote(id: string) {
    const res = await fetch(notesUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_id: id }),
    }).catch(() => null)
    if (!res?.ok) {
      toast.error('Não foi possível excluir a nota. Tente de novo.')
      return
    }
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev)
  }

  return (
    <section aria-labelledby="linha-do-tempo" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="linha-do-tempo" className="text-sm font-semibold text-ink">Linha do tempo</h2>
        <SectionTabs
          controls="linha-do-tempo-itens"
          ariaLabel="Filtrar linha do tempo"
          value={filter}
          onChange={(v) => setFilter(v as TimelineFilter)}
          tabs={[
            { id: 'tudo', label: 'Tudo', count: ready ? counts.notas + counts.movimentacoes + counts.whatsapp : undefined },
            ...(whatsappOn ? [{ id: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp }] : []),
            { id: 'notas', label: 'Notas', count: ready ? counts.notas : undefined },
            { id: 'movimentacoes', label: 'Movimentações', count: ready ? counts.movimentacoes : undefined },
          ]}
        />
      </header>

      <div
        ref={scrollRef}
        id="linha-do-tempo-itens"
        role="tabpanel"
        aria-label="Itens da linha do tempo"
        tabIndex={0}
        className="max-h-[65dvh] min-h-[12rem] flex-1 overflow-y-auto px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 lg:max-h-[calc(100dvh-20rem)]"
      >
        {!ready ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">
            {filter === 'movimentacoes'
              ? 'Nenhuma movimentação registrada.'
              : filter === 'whatsapp' ? 'Nenhuma mensagem de WhatsApp com este lead ainda.'
              : canWriteNotes ? 'Nenhuma nota ainda. Registre o primeiro contato abaixo.' : 'Nenhuma nota registrada.'}
          </p>
        ) : (
          <ol className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <m.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {item.kind === 'nota' ? (
                    <NoteItem note={item.note} canWrite={canWriteNotes} onSave={saveNote} onDelete={deleteNote} />
                  ) : item.kind === 'whatsapp' ? (
                    <div>
                      {numerosDistintos && <p className={`mb-0.5 text-[11px] text-ink-3 ${item.mensagem.direcao === 'enviada' ? 'text-right' : ''}`}>{item.mensagem.telefone}</p>}
                      <MensagemBolha m={item.mensagem} compact onRetry={canSendWhatsapp ? (t) => { setModo('whatsapp'); setTexto(t) } : undefined} />
                    </div>
                  ) : (
                    <div className="flex gap-2.5 px-1">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                      <div className="min-w-0 flex-1"><LeadEventLine event={item.event} /></div>
                    </div>
                  )}
                </m.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>

      {(canWriteNotes || podeWhatsapp) && (
        <form
          className="space-y-2 border-t border-line bg-raised/40 px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); void (modoAtual === 'whatsapp' ? sendWhatsapp() : addNote()) }}
        >
          {podeWhatsapp && canWriteNotes && (
            <SectionTabs
              ariaLabel="Tipo de registro"
              value={modoAtual}
              onChange={(v) => setModo(v as 'nota' | 'whatsapp')}
              tabs={[{ id: 'nota', label: 'Nota' }, { id: 'whatsapp', label: 'WhatsApp' }]}
            />
          )}
          <textarea
            aria-label={modoAtual === 'whatsapp' ? 'Mensagem de WhatsApp' : 'Nova nota'}
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void (modoAtual === 'whatsapp' ? sendWhatsapp() : addNote()) } }}
            placeholder={modoAtual === 'whatsapp' ? 'Mensagem para o lead pelo WhatsApp das consultorias' : 'Como foi o contato? O que ficou combinado?'}
            className={textareaClass}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {modoAtual === 'whatsapp' ? (
              <select aria-label="Telefone do lead" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={selectClass}>
                {telefones.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                {telefone && !telefones.some((t) => t.valor === telefone) && <option value={telefone}>{telefone}</option>}
              </select>
            ) : (
              <select aria-label="Tipo de contato" value={tipo} onChange={(e) => setTipo(e.target.value as NoteTipo)} className={selectClass}>
                {NOTE_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            )}
            <Button type="submit" size="sm" variant="primary" disabled={!texto.trim() || sending}>
              {modoAtual === 'whatsapp' ? (sending ? 'Enviando...' : 'Enviar WhatsApp') : sending ? 'Adicionando...' : 'Adicionar nota'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
