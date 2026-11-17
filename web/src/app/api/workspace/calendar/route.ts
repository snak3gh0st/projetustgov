import {NextRequest,NextResponse} from 'next/server'
import {z} from 'zod'
import {workspaceSession,workspaceStore,workspaceGoogle,workspaceFailure} from '@/lib/workspace/api'
import {PRIVATE_HEADERS} from '@/lib/workspace/domain'
import {CalendarSyncService} from '@/lib/workspace/calendar-sync'
export const dynamic='force-dynamic'
export async function GET(request:NextRequest){try{
  const actor=await workspaceSession(),store=workspaceStore(),service=new CalendarSyncService(store,workspaceGoogle(store,actor.userId),actor)
  const params=z.object({view:z.enum(['events','calendars']).default('events'),calendarId:z.string().max(300).default('primary'),start:z.string().max(40).optional(),end:z.string().max(40).optional(),pageToken:z.string().max(2000).optional()}).parse(Object.fromEntries(request.nextUrl.searchParams))
  const result=params.view==='calendars'?{items:await service.calendars()}:await service.list(params)
  return NextResponse.json(result,{headers:PRIVATE_HEADERS})
}catch(e){return workspaceFailure(e)}}
