import { NextRequest,NextResponse } from 'next/server'
import { workspaceSession,workspaceFailure } from '@/lib/workspace/api'
import { googleConfig } from '@/lib/workspace/config'
import { authorizationUrl } from '@/lib/workspace/connection'
import { oauthSession } from '@/lib/workspace/security'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
  try{
    if(request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Abra a conexão a partir da Projete.'},{status:403})
    const actor=await workspaceSession(),config=googleConfig()
    const session=oauthSession(actor.userId,request.nextUrl.searchParams.get('returnTo')||'/workspace',config.encryptionKey)
    const response=NextResponse.redirect(authorizationUrl({...session,email:actor.email}))
    response.cookies.set('projete-google-oauth',session.cookie,{httpOnly:true,secure:new URL(config.redirectUri).protocol==='https:',sameSite:'lax',path:'/api/integrations/google',maxAge:600})
    response.headers.set('Cache-Control','no-store')
    return response
  }catch(e){return workspaceFailure(e)}
}
