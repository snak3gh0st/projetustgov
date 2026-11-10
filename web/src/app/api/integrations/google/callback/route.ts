import { NextRequest,NextResponse } from 'next/server'
import { workspaceSession,workspaceStore } from '@/lib/workspace/api'
import { googleConfig } from '@/lib/workspace/config'
import { readOauthSession } from '@/lib/workspace/security'
import { completeAuthorization } from '@/lib/workspace/connection'
import { WorkspaceError } from '@/lib/workspace/domain'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
  let returnTo='/workspace',error:string|null=null
  try{
    const actor=await workspaceSession(),config=googleConfig()
    const session=readOauthSession(request.cookies.get('projete-google-oauth')?.value||'',request.nextUrl.searchParams.get('state')||'',actor.userId,config.encryptionKey)
    returnTo=session.returnTo
    if(request.nextUrl.searchParams.has('error'))throw new WorkspaceError('A autorização Google não foi concluída. Você pode conectar novamente.')
    const code=request.nextUrl.searchParams.get('code')
    if(!code||code.length>4096)throw new WorkspaceError('O Google não retornou o código de autorização.')
    await completeAuthorization(workspaceStore(),actor.userId,code,session.verifier,session.state)
  }catch(e){error=e instanceof WorkspaceError?e.message:'Não foi possível concluir a conexão Google.'}
  const url=new URL(returnTo,process.env.NEXTAUTH_URL||request.url)
  url.searchParams.set(error?'googleError':'googleConnected',error||'1')
  const response=NextResponse.redirect(url)
  response.cookies.set('projete-google-oauth','',{httpOnly:true,sameSite:'lax',path:'/api/integrations/google',maxAge:0})
  response.headers.set('Cache-Control','no-store')
  return response
}
