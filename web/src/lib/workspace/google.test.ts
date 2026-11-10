import test from 'node:test'
import assert from 'node:assert/strict'
import { GoogleApi,buildMime,normalizeThread,eventView } from './google.ts'
import { WorkspaceError } from './domain.ts'

type Call={url:URL;init:RequestInit}
function mock(handler:(call:Call)=>unknown){
  const calls:Call[]=[]
  const api=new GoogleApi(async()=>'fake-access',async(url,init)=>{
    const call={url:new URL(String(url)),init:init??{}};calls.push(call)
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer fake-access')
    const value=await handler(call)
    return value instanceof Response?value:Response.json(value)
  })
  return{api,calls}
}
test('Drive escapes search queries and includes shared-drive and pagination parameters',async()=>{
  const {api,calls}=mock(()=>({files:[],nextPageToken:'next'}))
  await api.folders("D'Ávila\\Docs",'page')
  assert.equal(calls[0].url.origin,'https://www.googleapis.com')
  assert.equal(calls[0].url.searchParams.get('q'),"trashed=false and mimeType='application/vnd.google-apps.folder' and name contains 'D\\'Ávila\\\\Docs'")
  assert.equal(calls[0].url.searchParams.get('includeItemsFromAllDrives'),'true')
  assert.equal(calls[0].url.searchParams.get('pageToken'),'page')
  await assert.rejects(api.file('../other'))
})
test('upload stores project metadata and bytes in one multipart create call',async()=>{
  const {api,calls}=mock(()=>({id:'saved-file'}))
  await api.createFile('Contrato.pdf','application/pdf','folder','context',new Uint8Array([1,2,3]))
  assert.equal(calls.length,1)
  assert.equal(calls[0].url.pathname,'/upload/drive/v3/files')
  assert.equal(calls[0].url.searchParams.get('uploadType'),'multipart')
  const body=Buffer.from(calls[0].init.body as Uint8Array)
  assert.match(body.toString(),/"parents":\["folder"\]/)
  assert.match(body.toString(),/"projeteContext":"context"/)
  assert.ok(body.includes(Buffer.from([1,2,3])))
})
test('reply MIME preserves RFC threading and rejects header injection',()=>{
  const raw=buildMime({from:'alice@projetus.org',to:['client@example.test'],subject:'Re: Aprovação',text:'Olá, documento conferido.',requestId:'request',replyMessageId:'<original@example.test>',references:'<first@example.test>'})
  const mime=Buffer.from(raw,'base64url').toString()
  assert.match(mime,/In-Reply-To: <original@example.test>/)
  assert.match(mime,/References: <first@example.test>/)
  assert.match(mime,/From: alice@projetus.org/)
  assert.equal(Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString(),'Olá, documento conferido.')
  assert.throws(()=>buildMime({from:'alice@projetus.org',to:['client@example.test\r\nBcc: evil@example.test'],subject:'x',text:'x',requestId:'x'}))
  assert.throws(()=>buildMime({from:'alice@projetus.org',to:['client@example.test'],subject:'x\r\nBcc: evil@example.test',text:'x',requestId:'x'}))
})
test('long Portuguese subjects fold into valid UTF-8 encoded words',()=>{
  const subject='Aprovação e conferência documental '.repeat(5)
  const mime=Buffer.from(buildMime({from:'alice@projetus.org',to:['client@example.test'],subject,text:'Mensagem',requestId:'request'}),'base64url').toString()
  const words=Array.from(mime.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g))
  assert.ok(words.every(m=>m[0].length<=75))
  assert.equal(words.map(m=>Buffer.from(m[1],'base64').toString()).join(''),subject)
})
test('normalization exposes plain text and attachment metadata without rendering HTML',()=>{
  const t=normalizeThread({id:'thread',messages:[{id:'message',internalDate:'1700000000000',payload:{headers:[{name:'From',value:'Client <client@example.test>'},{name:'Subject',value:'Contrato'}],parts:[
    {mimeType:'text/html',body:{data:Buffer.from('<script>alert(1)</script>').toString('base64url')}},
    {mimeType:'text/plain',body:{data:Buffer.from('Contrato anexado').toString('base64url')}},
    {mimeType:'application/pdf',filename:'Contrato.pdf',body:{attachmentId:'attachment',size:123}},
  ]}}]})
  assert.equal(t.messages[0].text,'Contrato anexado')
  assert.equal(t.messages[0].attachments[0].name,'Contrato.pdf')
  assert.ok(!JSON.stringify(t).includes('<script>'))
})
test('HTML-only mail remains readable as inert text',()=>{
  const html='<html><head><style>hidden</style></head><body><p>Ol&aacute; cliente</p><p>Contrato &amp; reunião &#x1F44B;</p><script>alert(1)</script></body></html>'
  const result=normalizeThread({id:'thread',messages:[{id:'message',internalDate:'1700000000000',payload:{mimeType:'text/html',body:{data:Buffer.from(html).toString('base64url')}}}]})
  assert.match(result.messages[0].text,/Contrato & reunião 👋/)
  assert.ok(!result.messages[0].text.includes('alert(1)'))
})
const meeting={requestId:'11111111-1111-4111-8111-111111111111',calendarId:'team@group.calendar.google.com',title:'Cliente A',description:'Projeto 1',
  start:'2026-11-10T12:00:00Z',end:'2026-11-10T13:00:00Z',attendees:['client@example.test'],contextId:'context'}
test('Meet requests use a stable event ID, unique conference and explicit invitations',async()=>{
  const {api,calls}=mock(({init})=>({...JSON.parse(String(init.body)),conferenceData:{createRequest:{status:{statusCode:'pending'}}}}))
  const event=await api.createMeeting(meeting),call=calls[0],body=JSON.parse(String(call.init.body))
  assert.equal(body.id,'p11111111111141118111111111111111')
  assert.equal(call.url.searchParams.get('conferenceDataVersion'),'1')
  assert.equal(call.url.searchParams.get('sendUpdates'),'all')
  assert.equal(body.conferenceData.createRequest.requestId,meeting.requestId)
  assert.equal(eventView(event,meeting.calendarId).conferenceStatus,'pending')
})
test('event collision recovers only an event with the matching operation; no second insertion',async()=>{
  const {api,calls}=mock(({init})=>init.method==='POST'?new Response('',{status:409}):{id:'event',extendedProperties:{private:{projeteOperation:meeting.requestId}}})
  assert.equal((await api.createMeeting(meeting)).id,'event')
  assert.equal(calls.filter(c=>c.init.method==='POST').length,1)
  const other=mock(({init})=>init.method==='POST'?new Response('',{status:409}):{id:'event',extendedProperties:{private:{projeteOperation:'different'}}})
  await assert.rejects(other.api.createMeeting(meeting),e=>e instanceof WorkspaceError&&e.status===409)
})
test('mutating timeouts and server errors are uncertain and never automatically retried',async()=>{
  const {api,calls}=mock(()=>new Response('provider-secret',{status:503}))
  await assert.rejects(api.send({from:'alice@projetus.org',to:['client@example.test'],subject:'x',text:'x',requestId:'request'}),e=>e instanceof WorkspaceError&&e.uncertain&&!e.message.includes('provider-secret'))
  assert.equal(calls.length,1)
  const offline=new GoogleApi(async()=>'fake',async()=>{throw new Error('socket closed')})
  await assert.rejects(offline.createMeeting(meeting),e=>e instanceof WorkspaceError&&e.uncertain)
})
test('calendar list walks pages and free/busy uses a read-only POST',async()=>{
  const {api,calls}=mock(({url})=>url.pathname.endsWith('/freeBusy')?{calendars:{primary:{busy:[]}}}:url.searchParams.has('pageToken')?{items:[{id:'second'}]}:{items:[{id:'first'}],nextPageToken:'two'})
  assert.deepEqual((await api.calendars()).map(c=>c.id),['first','second'])
  await api.availability('primary',meeting.start,meeting.end)
  assert.equal(calls.at(-1)?.url.pathname,'/calendar/v3/freeBusy')
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.init.body)).items,[{id:'primary'}])
})
