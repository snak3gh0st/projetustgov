'use client'
import { useEffect,useState } from 'react'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import { dateLabel,Field,fieldClass,GoogleLink,Notice,RequestError,useResource,type Data,type WorkspaceApi } from './shared'

function nextDay(hour:number){const d=new Date();d.setDate(d.getDate()+1);d.setHours(hour,0,0,0);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00`}
export default function MeetingsPanel({api,client,canWrite}:{api:WorkspaceApi;client:Data;canWrite:boolean}){
  const [version,setVersion]=useState(0),[calendarId,setCalendar]=useState(''),[title,setTitle]=useState(`Reunião PROJETUS · ${client.name}`),[description,setDescription]=useState('')
  const [start,setStart]=useState(()=>nextDay(9)),[end,setEnd]=useState(()=>nextDay(10)),[attendees,setAttendees]=useState<string[]>(client.emails.slice(0,1)),[team,setTeam]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[availability,setAvailability]=useState<Data|null>(null)
  const calendars=useResource(()=>api.get('calendars'),[api]),events=useResource(()=>api.get('events'),[api,version])
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
  useEffect(()=>{if(calendars.data?.items.length&&!calendarId){const first=calendars.data.items.find((c:Data)=>c.primary)||calendars.data.items[0];setCalendar(first.id)}},[calendars.data,calendarId])
  useEffect(()=>setAvailability(null),[start,end,calendarId])
  async function act(create:boolean){
    setBusy(true);setError('');setMessage('')
    try{
      const dates={start:new Date(start).toISOString(),end:new Date(end).toISOString()}
      if(create){await api.mutate('create_meeting',{calendarId,title,description,...dates,attendees:[...attendees,...team.split(/[,;\s]+/).filter(Boolean)],timeZone:timezone});setVersion(v=>v+1);setMessage('Reunião criada e convites enviados pelo Google.');setDescription('')}
      else setAvailability(await api.get('availability',{calendarId,...dates}))
    }catch(e){setError((e as Error).message);if(create)setUncertain(e instanceof RequestError&&e.uncertain)}finally{setBusy(false)}
  }
  const slot=availability?.calendars?.[calendarId]
  return <div className="grid items-start gap-4 xl:grid-cols-2">
    <Panel title="Agendar com Google Meet" description={`Horários no seu fuso: ${timezone}. O convite identifica o cliente e o projeto.`}>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void act(true)}}>
        {calendars.error&&<Notice error>{calendars.error}</Notice>}
        <Field label="Calendário"><select required className={fieldClass} value={calendarId} onChange={e=>setCalendar(e.target.value)}><option value="">Selecione um calendário</option>{calendars.data?.items.map((c:Data)=><option key={c.id} value={c.id}>{c.summary}{c.primary?' · principal':''}</option>)}</select></Field>
        <Field label="Título da reunião"><input required maxLength={200} className={fieldClass} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Início"><input required type="datetime-local" className={fieldClass} value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Fim"><input required type="datetime-local" className={fieldClass} value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
        <Button size="sm" loading={busy} disabled={!calendarId||!start||!end} onClick={()=>void act(false)}>Consultar disponibilidade</Button>
        {slot&&<Notice>{slot.errors?.length?'O Google não confirmou a disponibilidade deste calendário.':slot.busy?.length?`${slot.busy.length} compromisso(s) neste intervalo: ${slot.busy.map((s:Data)=>`${dateLabel(s.start)} a ${dateLabel(s.end)}`).join('; ')}`:'Nenhum compromisso encontrado neste calendário e intervalo.'}</Notice>}
        <fieldset><legend className="mb-2 text-sm font-medium text-ink-2">Convidados do cliente</legend><div className="space-y-2">{client.emails.length===0&&<p className="text-sm text-ink-3">Cadastre o e-mail do cliente na ficha antes de convidá-lo.</p>}{client.emails.map((email:string)=><label key={email} className="flex items-center gap-2 break-all text-sm text-ink-2"><input type="checkbox" checked={attendees.includes(email)} onChange={e=>setAttendees(e.target.checked?[...attendees,email]:attendees.filter(v=>v!==email))}/>{email}</label>)}</div></fieldset>
        <Field label="Convidados internos · e-mails corporativos separados por vírgula"><input className={fieldClass} value={team} onChange={e=>setTeam(e.target.value)} maxLength={2000}/></Field>
        <Field label="Pauta"><textarea rows={3} maxLength={5000} className={fieldClass} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
        {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
        <Button type="submit" variant="primary" loading={busy} disabled={!canWrite||uncertain||!calendarId||!title.trim()||(!attendees.length&&!team.trim())}>Criar reunião e enviar convites</Button>
        {uncertain&&<Notice>Confira o calendário antes de criar outra reunião. O convite pode ter sido enviado.</Notice>}
      </form>
    </Panel>
    <Panel title="Reuniões deste projeto" description="Eventos criados pela sua conexão Google." actions={<Button size="sm" onClick={events.reload}>Atualizar</Button>}>
      {events.error&&<Notice error>{events.error}</Notice>}{events.busy?<p role="status" className="text-sm text-ink-3">Consultando reuniões…</p>:!events.data?.items.length?<p className="text-sm text-ink-3">Nenhuma reunião vinculada à sua conta neste projeto.</p>:<ul className="divide-y divide-line">{events.data.items.map((event:Data)=><li key={event.id} className="space-y-2 py-4"><p className="text-sm font-semibold text-ink">{event.unavailable?'Evento indisponível para esta conta':event.title}</p>{!event.unavailable&&<><p className="text-xs text-ink-3">{dateLabel(event.start)} a {dateLabel(event.end)}</p>{event.status==='cancelled'?<Notice>Reunião cancelada no Google.</Notice>:<><div className="flex flex-wrap gap-2"><GoogleLink href={event.meetUrl}>Entrar no Meet</GoogleLink><GoogleLink href={event.url}>Ver na Agenda</GoogleLink></div>{!event.meetUrl&&<p className="text-xs text-ink-3">{event.conferenceStatus==='failure'?'O Google não conseguiu gerar o Meet. Confira o evento na Agenda.':'O link do Meet ainda não está disponível. Atualize os eventos em alguns segundos.'}</p>}</>}</>}</li>)}</ul>}
    </Panel>
  </div>
}
