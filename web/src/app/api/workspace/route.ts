import { NextRequest,NextResponse } from 'next/server'
import { workspaceSession,workspaceStore,workspaceFailure } from '@/lib/workspace/api'
import { googleReadiness } from '@/lib/workspace/config'
import { disconnectGoogle } from '@/lib/workspace/connection'
import { PRIVATE_HEADERS,canWriteWorkspace } from '@/lib/workspace/domain'
import { seesAllLeads } from '@/lib/roles'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){
  try{
    const actor=await workspaceSession(),store=workspaceStore(),rawSearch=(request.nextUrl.searchParams.get('search')||'').trim().slice(0,100)
    const search=/^[\d.\s/\-]+$/.test(rawSearch)?rawSearch.replace(/\D/g,''):rawSearch
    const clients=await store.rows(`SELECT regexp_replace(vp.cnpj,'\\D','','g') cnpj,MAX(vp.nome) name,COUNT(*)::int projects
      FROM vendedor_projetos vp WHERE ($1 OR vp.vendedor_id=$2 OR vp.closer_id=$2)
      AND (vp.nome ILIKE $3 OR regexp_replace(vp.cnpj,'\\D','','g') LIKE $3)
      GROUP BY regexp_replace(vp.cnpj,'\\D','','g') ORDER BY MAX(vp.nome) LIMIT 40`,
    [seesAllLeads(actor.role)||actor.role==='admin',actor.userId,`%${search}%`])
    return NextResponse.json({connection:await store.safeConnection(actor.userId),configured:googleReadiness(),clients,canWrite:canWriteWorkspace(actor.role)},{headers:PRIVATE_HEADERS})
  }catch(e){return workspaceFailure(e)}
}
export async function DELETE(request:NextRequest){
  try{const actor=await workspaceSession(request);await disconnectGoogle(workspaceStore(),actor.userId);return NextResponse.json({ok:true},{headers:PRIVATE_HEADERS})}
  catch(e){return workspaceFailure(e)}
}
