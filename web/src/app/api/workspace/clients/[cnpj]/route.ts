import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { workspaceClient,workspaceFailure } from '@/lib/workspace/api'
import { WorkspaceService } from '@/lib/workspace/service'
import { WorkspaceError,PRIVATE_HEADERS,canWriteWorkspace } from '@/lib/workspace/domain'
import { googleReadiness } from '@/lib/workspace/config'

export const dynamic='force-dynamic'
export const maxDuration=120
const identifier=z.string().regex(/^[A-Za-z0-9_@.\-]{1,300}$/)
const uuid=z.string().uuid()
const text=(max:number)=>z.string().trim().min(1).max(max)
const selection=z.object({projectKind:z.enum(['cliente','comercial','convenio']).default('cliente'),projectKey:z.string().max(60).default('')})
const requestId=z.object({requestId:uuid})
async function setup(request:NextRequest,cnpj:string,raw:unknown,write=false){
  const scope=await workspaceClient(request,cnpj,write),key={cnpj:scope.cnpj,...selection.parse(raw)}
  return{...scope,key,service:new WorkspaceService(scope.store,scope.google,scope.actor)}
}
export async function GET(request:NextRequest,{params}:{params:{cnpj:string}}){
  try{
    const query=Object.fromEntries(request.nextUrl.searchParams),{service,key,store,actor,google}=await setup(request,params.cnpj,query)
    const view=query.view||'overview';let result:unknown
    switch(view){
      case 'overview':result={...await service.overview(key),configured:googleReadiness(),canWrite:canWriteWorkspace(actor.role)};break
      case 'mail':result=await service.mail(key,z.string().max(2000).parse(query.pageToken||''));break
      case 'thread':result=await service.thread(key,identifier.parse(query.id));break
      case 'files':result=await service.files(key,z.string().max(2000).parse(query.pageToken||''),query.folderId?identifier.parse(query.folderId):'');break
      case 'folders':await service.connected();result=await google.folders(z.string().max(100).parse(query.search||''),z.string().max(2000).parse(query.pageToken||''));break
      case 'calendars':await service.connected();result={items:await google.calendars()};break
      case 'availability':{
        await service.connected()
        const p=z.object({calendarId:identifier,start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true})}).parse(query)
        if(Date.parse(p.end)<=Date.parse(p.start)||Date.parse(p.end)-Date.parse(p.start)>86400000)throw new WorkspaceError('Informe um intervalo de até 24 horas.')
        result=await google.availability(p.calendarId,p.start,p.end);break
      }
      case 'events':result=await service.meetings(key);break
      case 'history':{const context=await store.context(key);result={items:await store.history(context.id,actor.userId)};break}
      case 'client_history':result={items:await store.rows(`SELECT a.id,a.action,a.summary,a.created_at,u.nome actor_name,c.project_kind,c.project_key
        FROM workspace_activity a JOIN workspace_contexts c ON c.id=a.context_id JOIN users u ON u.id=a.actor_id
        WHERE c.cnpj=$1 AND (a.private_user_id IS NULL OR a.private_user_id=$2) ORDER BY a.created_at DESC LIMIT 60`,[key.cnpj,actor.userId])};break
      default:throw new WorkspaceError('Consulta Workspace desconhecida.')
    }
    return NextResponse.json(result,{headers:PRIVATE_HEADERS})
  }catch(e){return workspaceFailure(e)}
}
export async function POST(request:NextRequest,{params}:{params:{cnpj:string}}){
  try{
    await workspaceClient(request,params.cnpj,true)
    const rawText=await boundedBody(request,1000000),raw=JSON.parse(rawText.toString('utf8'))
    const {service,key}=await setup(request,params.cnpj,raw,true)
    const action=z.string().parse(raw.action);let result:unknown
    switch(action){
      case 'link_thread':result=await service.linkThread(key,identifier.parse(raw.threadId));break
      case 'send_email':result=await service.send(key,z.object({to:z.array(z.string().email()).min(1).max(20),subject:text(200),text:text(100000),threadId:identifier.optional()}).merge(requestId).parse(raw));break
      case 'bind_folder':result=await service.bindFolder(key,identifier.parse(raw.folderId));break
      case 'create_folder':result=await service.createFolder(key,z.object({parentId:identifier,name:text(200)}).merge(requestId).parse(raw));break
      case 'register_document':{const p=z.object({fileId:identifier,typeLabel:text(100)}).parse(raw);result=await service.registerDocument(key,p.fileId,p.typeLabel);break}
      case 'review_document':result=await service.reviewDocument(key,z.object({id:uuid,status:z.enum(['review','approved','rejected']),version:text(100),note:text(2000)}).parse(raw));break
      case 'save_attachment':result=await service.saveAttachment(key,z.object({threadId:identifier,messageId:identifier,attachmentId:identifier,typeLabel:text(100)}).merge(requestId).parse(raw));break
      case 'create_meeting':result=await service.meeting(key,z.object({calendarId:identifier,title:text(200),description:z.string().max(5000).default(''),
        start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),attendees:z.array(z.string().email()).min(1).max(30),timeZone:z.string().max(100).default('America/Sao_Paulo')}).merge(requestId).parse(raw));break
      case 'record_meeting_outcome':result=await service.recordMeetingOutcome(key,z.object({meetingId:uuid,
        status:z.enum(['pending','completed','rescheduled','cancelled','no_show']),note:z.string().trim().max(2000).default(''),
        version:z.number().int().min(0).max(1000000)}).merge(requestId).parse(raw));break
      default:throw new WorkspaceError('Ação Workspace desconhecida.')
    }
    return NextResponse.json(result,{headers:PRIVATE_HEADERS})
  }catch(e){return workspaceFailure(e)}
}
async function boundedBody(request:Request,limit:number){
  if(Number(request.headers.get('content-length')||0)>limit)throw new WorkspaceError('O conteúdo excede o limite permitido.',413)
  const reader=request.body?.getReader();if(!reader)throw new WorkspaceError('Solicitação vazia.')
  const chunks:Uint8Array[]=[];let size=0
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new WorkspaceError('O conteúdo excede o limite permitido.',413)}chunks.push(value)}
  return Buffer.concat(chunks)
}
export async function PUT(request:NextRequest,{params}:{params:{cnpj:string}}){
  try{
    const {actor}=await workspaceClient(request,params.cnpj,true)
    const bytes=await boundedBody(request,16000000)
    const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData()
    const file=form.get('file')
    if(!file||typeof file==='string')throw new WorkspaceError('Selecione um arquivo.')
    const raw=Object.fromEntries(Array.from(form.entries()).filter(([,v])=>typeof v==='string'))
    const {service,key}=await setup(request,params.cnpj,raw,true)
    if(!actor)throw new WorkspaceError('Sessão expirada.',401)
    const p=z.object({requestId:uuid,typeLabel:text(100),parentId:identifier.optional()}).parse(raw)
    const name=text(250).parse(file.name),mimeType=z.string().regex(/^[a-z0-9.+\-]+\/[a-z0-9.+\-]+$/i).parse(file.type||'application/octet-stream')
    return NextResponse.json(await service.upload(key,{...p,name,mimeType,bytes:new Uint8Array(await file.arrayBuffer())}),{headers:PRIVATE_HEADERS})
  }catch(e){return workspaceFailure(e)}
}
