import { WorkspaceError,dateTime,googleCalendarId } from './domain.ts'
import { eventView,type GoogleApi } from './google.ts'
import type { WorkspaceStore } from './store.ts'
import type { WorkspaceActor } from './domain.ts'
type Row=Record<string,any>
export type EventQuery={calendarId?:string;start?:string;end?:string;pageToken?:string}
export function calendarWindow(input:EventQuery,now=new Date()){
  if(Boolean(input.start)!==Boolean(input.end))throw new WorkspaceError('Informe o início e o fim do período.')
  const start=dateTime(input.start||new Date(now.getTime()-90*86400000).toISOString()),end=dateTime(input.end||new Date(now.getTime()+90*86400000).toISOString())
  if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>370*86400000)throw new WorkspaceError('Escolha um período de até 370 dias.')
  if(input.pageToken&&input.pageToken.length>2000)throw new WorkspaceError('Página de agenda inválida.')
  return{start,end}
}
export async function readableCalendar(google:GoogleApi,id='primary'){
  googleCalendarId(id)
  const calendars=await google.calendars('reader')
  const calendar=calendars.find(c=>id==='primary'?c.primary:c.id===id)
  if(!calendar||!['owner','writer','reader','writerWithoutPrivateAccess'].includes(calendar.accessRole))throw new WorkspaceError('Selecione uma agenda com permissão de leitura de eventos.',403)
  return calendar
}
export function eventRelates(event:Row,emails:string[]){
  const contacts=new Set(emails.map(e=>e.toLowerCase()))
  return [...(event.attendees??[]),event.organizer].some(p=>p?.email&&contacts.has(String(p.email).trim().toLowerCase()))
}
/** Live, read-only listing: existing Google events do not require local links. */
export class CalendarSyncService {
  constructor(private store:WorkspaceStore,private google:GoogleApi,private actor:WorkspaceActor){}
  async connected(){const account=await this.store.connection(this.actor.userId);if(account?.status!=='active')throw new WorkspaceError('Conecte sua conta Google para sincronizar a agenda.',409);return account}
  async calendars(){await this.connected();return (await this.google.calendars('reader')).filter(c=>['owner','writer','reader','writerWithoutPrivateAccess'].includes(c.accessRole)).map(c=>({id:c.id,summary:c.summary??c.id,primary:!!c.primary,accessRole:c.accessRole}))}
  async list(input:EventQuery={}){
    await this.connected()
    const window=calendarWindow(input),calendar=await readableCalendar(this.google,input.calendarId)
    const page=await this.google.events(calendar.id,window.start,window.end,input.pageToken)
    const readPrivate=['owner','writer'].includes(calendar.accessRole)
    const items=(page.items as Row[]).filter(e=>e.status!=='cancelled'&&e.id).map(e=>({...eventView(e,calendar.id,readPrivate),source:'google'}))
    return{items,nextPageToken:page.nextPageToken??null,calendar:{id:calendar.id,name:calendar.summary??calendar.id},window,refreshedAt:new Date().toISOString()}
  }
}
