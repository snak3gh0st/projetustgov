import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID,createHash} from 'node:crypto'
import {WorkspaceStore} from '../src/lib/workspace/store.ts'
import {WorkspaceService} from '../src/lib/workspace/service.ts'
import {WorkspaceError,FOLDER_MIME} from '../src/lib/workspace/domain.ts'
import {GoogleApi} from '../src/lib/workspace/google.ts'
import {alice,bob,clientA,clientB,prepareWorkspaceDb,requireLocalTestDb} from './workspace-fixture.mjs'

const url=process.env.WORKSPACE_TEST_DATABASE_URL,schema=`workspace_${randomUUID().replaceAll('-','')}`
let admin,pool,store,service,first,second
const key={cnpj:clientA,projectKind:'comercial',projectKey:'10001'},otherProject={...key,projectKey:'10002'}
const counts={send:0,upload:0,meeting:0,folder:0}
let sendFails=false,uploadMetadataFails=false
const files=new Map([
  ['folder-client',{id:'folder-client',name:'Cliente Alfa · Aprovação',mimeType:FOLDER_MIME,capabilities:{canAddChildren:true},webViewLink:'https://drive.google.com/drive/folders/folder-client'}],
  ['folder-other',{id:'folder-other',name:'Cliente Alfa · Execução',mimeType:FOLDER_MIME,capabilities:{canAddChildren:true}}],
  ['nested-folder',{id:'nested-folder',name:'Contratos',mimeType:FOLDER_MIME,parents:['folder-client'],capabilities:{canAddChildren:true}}],
  ['document',{id:'document',name:'Contrato.pdf',mimeType:'application/pdf',version:'1',parents:['folder-client'],webViewLink:'https://drive.google.com/file/d/document/view'}],
])
const events=new Map()
const google=new GoogleApi(async()=>'fake-access',async(input,init)=>{
  const u=new URL(String(input)),path=u.pathname,body=init?.body
  if(path.endsWith('/calendarList'))return Response.json({items:[{id:'primary',primary:true,accessRole:'owner',conferenceProperties:{allowedConferenceSolutionTypes:['hangoutsMeet']}}]})
  if(path.endsWith('/events')&&init?.method==='POST'){
    counts.meeting++;const event=JSON.parse(body);assert.equal(u.searchParams.get('sendUpdates'),'all')
    events.set(event.id,{...event,hangoutLink:'https://meet.google.com/abc-defg-hij',htmlLink:'https://calendar.google.com/calendar/event?eid=event'})
    return Response.json(events.get(event.id))
  }
  if(path.includes('/events/'))return events.has(path.split('/').at(-1))?Response.json(events.get(path.split('/').at(-1))):new Response('',{status:404})
  if(path.includes('/attachments/'))return Response.json({data:Buffer.from('Anexo de teste').toString('base64url')})
  if(path.endsWith('/messages/send')){counts.send++;return sendFails?new Response('',{status:503}):Response.json({id:'sent',threadId:'thread-client'})}
  if(path.includes('/threads/')){
    const id=path.split('/').at(-1),email=id==='thread-client'?'client@example.test':'outsider@example.test'
    return Response.json({id,messages:[{id:'message-client',internalDate:'1700000000000',payload:{headers:[{name:'From',value:email},{name:'To',value:'alice@projetus.org'},{name:'Subject',value:'Contrato'},{name:'Message-ID',value:'<original@example.test>'}],
      parts:[{mimeType:'text/plain',body:{data:Buffer.from('Documento enviado').toString('base64url')}},{filename:'Anexo.pdf',mimeType:'application/pdf',body:{attachmentId:'attachment-client',size:14}}]}}]})
  }
  if(path.endsWith('/threads'))return Response.json({threads:[{id:'thread-client'}]})
  if(path.endsWith('/files')&&init?.method==='POST'){
    if(path.startsWith('/upload')){counts.upload++;const metadata=JSON.parse(Buffer.from(body).toString().match(/\r\n\r\n(\{[^\r\n]*\})\r\n--/)[1]);const file={id:`upload-${counts.upload}`,name:'Anexo.pdf',mimeType:'application/pdf',version:'1',parents:metadata.parents};files.set(file.id,file);return Response.json(file)}
    counts.folder++;const data=JSON.parse(body),file={id:`new-folder-${counts.folder}`,...data,capabilities:{canAddChildren:true}};files.set(file.id,file);return Response.json(file)
  }
  if(path.endsWith('/files')){const parent=u.searchParams.get('q')?.match(/'([^']+)' in parents/)?.[1];return Response.json({files:Array.from(files.values()).filter(f=>f.parents?.includes(parent))})}
  if(path.includes('/files/')){
    const id=decodeURIComponent(path.split('/').at(-1))
    if(uploadMetadataFails&&id.startsWith('upload-'))return new Response('',{status:403})
    return files.has(id)?Response.json(files.get(id)):new Response('',{status:404})
  }
  throw new Error(`Unexpected mocked route ${path}`)
})
before(async()=>{
  if(!url)return;requireLocalTestDb(url)
  admin=new pg.Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`)
  pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema},public`});await prepareWorkspaceDb(pool)
  store=new WorkspaceStore(pool)
  for(const[id,sub]of[[alice,'google-alice'],[bob,'google-bob']])await store.saveConnection({userId:id,sub,email:`${sub}@projetus.org`,domain:'projetus.org',access:'cipher',refresh:'cipher',expiresAt:new Date(Date.now()+3600000),scopes:[]})
  service=new WorkspaceService(store,google,{userId:alice,role:'vendedor'})
  first=await store.context(key);second=await store.context(otherProject)
})
after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end()}})
test('same CNPJ has distinct existing projects; foreign projects and agreements are rejected',{skip:!url},async()=>{
  assert.notEqual(first.id,second.id)
  const client=await store.client(clientA)
  assert.deepEqual(client.ambiguousEmails,['shared@example.test'])
  assert.equal(client.projects.filter(p=>p.projectKind==='comercial').length,2)
  await assert.rejects(store.context({...key,projectKey:'10003'}),e=>e.status===403)
  await assert.rejects(store.context({...key,projectKind:'convenio',projectKey:'900002'}),e=>e.status===403)
  assert.equal((await store.context({...key,projectKind:'convenio',projectKey:'900001'})).cnpj,clientA)
})
test('existing folders bind explicitly, without changing another project or creating Drive files',{skip:!url},async()=>{
  await service.bindFolder(key,'folder-client');await service.bindFolder(otherProject,'folder-other')
  assert.equal((await store.context(key)).folder_id,'folder-client')
  assert.equal((await store.context(otherProject)).folder_id,'folder-other')
  assert.equal(counts.folder,0)
  await assert.rejects(service.bindFolder(key,'folder-other'),e=>e.status===409)
})
test('suggested conversations require a contact match and a private explicit association',{skip:!url},async()=>{
  assert.equal((await service.mail(key)).items[0].linked,false)
  await service.linkThread(key,'thread-client')
  assert.equal((await service.mail(key)).items[0].linked,true)
  assert.equal((await store.links(first.id,bob,'thread','google-bob')).length,0)
  assert.equal((await store.links(second.id,alice,'thread','google-alice')).length,0)
  assert.equal((await store.links(first.id,alice,'thread','different-google-account')).length,0)
  await assert.rejects(service.thread(key,'thread-unrelated'),e=>e.status===403)
  assert.ok(!(await store.history(first.id,bob)).some(h=>h.action==='thread.linked'))
})
test('send is exactly once on replay, rejects payload reuse and unknown recipients',{skip:!url},async()=>{
  const input={requestId:randomUUID(),to:['client@example.test'],subject:'Aprovação',text:'Documento recebido.'}
  await service.send(key,input);await service.send(key,input)
  assert.equal(counts.send,1)
  await assert.rejects(service.send(key,{...input,text:'Different'}),e=>e.status===409)
  await assert.rejects(service.send(key,{...input,requestId:randomUUID(),to:['unknown@example.test']}),e=>e.status===403)
  assert.equal(counts.send,1)
})
test('unknown send outcome is persisted and replay never calls Gmail again',{skip:!url},async()=>{
  sendFails=true;const input={requestId:randomUUID(),to:['client@example.test'],subject:'Resultado incerto',text:'Teste'}
  try{
    await assert.rejects(service.send(key,input),e=>e.uncertain===true)
    const before=counts.send
    await assert.rejects(service.send(key,input),e=>e.status===409&&e.uncertain===true)
    assert.equal(counts.send,before)
  }finally{sendFails=false}
})
test('document approval is scoped to one project and invalidated by a new Google version',{skip:!url},async()=>{
  const doc=await service.registerDocument(key,'document','Contrato')
  await service.reviewDocument(key,{id:doc.id,status:'approved',version:'1',note:'Conferido com o contrato.'})
  assert.equal((await service.files(key)).documents.find(d=>d.id===doc.id).status,'approved')
  await assert.rejects(service.reviewDocument(otherProject,{id:doc.id,status:'approved',version:'1',note:'Wrong project'}),e=>e.status===404)
  files.get('document').version='2'
  assert.equal((await service.files(key)).documents.find(d=>d.id===doc.id).status,'review')
  await assert.rejects(service.reviewDocument(key,{id:doc.id,status:'approved',version:'1',note:'Stale'}),e=>e.status===409)
  await service.reviewDocument(key,{id:doc.id,status:'approved',version:'2',note:'Nova versão conferida.'})
  files.get('document').parents=['folder-other']
  assert.equal((await service.files(key)).documents.find(d=>d.id===doc.id).unavailable,true)
  await assert.rejects(service.reviewDocument(key,{id:doc.id,status:'approved',version:'2',note:'Moved'}),e=>e.status===409)
  files.get('document').parents=['folder-client']
})
test('email attachment is saved once in the project folder and registered for review',{skip:!url},async()=>{
  const input={requestId:randomUUID(),threadId:'thread-client',messageId:'message-client',attachmentId:'attachment-client',typeLabel:'Contrato recebido'}
  const result=await service.saveAttachment(key,input);await service.saveAttachment(key,input)
  assert.equal(counts.upload,1)
  assert.equal(result.document.status,'received')
  assert.ok(files.get(result.id).parents.includes('folder-client'))
  await assert.rejects(service.saveAttachment(key,{...input,attachmentId:'foreign'}),e=>e.status===404)
})
test('accepted upload followed by metadata failure stays uncertain and cannot create a duplicate',{skip:!url},async()=>{
  uploadMetadataFails=true
  const input={requestId:randomUUID(),name:'Upload.pdf',mimeType:'application/pdf',typeLabel:'Contrato',bytes:new Uint8Array([1,2,3])}
  try{await assert.rejects(service.upload(key,input),e=>e.uncertain===true);const before=counts.upload;await assert.rejects(service.upload(key,input),e=>e.uncertain===true);assert.equal(counts.upload,before)}finally{uploadMetadataFails=false}
})
test('Meet invitation is created once, isolated by project, with private history',{skip:!url},async()=>{
  const input={requestId:randomUUID(),calendarId:'primary',title:'Reunião Alfa',description:'Conferir contrato',start:'2026-11-10T09:00:00-03:00',end:'2026-11-10T10:00:00-03:00',attendees:['client@example.test','team@projetus.org'],timeZone:'America/Sao_Paulo'}
  const result=await service.meeting(key,input);await service.meeting(key,input)
  assert.equal(counts.meeting,1);assert.equal(result.meetUrl,'https://meet.google.com/abc-defg-hij')
  assert.equal((await service.meetings(key)).items.length,1)
  assert.equal((await service.meetings(otherProject)).items.length,0)
  assert.ok(!(await store.history(first.id,bob)).some(h=>h.action==='meeting.created'))
  await assert.rejects(service.meeting(key,{...input,requestId:randomUUID(),attendees:['outsider@untrusted.test']}),e=>e.status===403)
})
test('meeting results belong to their author, replay safely and reject stale or premature confirmations',{skip:!url},async()=>{
  const item=(await service.meetings(key)).items[0]
  const input={requestId:randomUUID(),meetingId:item.meetingId,status:'completed',note:'Contrato conferido',version:0}
  const saved=await service.recordMeetingOutcome(key,input)
  assert.equal(saved.outcome.version,1);assert.deepEqual(await service.recordMeetingOutcome(key,input),saved)
  assert.equal((await service.meetings(key)).items[0].outcome.status,'completed')
  await assert.rejects(service.recordMeetingOutcome(key,{...input,requestId:randomUUID(),status:'cancelled'}),e=>e.status===409)
  const someoneElse=new WorkspaceService(store,google,{userId:bob,role:'gestor'})
  await assert.rejects(someoneElse.recordMeetingOutcome(key,{...input,requestId:randomUUID(),version:1}),e=>e.status===404)
  assert.ok(!(await store.history(first.id,bob)).some(h=>h.action==='meeting.outcome'))
  const future=new Date(Date.now()+86400000),end=new Date(future.getTime()+3600000)
  const next=await service.meeting(key,{requestId:randomUUID(),calendarId:'primary',title:'Futura',description:'',start:future.toISOString(),end:end.toISOString(),attendees:['client@example.test'],timeZone:'America/Sao_Paulo'})
  const link=(await service.meetings(key)).items.find(m=>m.id===next.id)
  await assert.rejects(service.recordMeetingOutcome(key,{...input,requestId:randomUUID(),meetingId:link.meetingId,status:'no_show'}),e=>e.status===400)
})
test('competing operation claims invoke the provider once and do not hold a database connection',{skip:!url},async()=>{
  const id=randomUUID();let invoked=0,finish
  const gate=new Promise(resolve=>{finish=resolve})
  const run=async()=>{invoked++;await gate;return{ok:true}}
  const pending=store.operation({userId:alice,role:'vendedor'},first.id,'send_email',id,{test:'race'},'google-alice',run)
  while(!invoked)await new Promise(resolve=>setTimeout(resolve,5))
  try{await assert.rejects(store.operation({userId:alice,role:'vendedor'},first.id,'send_email',id,{test:'race'},'google-alice',run),e=>e.status===409);assert.equal(invoked,1);assert.equal(pool.totalCount,pool.idleCount)}finally{finish();await pending}
})
test('Drive navigation and uploads stay inside the project folder, including nested directories',{skip:!url},async()=>{
  const listing=await service.files(key,'','nested-folder')
  assert.equal(listing.folder.id,'nested-folder');assert.equal(listing.rootFolder.id,'folder-client')
  await assert.rejects(service.files(key,'','folder-other'),e=>e.status===403)
  const input={requestId:randomUUID(),name:'Contrato.pdf',mimeType:'application/pdf',typeLabel:'Contrato',bytes:new Uint8Array([1,2,3]),parentId:'nested-folder'}
  const uploaded=await service.upload(key,input)
  assert.deepEqual(files.get(uploaded.id).parents,['nested-folder'])
  const before=counts.upload
  await assert.rejects(service.upload(key,{...input,requestId:randomUUID(),parentId:'folder-other'}),e=>e.status===403)
  assert.equal(counts.upload,before)
})
test('root uploads retain replay compatibility with operations created before the redesign',{skip:!url},async()=>{
  const input={requestId:randomUUID(),name:'Existing.pdf',mimeType:'application/pdf',typeLabel:'Contrato',bytes:new Uint8Array([1,2,3])}
  const payload={name:input.name,mimeType:input.mimeType,typeLabel:input.typeLabel,hash:createHash('sha256').update(input.bytes).digest('hex'),source:null}
  const hash=createHash('sha256').update(JSON.stringify({kind:'upload_file',contextId:first.id,payload,googleSub:'google-alice'})).digest('hex')
  await store.rows(`INSERT INTO workspace_operations(user_id,request_id,context_id,kind,google_sub,payload_hash,status,response) VALUES($1,$2,$3,'upload_file','google-alice',$4,'done',$5)`,[alice,input.requestId,first.id,hash,{id:'previously-uploaded'}])
  const before=counts.upload
  assert.equal((await service.upload(key,input)).id,'previously-uploaded');assert.equal(counts.upload,before)
})
