// systemd timer on btapps: daily lead sync at 09:30 BRT.
// Env required: CRON_SECRET from the Coolify application environment.
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-leads

import { NextResponse } from 'next/server'
import { syncLeadsFromRepo } from '@/lib/repo-sync'
import { tgovSourcesUsed } from '@/lib/tgov-repo'
import { getApiSession } from '@/lib/dal'
import { runExclusive, SyncAlreadyRunningError } from '@/lib/sync-lock'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Allow cron secret OR gestor/diretoria/admin session for manual triggers
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'diretoria' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('[cron/sync-leads] Starting daily lead sync...')
    const stats = await runExclusive('sync-leads', syncLeadsFromRepo)

    console.log('[cron/sync-leads] Sync complete:', JSON.stringify(stats))

    return NextResponse.json({
      success: true,
      ...stats,
      fonte_dados: tgovSourcesUsed(),
    })
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    console.error('[cron/sync-leads] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
