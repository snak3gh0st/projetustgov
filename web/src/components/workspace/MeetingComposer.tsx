'use client'
import {useEffect,useState} from 'react'
import Button from '@/components/ui/Button'
import {localDateTime} from '@/lib/workspace/presentation'
import WorkspaceDialog from './WorkspaceDialog'
import WorkspaceIcon from './WorkspaceIcon'
import {dateLabel,Field,fieldClass,Notice,RequestError,useResource,type Data,type WorkspaceApi} from './shared'
export default function MeetingComposer({open,...props}:{open:boolean;api:WorkspaceApi;client:Data;initialDate?:Date;onClose:()=>void;onDone:()=>void}) {
  return open?<MeetingForm {...props}/>:null
}
function MeetingForm({api,client,initialDate,onClose,onDone}:{api:WorkspaceApi;client:Data;initialDate?:Date;onClose:()=>void;onDone:()=>void}) {
  const [date]=useState(()=>{const d=initialDate?new Date(initialDate):new Date();if(!initialDate)d.setDate(d.getDate()+1);if(!initialDate||d.getHours()===0)d.setHours(9,0,0,0);return d})
  const [calendarId,setCalendar]=useState(''),[title,setTitle]=useState(`Reunião · ${client.name}`),[description,setDescription]=useState('')
  const [start,setStart]=useState(()=>localDateTime(date)),[end,setEnd]=useState(()=>localDateTime(new Date(date.getTime()+3600000)))
  const [attendees,setAttendees]=useState<string[]>(client.emails.slice(0,1)),[team,setTeam]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[availability,setAvailability]=useState<Data|null>(null)
  const calendars=useResource(()=>api.get('calendars'),[api]),timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
  useEffect(()=>{if(calendars.data?.items.length&&!calendarId)setCalendar((calendars.data.items.find((c:Data)=>c.primary)||calendars.data.items[0]).id)},[calendars.data,calendarId])
  useEffect(()=>setAvailability(null),[start,end,calendarId])
  async function act(create:boolean){setBusy(true);setError('');try{const dates={start:new Date(start).toISOString(),end:new Date(end).toISOString()};if(create){await api.mutate('create_meeting',{calendarId,title,description,...dates,attendees:[...attendees,...team.split(/[,;\s]+/).filter(Boolean)],timeZone:timezone});onDone()}else setAvailability(await api.get('availability',{calendarId,...dates}))}catch(e){setError((e as Error).message);if(create)setUncertain(e instanceof RequestError&&e.uncertain)}finally{setBusy(false)}}
  const slot=availability?.calendars?.[calendarId]
  return <WorkspaceDialog open title="Nova reunião com Google Meet" onClose={()=>{if(!busy)onClose()}}><form className="space-y-4" onSubmit={e=>{e.preventDefault();void act(true)}}>
    <Field label="Título"><input required maxLength={200} className={fieldClass} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Início"><input required type="datetime-local" className={fieldClass} value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Fim"><input required type="datetime-local" className={fieldClass} value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-ink-3">Fuso: {timezone}</span><Button size="sm" disabled={!calendarId||busy||!start||!end} onClick={()=>void act(false)}>Ver disponibilidade</Button></div>
    {slot&&<Notice>{slot.errors?.length?'Não foi possível confirmar a disponibilidade.':slot.busy?.length?`Compromissos neste intervalo: ${slot.busy.map((s:Data)=>`${dateLabel(s.start)} a ${dateLabel(s.end)}`).join('; ')}`:'Este horário está livre no calendário selecionado.'}</Notice>}
    <Field label="Calendário"><select required className={fieldClass} value={calendarId} onChange={e=>setCalendar(e.target.value)}><option value="">Selecione</option>{calendars.data?.items.map((c:Data)=><option key={c.id} value={c.id}>{c.summary}{c.primary?' · principal':''}</option>)}</select></Field>
    {calendars.error&&<Notice error>{calendars.error}</Notice>}
    <fieldset><legend className="mb-2 text-sm font-medium text-ink-2">Convidados do cliente</legend><div className="flex flex-wrap gap-2">{client.emails.length===0&&<p className="text-xs text-ink-3">Cadastre um e-mail na ficha para convidar este cliente.</p>}{client.emails.map((email:string)=><label key={email} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-xs text-ink-2"><input type="checkbox" checked={attendees.includes(email)} onChange={e=>setAttendees(e.target.checked?[...attendees,email]:attendees.filter(v=>v!==email))}/>{email}</label>)}</div></fieldset>
    <Field label="Convidados internos"><input className={fieldClass} value={team} maxLength={2000} placeholder="E-mails corporativos, separados por vírgula" onChange={e=>setTeam(e.target.value)}/></Field>
    <Field label="Pauta"><textarea rows={3} maxLength={5000} className={fieldClass} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
    {error&&<Notice error>{error}</Notice>}{uncertain&&<Notice>Confira sua Agenda antes de criar outra reunião. O convite pode ter sido enviado.</Notice>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><span className="flex items-center gap-2 text-xs text-ink-3"><WorkspaceIcon name="meet" className="h-4 w-4"/>Link do Meet incluído</span><Button type="submit" variant="primary" loading={busy} disabled={uncertain||!calendarId||!title.trim()||(!attendees.length&&!team.trim())}>Criar reunião e enviar convites</Button></div>
  </form></WorkspaceDialog>
}
