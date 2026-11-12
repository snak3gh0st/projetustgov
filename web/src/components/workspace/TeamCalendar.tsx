'use client'

import { useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import Button, { buttonClass } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { calendarDays, eventsOnDay, localDateKey, type CalendarEvent } from '@/lib/workspace/presentation'
import { MEETING_OUTCOMES, meetingStatus } from '@/lib/workspace/calendar-policy'
import { dateLabel, Field, fieldClass, GoogleLink, Notice, request, useResource, type Data } from './shared'
import WorkspaceConnection from './WorkspaceConnection'
import WorkspaceDialog from './WorkspaceDialog'
import WorkspaceIcon from './WorkspaceIcon'

const labels: Record<string, string> = { scheduled: 'Agendada', ...MEETING_OUTCOMES }
function Status({ event }: { event: Data }) {
  const status = meetingStatus(event)
  return <span className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${status === 'completed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : status === 'cancelled' || status === 'no_show' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-raised text-ink-2'}`}>{labels[status]}</span>
}

export default function TeamCalendar({ initialDate }: { initialDate: string }) {
  const [anchor, setAnchor] = useState(initialDate), [seller, setSeller] = useState(''), [status, setStatus] = useState('all')
  const [view, setView] = useState<'week' | 'day'>('week'), [selected, setSelected] = useState<Data | null>(null)
  const date = new Date(`${anchor}T12:00:00`), days = calendarDays(date, 'week')
  const from = days[0], to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7)
  const url = `/api/workspace/equipe?${new URLSearchParams({ start: from.toISOString(), end: to.toISOString(), seller })}`
  const resource = useResource(() => request(url), [url]), data = resource.data
  const items: (CalendarEvent & Data)[] = (data?.items || []).filter((event: Data) => status === 'all' || meetingStatus(event) === status)
  const visibleDays = view === 'day' ? days.filter(day => localDateKey(day) === anchor) : days
  function move(direction: number) { const next = new Date(date); next.setDate(next.getDate() + direction * (view === 'day' ? 1 : 7)); setAnchor(localDateKey(next)) }
  const unavailable = (data?.members || []).filter((member: Data) => (!seller || member.id === seller) &&
    (member.connection_status !== 'active' || data?.unavailable?.includes(member.id)))

  return <div className="mx-auto max-w-[1800px] space-y-5">
    <PageHeader title="Agenda Comercial da Equipe" description="Reuniões de clientes e projetos, com o resultado registrado pelo comercial."
      actions={<><Link href="/workspace/calendario" className={buttonClass('secondary', 'sm')}>Meu calendário</Link><Button size="sm" disabled={resource.busy} onClick={resource.reload} icon={<WorkspaceIcon name="refresh" className="h-4 w-4" />}>Atualizar</Button></>} />
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex min-h-10 items-center gap-1"><Button size="sm" aria-label="Período anterior" onClick={() => move(-1)}>←</Button><Button size="sm" onClick={() => setAnchor(initialDate)}>Hoje</Button><Button size="sm" aria-label="Próximo período" onClick={() => move(1)}>→</Button></div>
      <div className="w-40"><Field label="Data"><input type="date" required className={fieldClass} value={anchor} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setAnchor(e.target.value) }} /></Field></div>
      <div className="w-full sm:w-52"><Field label="Comercial"><select className={fieldClass} value={seller} onChange={e => setSeller(e.target.value)}><option value="">Todos os comerciais</option>{data?.members.map((member: Data) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field></div>
      <div className="w-full sm:w-52"><Field label="Situação"><select className={fieldClass} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      <div className="flex min-h-10 gap-1 rounded-lg border border-line p-1 sm:ml-auto">{(['week', 'day'] as const).map(value => <button key={value} className={`min-h-8 rounded-md px-3 text-sm ${view === value ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-2 hover:bg-raised'}`} aria-pressed={view === value} onClick={() => setView(value)}>{value === 'week' ? 'Semana' : 'Dia'}</button>)}</div>
    </div>
    {resource.error && <Notice error>{resource.error} <button className="underline" onClick={resource.reload}>Tentar novamente</button></Notice>}
    {data && !data.connected && <section className="rounded-xl border border-line bg-surface p-5"><WorkspaceConnection connection={data.connection} configured={data.configured} returnTo="/workspace/equipe" onChange={resource.reload} /></section>}
    {data?.connected && unavailable.length > 0 && <Notice>Nem todas as reuniões puderam ser consultadas para: {unavailable.map((m: Data) => m.name).join(', ')}. Cada comercial precisa conectar seu Google e compartilhar a agenda comercial com a sua conta, permitindo ler os eventos. Eventos particulares permanecem ocultos.</Notice>}
    {data?.limited && <Notice>A consulta está parcial. Filtre um comercial para reduzir a quantidade de reuniões e atualize a agenda.</Notice>}
    <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Reuniões da equipe">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2 className="!font-body text-sm font-semibold text-ink">{view === 'day' ? date.toLocaleDateString('pt-BR', { dateStyle: 'full' }) : `${from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`}</h2><p className="text-xs text-ink-2">{Intl.DateTimeFormat().resolvedOptions().timeZone} · Somente leitura</p></div>
      {resource.busy ? <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-36 w-full" /></div> : !data?.connected ? <p className="p-8 text-sm text-ink-2">Conecte sua conta para consultar as reuniões que os comerciais compartilharam com você.</p> : <>
        <div className={view === 'week' ? 'hidden overflow-x-auto md:block' : 'hidden'}><div className="grid min-h-[380px] min-w-[1050px] grid-cols-7 divide-x divide-line">{visibleDays.map(day => <div key={localDateKey(day)}><h3 className={`border-b border-line p-3 text-center text-sm font-medium ${localDateKey(day) === initialDate ? 'bg-accent-soft text-accent-ink' : 'text-ink-2'}`}>{day.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })}</h3><div className="space-y-2 p-2">{eventsOnDay(items, day).map(event => <Meeting key={event.meetingId} event={event} onSelect={setSelected} />)}</div></div>)}</div></div>
        <div className={view === 'week' ? 'divide-y divide-line md:hidden' : 'divide-y divide-line'}>{visibleDays.map(day => <div key={localDateKey(day)} className="p-4"><h3 className="mb-3 text-sm font-semibold text-ink">{day.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}</h3><div className="space-y-2">{eventsOnDay(items, day).map(event => <Meeting key={event.meetingId} event={event} onSelect={setSelected} />)}{!eventsOnDay(items, day).length && <p className="text-xs text-ink-2">Nenhuma reunião visível neste dia.</p>}</div></div>)}</div>
        {!items.length && <p className="border-t border-line p-5 text-sm text-ink-2">Nenhuma reunião visível para os filtros escolhidos. Esta visão reúne as reuniões vinculadas pela Projete e autorizadas pela sua conta no Google.</p>}
      </>}
    </section>
    <p className="max-w-3xl text-xs leading-relaxed text-ink-2">Reuniões externas ainda precisam ser registradas na Projete. O comercial registra o resultado na própria reunião; passar do horário deixa a reunião sem resultado, até haver confirmação. Para preservar os compromissos pessoais, compartilhe uma agenda exclusiva do comercial.</p>
    <WorkspaceDialog open={Boolean(selected)} title={selected?.title || 'Reunião comercial'} onClose={() => setSelected(null)}>{selected && <div className="space-y-4"><dl className="space-y-3 text-sm"><div><dt className="text-ink-2">Comercial</dt><dd className="font-medium text-ink">{selected.sellerName}</dd></div><div><dt className="text-ink-2">Cliente e projeto</dt><dd className="text-ink">{selected.clientName} · {selected.projectKind === 'comercial' ? 'Comercial' : selected.projectKind === 'convenio' ? 'Convênio' : 'Cliente'} {selected.projectKey}</dd></div><div><dt className="text-ink-2">Horário</dt><dd className="text-ink">{dateLabel(selected.start)} a {dateLabel(selected.end)}</dd></div></dl><Status event={selected} />{selected.outcome?.note && <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{selected.outcome.note}</p>}<div className="flex flex-wrap gap-2"><Link className={buttonClass('secondary', 'sm')} href={`/lead/${selected.cnpj}`}>Ficha do cliente</Link><GoogleLink href={selected.meetUrl}>Entrar no Meet</GoogleLink><GoogleLink href={selected.url}>Ver no Google Calendar</GoogleLink></div></div>}</WorkspaceDialog>
  </div>
}

function Meeting({ event, onSelect }: { event: Data; onSelect: (event: Data) => void }) {
  return <button className="w-full space-y-2 rounded-lg border border-line p-3 text-left transition-colors hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onSelect(event)}>
    <p className="text-xs font-medium tabular-nums text-ink-2">{new Date(event.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {event.sellerName}</p><p className="break-words text-sm font-semibold text-ink">{event.clientName}</p><p className="line-clamp-2 text-xs text-ink-2">{event.title}</p><Status event={event} />
  </button>
}
