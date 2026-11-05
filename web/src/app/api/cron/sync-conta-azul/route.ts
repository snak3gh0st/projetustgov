// systemd timer on btapps: daily Conta Azul pull at 05:00 BRT (projetus-cron@sync-conta-azul).
// The timer's drop-in raises CRON_CURL_MAX_TIME to 900s; the run itself stops at 12 min.
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://projete.projetus.org/api/cron/sync-conta-azul

import { NextResponse } from 'next/server'
import { canManageContaAzul, getApiSession } from '@/lib/dal'
import { ContaAzulNotActiveError, CRON_BUDGET_MS, executePullRun, startPullRun } from '@/lib/conta-azul/sync/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 900

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || !canManageContaAzul(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const start = await startPullRun(isCron ? 'cron' : 'manual')
    if (start.existing) {
      return NextResponse.json({ success: true, skipped: 'already_running', runId: start.runId })
    }
    console.log(`[cron/sync-conta-azul] run ${start.runId} started`)
    const summary = await executePullRun(start.runId, start.connectionId, CRON_BUDGET_MS)
    console.log(`[cron/sync-conta-azul] run ${start.runId} ${summary.status}`, JSON.stringify(summary.metadata.detalhes ?? {}))
    return NextResponse.json(
      { success: summary.status !== 'failed', ...summary },
      { status: summary.status === 'failed' ? 500 : 200 }
    )
  } catch (error) {
    if (error instanceof ContaAzulNotActiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    console.error('[cron/sync-conta-azul] error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
