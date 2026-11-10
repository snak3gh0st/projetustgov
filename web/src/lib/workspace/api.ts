import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getApiSession, verifyLeadAccess } from '@/lib/dal'
import { getPool } from '@/lib/db'
import { WorkspaceStore } from './store'
import { WorkspaceError, PRIVATE_HEADERS, canWriteWorkspace, cnpjDigits } from './domain'
import { GoogleApi } from './google'
import { accessToken } from './connection'

export async function workspaceSession(request?:Request,write=false){
  const session=await getApiSession()
  if(!session)throw new WorkspaceError('Entre na Projete para continuar.',401)
  // JWT role refresh is hourly; Workspace mutations honor role changes immediately.
  const current=(await getPool().query('SELECT role,email,nome FROM users WHERE id=$1 AND active',[session.userId])).rows[0]
  if(!current)throw new WorkspaceError('Entre na Projete para continuar.',401)
  const actor={...session,role:current.role,email:current.email,name:current.nome}
  if(write&&!canWriteWorkspace(actor.role))throw new WorkspaceError('Seu perfil permite consultar, mas não alterar o Workspace do cliente.',403)
  if(request&&request.method!=='GET'){
    const expected=new URL(process.env.NEXTAUTH_URL||request.url).origin
    if(request.headers.get('origin')!==expected)throw new WorkspaceError('Origem da solicitação não autorizada.',403)
  }
  return actor
}
export function workspaceStore(){return new WorkspaceStore(getPool())}
export function workspaceGoogle(store:WorkspaceStore,userId:string){return new GoogleApi(()=>accessToken(store,userId))}
export async function workspaceClient(request:Request,rawCnpj:string,write=false){
  const actor=await workspaceSession(request,write),store=workspaceStore(),cnpj=cnpjDigits(rawCnpj)
  const projects=await store.sourceClient(cnpj)
  let allowed=false
  for(const raw of Array.from(new Set<string>(projects.map(p=>p.cnpj)))){if(await verifyLeadAccess(raw,actor.userId,actor.role)){allowed=true;break}}
  if(!allowed)throw new WorkspaceError('Você não tem acesso a este cliente na Projete.',403)
  return{actor,store,cnpj,google:workspaceGoogle(store,actor.userId)}
}
export function workspaceFailure(error:unknown){
  if(error instanceof WorkspaceError)return NextResponse.json({error:error.message,uncertain:error.uncertain},{status:error.status,headers:PRIVATE_HEADERS})
  if(error instanceof ZodError)return NextResponse.json({error:'Confira os campos informados.',issues:error.issues.map(i=>({path:i.path,message:i.message}))},{status:400,headers:PRIVATE_HEADERS})
  if(error instanceof SyntaxError)return NextResponse.json({error:'Solicitação inválida.'},{status:400,headers:PRIVATE_HEADERS})
  if((error as {code?:string})?.code==='42P01')return NextResponse.json({error:'A preparação do Workspace ainda não foi aplicada neste ambiente.'},{status:503,headers:PRIVATE_HEADERS})
  console.error('[workspace]',error instanceof Error?error.name:'unknown')
  return NextResponse.json({error:'Não foi possível concluir a operação no Workspace.'},{status:500,headers:PRIVATE_HEADERS})
}
