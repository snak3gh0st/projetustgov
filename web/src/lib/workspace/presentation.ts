export type WorkspaceArea = 'email' | 'calendario' | 'drive' | 'meet' | 'historico'
export const WORKSPACE_AREAS: {id:WorkspaceArea;label:string;description:string}[] = [
  {id:'email',label:'E-mail',description:'Conversas e mensagens do cliente'},
  {id:'calendario',label:'Calendário',description:'Compromissos do projeto'},
  {id:'drive',label:'Drive',description:'Arquivos e conferência documental'},
  {id:'meet',label:'Meet',description:'Suas reuniões em um só lugar'},
  {id:'historico',label:'Histórico',description:'Atividades do projeto'},
]
export type WorkspaceEntry = {action?:'compose'|'meeting';recipient?:string}
export function workspaceHref(area:WorkspaceArea,cnpj='',selection='cliente:',entry:WorkspaceEntry={}) {
  const [projectKind,projectKey='']=selection.split(':')
  const params=new URLSearchParams()
  if(cnpj)params.set('cliente',cnpj.replace(/\D/g,''))
  if(projectKind!=='cliente'&&cnpj){params.set('projectKind',projectKind);params.set('projectKey',projectKey)}
  if(cnpj&&((area==='email'&&entry.action==='compose')||(['calendario','meet'].includes(area)&&entry.action==='meeting'))){
    params.set('action',entry.action)
    if(entry.recipient&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(entry.recipient.trim()))params.set('to',entry.recipient.trim().toLowerCase())
  }
  return `/workspace/${area}${params.size?`?${params}`:''}`
}
/** A deep link may suggest a saved contact, never introduce an external recipient. */
export function workspaceRecipient(recipient:string|undefined,emails:string[]):string|undefined {
  return recipient?emails.find(email=>email.toLowerCase()===recipient.trim().toLowerCase()):undefined
}
export function workspaceRecipientLabel(email:string,contacts:{email?:string|null;nome_pessoa?:string|null}[]=[]) {
  const name=contacts.find(contact=>contact.email?.trim().toLowerCase()===email.trim().toLowerCase()&&contact.nome_pessoa?.trim())?.nome_pessoa?.trim()
  return name?`${name} · ${email}`:email
}
export function legacyWorkspaceArea(tab?:string):WorkspaceArea {
  return ({mail:'email',drive:'drive',meetings:'calendario',history:'historico',meet:'meet'} as Record<string,WorkspaceArea>)[tab||'']||'email'
}
export function localDateKey(date:Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function localDateTime(date:Date) {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
}
export function calendarDays(anchor:Date,view:'month'|'week') {
  const first=new Date(anchor.getFullYear(),anchor.getMonth(),view==='month'?1:anchor.getDate())
  first.setDate(first.getDate()-first.getDay())
  return Array.from({length:view==='month'?42:7},(_,i)=>new Date(first.getFullYear(),first.getMonth(),first.getDate()+i))
}
export type CalendarEvent = {id:string;title?:string;start?:string;end?:string;status?:string;unavailable?:boolean;meetUrl?:string|null;url?:string|null;meetingId?:string;outcome?:{status:string;note?:string;version:number}|null}
export function eventsOnDay<T extends CalendarEvent>(events:T[],day:Date) {
  const from=new Date(day.getFullYear(),day.getMonth(),day.getDate()),to=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1)
  return events.filter(event=>{
    if(!event.start||event.unavailable||event.status==='cancelled')return false
    if(event.start.length===10)return event.start<=localDateKey(day)&&(event.end?event.end>localDateKey(day):event.start===localDateKey(day))
    const start=new Date(event.start),end=new Date(event.end||event.start)
    return Number.isFinite(start.getTime())&&start<to&&(end>from||(start>=from&&start<to))
  }).sort((a,b)=>String(a.start).localeCompare(String(b.start)))
}
export function dayEventLayout(events:CalendarEvent[],day:Date) {
  const from=new Date(day.getFullYear(),day.getMonth(),day.getDate()),untilDay=new Date(day.getFullYear(),day.getMonth(),day.getDate()+1)
  const segments=eventsOnDay(events,day).filter(e=>e.start!.length>10).map(event=>({event,
    start:new Date(event.start!)<from?0:new Date(event.start!).getHours()*60+new Date(event.start!).getMinutes(),
    end:new Date(event.end||event.start!)>=untilDay?1440:new Date(event.end||event.start!).getHours()*60+new Date(event.end||event.start!).getMinutes(),column:0,
  })).sort((a,b)=>a.start-b.start||a.end-b.end)
  const result:{event:CalendarEvent;top:number;height:number;left:number;width:number}[]=[]
  let cluster:typeof segments=[],until=-1
  function flush(){const columns:number[]=[];for(const item of cluster){let column=columns.findIndex(end=>end<=item.start);if(column<0)column=columns.length;columns[column]=item.end;item.column=column}for(const item of cluster)result.push({event:item.event,top:item.start*.8,height:Math.max(20,(item.end-item.start)*.8),left:item.column*100/columns.length,width:100/columns.length});cluster=[]}
  for(const item of segments){if(item.start>=until){flush();until=-1}cluster.push(item);until=Math.max(until,item.end)}flush()
  return result
}
export function meetAddress(value:string) {
  const trimmed=value.trim()
  const code=/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(trimmed)?trimmed:null
  if(code)return `https://meet.google.com/${code.toLowerCase()}`
  try{const url=new URL(trimmed);if(url.protocol==='https:'&&url.hostname==='meet.google.com'&&/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(url.pathname)&&!url.username&&!url.password)return `https://meet.google.com${url.pathname.toLowerCase()}`}catch{}
  return null
}
export function fileKind(mimeType='') {
  if(mimeType==='application/vnd.google-apps.folder')return {label:'Pasta',short:'',tone:'folder'}
  if(mimeType.includes('spreadsheet')||mimeType.includes('excel'))return {label:'Planilha',short:'XLS',tone:'sheet'}
  if(mimeType.includes('presentation')||mimeType.includes('powerpoint'))return {label:'Apresentação',short:'PPT',tone:'slide'}
  if(mimeType==='application/pdf')return {label:'PDF',short:'PDF',tone:'pdf'}
  if(mimeType.startsWith('image/'))return {label:'Imagem',short:'IMG',tone:'image'}
  return {label:'Documento',short:'DOC',tone:'document'}
}
