import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {alice,bob,viewer,clientA,clientB,testPassword,prepareWorkspaceDb,requireLocalTestDb} from './workspace-fixture.mjs'

const base=process.env.WORKSPACE_TEST_BASE_URL,database=process.env.WORKSPACE_TEST_DATABASE_URL,enabled=!!(base&&database)
let pool,aliceCookie,bobCookie,viewerCookie
async function login(email){
  const jar=new Map(),merge=r=>{for(const line of r.headers.getSetCookie()){const pair=line.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}},cookie=()=>Array.from(jar,([k,v])=>`${k}=${v}`).join('; ')
  const csrf=await fetch(`${base}/api/auth/csrf`);merge(csrf)
  const result=await fetch(`${base}/api/auth/callback/credentials`,{method:'POST',redirect:'manual',headers:{Cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},
    body:new URLSearchParams({email,password:testPassword,csrfToken:(await csrf.json()).csrfToken,callbackUrl:`${base}/workspace`})})
  merge(result);assert.ok(Array.from(jar.keys()).some(k=>k.includes('session-token')))
  return cookie()
}
const path=(cnpj=clientA)=>`${base}/api/workspace/clients/${cnpj}`
const context={projectKind:'comercial',projectKey:'10001'}
async function post(values,status=200,cookie=aliceCookie){
  const r=await fetch(path(),{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...context,...values})}),data=await r.json()
  assert.equal(r.status,status,JSON.stringify(data));assert.match(r.headers.get('cache-control'),/no-store/);return data
}
before(async()=>{
  if(!enabled)return;requireLocalTestDb(database);assert.equal(new URL(base).hostname,'localhost')
  pool=new pg.Pool({connectionString:database});await prepareWorkspaceDb(pool)
  aliceCookie=await login('alice@workspace.example.test');bobCookie=await login('bob@workspace.example.test');viewerCookie=await login('leitura@workspace.example.test')
})
after(async()=>{await pool?.end()})
test('Workspace APIs require an active session and assigned client',{skip:!enabled},async()=>{
  assert.equal((await fetch(`${base}/api/workspace`)).status,401)
  assert.equal((await fetch(path(),{headers:{Cookie:bobCookie}})).status,403)
  assert.equal((await fetch(path(clientB),{headers:{Cookie:aliceCookie}})).status,403)
  const r=await fetch(path(),{headers:{Cookie:aliceCookie}}),data=await r.json();assert.equal(r.status,200);assert.equal(data.client.projects.filter(p=>p.projectKind==='comercial').length,2)
  assert.ok(!JSON.stringify(data).includes('token_encrypted'))
})
test('Workspace rejects foreign origin, read-only profiles and stale JWT privileges',{skip:!enabled},async()=>{
  const response=await fetch(path(),{method:'POST',headers:{Cookie:aliceCookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})
  assert.equal(response.status,403)
  await post({action:'bind_folder',folderId:'fixture-folder'},403,viewerCookie)
  await pool.query("UPDATE users SET role='visualizador' WHERE id=$1",[alice])
  try{await post({action:'bind_folder',folderId:'fixture-folder'},403)}finally{await pool.query("UPDATE users SET role='vendedor' WHERE id=$1",[alice])}
})
test('OAuth state validates the active user and signed Google identity through the callback',{skip:!enabled||process.env.WORKSPACE_TEST_PROVIDER!=='1'},async()=>{
  const connect=await fetch(`${base}/api/integrations/google/connect?returnTo=${encodeURIComponent(`/workspace/clientes/${clientA}?projectKind=comercial&projectKey=10001`)}`,{headers:{Cookie:aliceCookie},redirect:'manual'})
  assert.equal(connect.status,307)
  const google=new URL(connect.headers.get('location')),state=google.searchParams.get('state'),cookie=connect.headers.getSetCookie().find(c=>c.startsWith('projete-google-oauth=')).split(';')[0]
  assert.equal(google.origin,'https://accounts.google.com');assert.equal(google.searchParams.get('code_challenge_method'),'S256')
  assert.ok(google.searchParams.get('scope').includes('calendar.events.freebusy'))
  const attack=await fetch(`${base}/api/integrations/google/callback?state=${state}&code=workspace-code-${state}`,{headers:{Cookie:`${bobCookie}; ${cookie}`},redirect:'manual'})
  assert.ok(new URL(attack.headers.get('location')).searchParams.has('googleError'))
  const result=await fetch(`${base}/api/integrations/google/callback?state=${state}&code=workspace-code-${state}`,{headers:{Cookie:`${aliceCookie}; ${cookie}`},redirect:'manual'})
  const target=new URL(result.headers.get('location'));assert.equal(target.pathname,`/workspace/clientes/${clientA}`);assert.equal(target.searchParams.get('googleConnected'),'1')
  const row=(await pool.query('SELECT * FROM google_workspace_connections WHERE user_id=$1',[alice])).rows[0]
  assert.equal(row.email,'alice@projetus.org');assert.ok(!row.access_token_encrypted.includes('workspace-test-access'))
})
test('HTTP workflow binds a folder, sends mail, saves a document, reviews a version and invites to Meet',{skip:!enabled||process.env.WORKSPACE_TEST_PROVIDER!=='1'},async()=>{
  await post({action:'bind_folder',folderId:'fixture-folder'})
  await post({action:'link_thread',threadId:'fixture-thread'})
  const requestId=randomUUID(),values={action:'send_email',requestId,to:['client@example.test'],subject:'Contrato conferido',text:'Podemos agendar uma reunião.',threadId:'fixture-thread'}
  const sent=await post(values);assert.deepEqual(await post(values),sent)
  const saved=await post({action:'save_attachment',requestId:randomUUID(),threadId:'fixture-thread',messageId:'fixture-message',attachmentId:'fixture-attachment',typeLabel:'Contrato'})
  await post({action:'review_document',id:saved.document.id,status:'approved',version:saved.document.version,note:'Contrato fictício conferido.'})
  const meeting=await post({action:'create_meeting',requestId:randomUUID(),calendarId:'primary',title:'Conferência do contrato Alfa',description:'Próximos passos do projeto',start:'2026-11-12T14:00:00-03:00',end:'2026-11-12T15:00:00-03:00',attendees:['client@example.test'],timeZone:'America/Sao_Paulo'})
  assert.equal(meeting.meetUrl,'https://meet.google.com/abc-defg-hij')
  const history=await fetch(`${path()}?view=client_history`,{headers:{Cookie:aliceCookie}}).then(r=>r.json())
  assert.ok(history.items.some(a=>a.action==='document.reviewed'));assert.ok(history.items.some(a=>a.action==='meeting.created'))
  const readonly=await fetch(`${path()}?view=client_history`,{headers:{Cookie:viewerCookie}}).then(r=>r.json())
  assert.ok(readonly.items.some(a=>a.action==='document.reviewed'));assert.ok(!readonly.items.some(a=>a.action==='email.sent'||a.action==='meeting.created'))
  await post({action:'register_document',fileId:saved.id,typeLabel:'Wrong project',projectKey:'10002'},409)
  const foreign=await fetch(`${path()}?view=overview&projectKind=comercial&projectKey=10003`,{headers:{Cookie:aliceCookie}});assert.equal(foreign.status,403)
})
test('Workspace rejects inactive users with an issued session',{skip:!enabled},async()=>{
  await pool.query('UPDATE users SET active=false WHERE id=$1',[alice])
  try{assert.equal((await fetch(path(),{headers:{Cookie:aliceCookie}})).status,401)}finally{await pool.query('UPDATE users SET active=true WHERE id=$1',[alice])}
})

test('expired grants refresh once under concurrent requests without exposing stored tokens',{skip:!enabled||process.env.WORKSPACE_TEST_PROVIDER!=='1'},async()=>{
  const old=(await pool.query("UPDATE google_workspace_connections SET expires_at=now()-interval '1 minute' WHERE user_id=$1 RETURNING version",[alice])).rows[0]
  const responses=await Promise.all(Array.from({length:4},()=>fetch(`${path()}?view=mail&projectKind=comercial&projectKey=10001`,{headers:{Cookie:aliceCookie}})))
  for(const response of responses){assert.equal(response.status,200);assert.ok(!JSON.stringify(await response.json()).includes('workspace-test-access'))}
  const current=(await pool.query('SELECT version,refresh_lock FROM google_workspace_connections WHERE user_id=$1',[alice])).rows[0]
  assert.equal(current.version,old.version+1);assert.equal(current.refresh_lock,null)
})
test('dedicated tool URLs render and legacy links preserve the client and project',{skip:!enabled},async()=>{
  for(const area of ['email','calendario','drive','meet','historico']){
    const r=await fetch(`${base}/workspace/${area}?cliente=${clientA}&projectKind=comercial&projectKey=10001`,{headers:{Cookie:aliceCookie}})
    assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('Áreas do Workspace'))
  }
  const legacy=await fetch(`${base}/workspace/clientes/${clientA}?tab=meetings&projectKind=comercial&projectKey=10002`,{headers:{Cookie:aliceCookie},redirect:'manual'})
  assert.equal(legacy.status,307);const target=new URL(legacy.headers.get('location'),base)
  assert.equal(target.pathname,'/workspace/calendario');assert.equal(target.searchParams.get('cliente'),clientA);assert.equal(target.searchParams.get('projectKey'),'10002')
})
test('HTTP Drive browses and uploads into a verified subfolder without permitting foreign resources',{skip:!enabled||process.env.WORKSPACE_TEST_PROVIDER!=='1'},async()=>{
  const url=`${path()}?view=files&projectKind=comercial&projectKey=10001&folderId=fixture-subfolder`
  const response=await fetch(url,{headers:{Cookie:aliceCookie}}),listing=await response.json()
  assert.equal(response.status,200);assert.equal(listing.folder.id,'fixture-subfolder');assert.ok(listing.files.some(f=>f.id==='fixture-nested'))
  const form=new FormData();form.set('file',new Blob(['Fictional nested upload'],{type:'application/pdf'}),'Nested.pdf');form.set('typeLabel','Contrato');form.set('requestId',randomUUID());form.set('projectKind','comercial');form.set('projectKey','10001');form.set('parentId','fixture-subfolder')
  const uploaded=await fetch(path(),{method:'PUT',headers:{Cookie:aliceCookie,Origin:base},body:form})
  assert.equal(uploaded.status,200)
  const foreign=await fetch(`${path()}?view=files&projectKind=comercial&projectKey=10001&folderId=fixture-foreign-folder`,{headers:{Cookie:aliceCookie}})
  assert.equal(foreign.status,403)
})
