// Explicit local acceptance harness. Never imported by application code.
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {requireLocalTestDb} from './workspace-fixture.mjs'
if(process.env.WORKSPACE_TEST_PROVIDER!=='1'||!process.env.GOOGLE_CLIENT_ID?.startsWith('workspace-test-'))throw new Error('The Workspace provider mock requires explicit test configuration.')
requireLocalTestDb(process.env.DATABASE_URL)
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'workspace-test',alg:'RS256',use:'sig'}
const actualFetch=globalThis.fetch
const scopes=['openid','email','profile',...['gmail.readonly','gmail.send','calendar.events','calendar.events.freebusy','calendar.calendarlist.readonly','drive'].map(s=>`https://www.googleapis.com/auth/${s}`)].join(' ')
const folder={id:'fixture-folder',name:'Cliente Alfa · Documentos',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true},webViewLink:'https://drive.google.com/drive/folders/fixture-folder'}
const file={id:'fixture-document',name:'Contrato de prestação de serviços.pdf',mimeType:'application/pdf',version:'1',parents:[folder.id],webViewLink:'https://drive.google.com/file/d/fixture-document/view'}
const files=new Map([[folder.id,folder],[file.id,file]]),events=new Map()
files.set('fixture-subfolder',{id:'fixture-subfolder',name:'Contratos',mimeType:folder.mimeType,parents:[folder.id],capabilities:{canAddChildren:true}})
files.set('fixture-sheet',{id:'fixture-sheet',name:'Controle de entregas',mimeType:'application/vnd.google-apps.spreadsheet',version:'1',parents:[folder.id],webViewLink:'https://docs.google.com/spreadsheets/d/fixture-sheet/edit'})
files.set('fixture-nested',{id:'fixture-nested',name:'Termo de referência.pdf',mimeType:'application/pdf',version:'1',parents:['fixture-subfolder']})
files.set('fixture-foreign-folder',{id:'fixture-foreign-folder',name:'Outro projeto',mimeType:folder.mimeType,parents:[],capabilities:{canAddChildren:true}})
let uploadCount=0
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url),path=url.pathname
  if(!['oauth2.googleapis.com','www.googleapis.com','gmail.googleapis.com'].includes(url.hostname))return actualFetch(input,init)
  if(path==='/oauth2/v3/certs')return Response.json({keys:[jwk]})
  if(url.hostname==='oauth2.googleapis.com'&&path==='/token'){
    const form=new URLSearchParams(String(init.body)),code=form.get('code')||'',nonce=code.replace(/^workspace-code-/,''),refresh=form.get('grant_type')==='refresh_token'
    if(!refresh&&!code.startsWith('workspace-code-'))return Response.json({error:'invalid_grant'},{status:400})
    const id_token=await new SignJWT({email:'alice@projetus.org',email_verified:true,hd:'projetus.org',nonce}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer('https://accounts.google.com').setAudience(process.env.GOOGLE_CLIENT_ID).setSubject('workspace-google-alice').setIssuedAt().setExpirationTime('1h').sign(privateKey)
    return Response.json({access_token:'workspace-test-access',refresh_token:'workspace-test-refresh',expires_in:3600,scope:scopes,id_token})
  }
  const headers=new Headers(init?.headers)
  if(headers.get('authorization')!=='Bearer workspace-test-access')return Response.json({error:'test grant required'},{status:401})
  if(path.endsWith('/threads'))return Response.json({threads:[{id:'fixture-thread'}]})
  if(path.includes('/threads/'))return Response.json({id:'fixture-thread',messages:[{id:'fixture-message',internalDate:'1794301200000',payload:{headers:[
    {name:'From',value:'Ana · Cliente Alfa <client@example.test>'},{name:'To',value:'alice@projetus.org'},{name:'Subject',value:'Documentos para o projeto'},{name:'Message-ID',value:'<fixture@example.test>'}],
    parts:[{mimeType:'text/plain',body:{data:Buffer.from('Olá, Alice!\n\nSegue o contrato para conferência. Podemos conversar na próxima semana?\n\nObrigada,\nAna').toString('base64url')}},
      {filename:'Contrato.pdf',mimeType:'application/pdf',body:{attachmentId:'fixture-attachment',size:24}}]}}]})
  if(path.includes('/attachments/'))return Response.json({data:Buffer.from('Fictional acceptance file').toString('base64url')})
  if(path.endsWith('/messages/send'))return Response.json({id:'fixture-sent',threadId:'fixture-thread'})
  if(path.endsWith('/calendarList'))return Response.json({items:[{id:'primary',summary:'Alice · PROJETUS',primary:true,accessRole:'owner',conferenceProperties:{allowedConferenceSolutionTypes:['hangoutsMeet']}}]})
  if(path.endsWith('/freeBusy'))return Response.json({calendars:{primary:{busy:[]}}})
  if(path.endsWith('/events')&&init?.method==='POST'){
    const event=JSON.parse(String(init.body));event.hangoutLink='https://meet.google.com/abc-defg-hij';event.htmlLink='https://calendar.google.com/calendar/event?eid=fixture';events.set(event.id,event);return Response.json(event)
  }
  if(path.includes('/events/'))return events.has(path.split('/').at(-1))?Response.json(events.get(path.split('/').at(-1))):new Response('',{status:404})
  if(path.endsWith('/files')&&init?.method==='POST'){
    const metadata=path.startsWith('/upload')?JSON.parse(Buffer.from(init.body).toString().match(/\r\n\r\n(\{[^\r\n]*\})\r\n--/)[1]):JSON.parse(String(init.body))
    const created={id:`fixture-upload-${++uploadCount}`,version:'1',...metadata};files.set(created.id,created);return Response.json(created)
  }
  if(path.endsWith('/files')){const query=url.searchParams.get('q')||'',parent=query.match(/'([^']+)' in parents/)?.[1];return Response.json({files:Array.from(files.values()).filter(f=>query.includes("mimeType='application/vnd.google-apps.folder'")?f.mimeType===folder.mimeType:f.parents?.includes(parent))})}
  if(path.includes('/files/'))return files.has(path.split('/').at(-1))?Response.json(files.get(path.split('/').at(-1))):new Response('',{status:404})
  return Response.json({error:'Unmapped local test endpoint'},{status:404})
}
