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
    const clients=await store.rows(`WITH clients AS (
      SELECT regexp_replace(vp.cnpj,'\\D','','g') cnpj,MAX(vp.nome) name,COUNT(*)::int projects
      FROM vendedor_projetos vp WHERE ($1 OR vp.vendedor_id=$2 OR vp.closer_id=$2)
      GROUP BY regexp_replace(vp.cnpj,'\\D','','g')
    ), found AS (
      SELECT c.* FROM clients c WHERE c.name ILIKE $3 OR c.cnpj LIKE $3 OR c.cnpj IN (
        SELECT regexp_replace(lc.lead_cnpj,'\\D','','g') FROM lead_contacts lc
          WHERE lc.nome_pessoa ILIKE $3 OR lc.email ILIKE $3
        UNION SELECT regexp_replace(vp.cnpj,'\\D','','g') FROM vendedor_projetos vp
          WHERE vp.nome ILIKE $3 OR vp.email ILIKE $3
      ) ORDER BY c.name LIMIT 40
    ) SELECT c.*,COALESCE(people.contacts,'[]'::jsonb) contacts FROM found c
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('nome_pessoa',lc.nome_pessoa,'email',lc.email,'principal',lc.principal)
          ORDER BY (lc.nome_pessoa ILIKE $3 OR lc.email ILIKE $3) DESC NULLS LAST,lc.principal DESC NULLS LAST,lc.id) contacts
        FROM lead_contacts lc WHERE regexp_replace(lc.lead_cnpj,'\\D','','g')=c.cnpj
      ) people ON true
      ORDER BY c.name`,
    [seesAllLeads(actor.role)||actor.role==='admin',actor.userId,`%${search}%`])
    return NextResponse.json({connection:await store.safeConnection(actor.userId),configured:googleReadiness(),clients,canWrite:canWriteWorkspace(actor.role)},{headers:PRIVATE_HEADERS})
  }catch(e){return workspaceFailure(e)}
}
export async function DELETE(request:NextRequest){
  try{const actor=await workspaceSession(request);await disconnectGoogle(workspaceStore(),actor.userId);return NextResponse.json({ok:true},{headers:PRIVATE_HEADERS})}
  catch(e){return workspaceFailure(e)}
}
