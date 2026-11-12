import { NextRequest, NextResponse } from 'next/server'
import { workspaceSession, workspaceStore, workspaceGoogle, workspaceFailure } from '@/lib/workspace/api'
import { PRIVATE_HEADERS, WorkspaceError } from '@/lib/workspace/domain'
import { googleReadiness } from '@/lib/workspace/config'
import { TeamCalendarService } from '@/lib/workspace/team-calendar'
import { canReadTeamCalendar } from '@/lib/workspace/calendar-policy'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  try {
    const actor = await workspaceSession(), store = workspaceStore()
    if (!canReadTeamCalendar(actor.role)) throw new WorkspaceError('A agenda da equipe é restrita à gestão comercial.', 403)
    const params = z.object({ start: z.string(), end: z.string(), seller: z.string().uuid().or(z.literal('')).default('') })
      .parse(Object.fromEntries(request.nextUrl.searchParams))
    const result = await new TeamCalendarService(store, workspaceGoogle(store, actor.userId), actor).list(params.start, params.end, params.seller)
    return NextResponse.json({ ...result, configured: googleReadiness() }, { headers: PRIVATE_HEADERS })
  } catch (e) { return workspaceFailure(e) }
}
