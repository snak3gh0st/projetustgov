import assert from 'node:assert/strict'
import test from 'node:test'
import {CalendarSyncService,calendarWindow,eventRelates} from './calendar-sync.ts'
import {GoogleApi,eventView} from './google.ts'
import {WorkspaceService} from './service.ts'
import {WorkspaceError} from './domain.ts'
import type {WorkspaceStore} from './store.ts'
type Row=Record<string,any>
const owner={userId:'owner',role:'vendedor'},key={cnpj:'12345678000190',projectKind:'cliente' as const,projectKey:''}
const range={start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z'}
const event={id:'existing-event',summary:'Conversa existente',start:{dateTime:'2026-11-17T14:00:00-03:00'},end:{dateTime:'2026-11-17T15:00:00-03:00'},hangoutLink:'https://meet.google.com/abc-defg-hij',attendees:[{email:'client@example.test',responseStatus:'accepted'}],organizer:{email:'owner@projetus.org'},description:'Pauta<br>Alinhamento',htmlLink:'https://calendar.google.com/calendar/event?eid=existing'}
function setup(options:{role?:string;active?:boolean;items?:Row[];nextPageToken?:string;links?:Row[];emails?:string[];fail?:boolean}={}){
  const calls:{url:URL;init:RequestInit}[]=[],writes:Row[]=[]
  const store={connection:async(id:string)=>{assert.equal(id,owner.userId);return{status:options.active===false?'disconnected':'active',google_sub:'google-owner'}},client:async()=>({emails:options.emails??['client@example.test'],ambiguousEmails:[]}),context:async()=>({id:'context-owner'}),links:async()=>options.links??[],operation:async(_a:unknown,_c:unknown,_k:unknown,_i:unknown,_p:unknown,_s:unknown,run:()=>Promise<Row>)=>run(),activity:async()=>{},rows:async(sql:string,values:unknown[])=>{writes.push({sql,values});return[{id:'link-existing',metadata:values[3]}]}} as unknown as WorkspaceStore
  const google=new GoogleApi(async()=>'owners-own-access-token',async(input,init)=>{
    const url=new URL(String(input));calls.push({url,init:init??{}})
    assert.equal((init?.headers as Row).Authorization,'Bearer owners-own-access-token')
    if(options.fail)return new Response('',{status:403})
    if(url.pathname.endsWith('/calendarList'))return Response.json({items:[{id:'owner@projetus.org',summary:'Minha agenda',primary:true,accessRole:options.role??'owner'}]})
    if(url.pathname.endsWith('/events'))return Response.json({items:options.items??[event],nextPageToken:options.nextPageToken})
    return Response.json(event)
  })
  return{google,store,calls,writes,service:new CalendarSyncService(store,google,owner),scoped:new WorkspaceService(store,google,owner)}
}
test('existing Google meetings appear without local links or CRM client and use only viewer credentials',async()=>{
  const {service,calls,writes}=setup(),data=await service.list(range)
  assert.equal(data.items.length,1);assert.equal(data.items[0].id,event.id);assert.equal(data.items[0].meetUrl,event.hangoutLink)
  assert.equal(data.items[0].attendees[0].responseStatus,'accepted');assert.equal(data.items[0].description,'Pauta\nAlinhamento')
  assert.equal(writes.length,0);assert.ok(calls.every(c=>c.init.method==='GET'))
  const query=calls.find(c=>c.url.pathname.endsWith('/events'))!.url.searchParams
  assert.equal(query.get('singleEvents'),'true');assert.equal(query.get('showDeleted'),'false');assert.equal(query.get('orderBy'),'startTime')
  assert.equal(query.get('timeMin'),range.start.replace('00Z','00.000Z'));assert.equal(query.get('maxResults'),'100')
})
test('empty Google page retains pagination and the next request passes the opaque token unchanged',async()=>{
  const {service,calls}=setup({items:[],nextPageToken:'opaque+page/2='}),data=await service.list(range)
  assert.equal(data.items.length,0);assert.equal(data.nextPageToken,'opaque+page/2=')
  await service.list({...range,pageToken:data.nextPageToken})
  assert.equal(calls.at(-1)!.url.searchParams.get('pageToken'),'opaque+page/2=')
})
test('live reload reflects external edits and deletions rather than cached local metadata',async()=>{
  const items=[{...event}],{service}=setup({items})
  assert.equal((await service.list(range)).items[0].title,'Conversa existente')
  items[0].summary='Alterada no Google';assert.equal((await service.list(range)).items[0].title,'Alterada no Google')
  items.length=0;assert.equal((await service.list(range)).items.length,0)
})
test('cancelled and recurring exceptions are excluded; instance identifiers remain distinct',async()=>{
  const {service}=setup({items:[{...event,id:'cancelled',status:'cancelled'},{...event,id:'series_20261117',recurringEventId:'series'},{...event,id:'series_20261124',recurringEventId:'series'}]})
  assert.deepEqual((await service.list(range)).items.map(e=>e.id),['series_20261117','series_20261124'])
})
test('reader cannot recover title, meeting URI, participants or private metadata',async()=>{
  const raw={...event,visibility:'private',summary:'Confidencial',location:'Segredo'}, {service,scoped}=setup({role:'reader',items:[raw]})
  const result=(await service.list(range)).items[0]
  assert.equal(result.title,'Ocupado');assert.equal(result.meetUrl,null);assert.equal(result.url,null);assert.deepEqual(result.attendees,[]);assert.equal(result.description,'')
  assert.equal((await scoped.syncedMeetings(key,range)).items.length,0)
  assert.equal(eventView(raw,'primary',true).title,'Confidencial')
})
test('availability-only access, disconnected grants and provider permission failure fail closed',async()=>{
  await assert.rejects(setup({role:'freeBusyReader'}).service.list(range),/permissão/)
  await assert.rejects(setup({active:false}).service.list(range),/Conecte/)
  await assert.rejects(setup({fail:true}).service.list(range),(e:unknown)=>e instanceof WorkspaceError&&e.status===403)
})
test('date window requires both endpoints and rejects oversized or reversed periods',()=>{
  assert.throws(()=>calendarWindow({start:range.start}),/início/)
  assert.throws(()=>calendarWindow({start:range.end,end:range.start}),/370/)
  assert.throws(()=>calendarWindow({start:range.start,end:'2028-11-01T00:00:00Z'}),/370/)
  const window=calendarWindow({},new Date('2026-11-17T12:00Z'));assert.equal(Date.parse(window.end)-Date.parse(window.start),180*86400000)
})
test('client matching is exact by contact or organizer email, not title substring or description',()=>{
  assert.equal(eventRelates(event,['CLIENT@example.test']),true)
  assert.equal(eventRelates({...event,attendees:[],description:'client@example.test'},['client@example.test']),false)
  assert.equal(eventRelates(event,['other@example.test']),false)
})
test('client calendar discovers matching existing meetings without auto-assigning a project',async()=>{
  const {scoped,writes}=setup(),result=await scoped.syncedMeetings(key,range)
  assert.equal(result.items.length,1);assert.equal(result.items[0].linked,false);assert.equal(result.items[0].meetingId,null);assert.equal(writes.length,0)
  assert.equal((await setup({emails:['other@example.test']}).scoped.syncedMeetings(key,range)).items.length,0)
  const other={...event,extendedProperties:{private:{projeteContext:'other-context'}}}
  assert.equal((await setup({items:[other]}).scoped.syncedMeetings(key,range)).items.length,0)
})
test('existing primary alias links merge once and retain commercial outcome',async()=>{
  const {scoped}=setup({links:[{id:'local-link',remote_id:event.id,metadata:{calendarId:'primary',commercialOutcome:{status:'completed',version:1}}}]})
  const items=(await scoped.syncedMeetings(key,range)).items
  assert.equal(items.length,1);assert.equal(items[0].meetingId,'local-link');assert.equal(items[0].outcome.status,'completed')
})
test('explicit event link is local-only, reuses an existing link and never resends a Google invite',async()=>{
  const {scoped,calls,writes}=setup()
  const result=await scoped.linkMeeting(key,{requestId:'req',calendarId:'primary',eventId:event.id})
  assert.equal(result.meetingId,'link-existing');assert.equal(writes.length,1);assert.ok(calls.every(c=>c.init.method==='GET'))
  const linked=setup({links:[{id:'already-linked',remote_id:event.id,metadata:{calendarId:'primary',commercialOutcome:{version:4}}}]})
  assert.equal((await linked.scoped.linkMeeting(key,{requestId:'req',calendarId:'primary',eventId:event.id})).meetingId,'already-linked');assert.equal(linked.writes.length,0)
})
test('legacy description Meet links are found but non-Google video URLs are not treated as Meet',()=>{
  assert.equal(eventView({...event,hangoutLink:undefined,description:'Participe https://meet.google.com/abc-defg-hij?authuser=0'},'primary').meetUrl,event.hangoutLink)
  assert.equal(eventView({...event,hangoutLink:'https://evil.example/abc-defg-hij',description:''},'primary').meetUrl,null)
})
