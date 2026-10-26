// systemd timer on btapps: daily execucao sync at 10:00 BRT.
// Separate from lead sync to avoid 504 timeout cascade
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-execucao

import { NextResponse } from 'next/server'
import { syncProjetosExecucao } from '@/lib/execucao-sync'
import { tgovSourcesUsed } from '@/lib/tgov-repo'
import { distributeUnassignedExecucao } from '@/lib/distribute-execucao'
import { AUTO_DISTRIBUTION_ENABLED } from '@/lib/distribution-policy'
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
    console.log('[cron/sync-execucao] Starting daily execucao sync...')
    const stats = await runExclusive('sync-execucao', syncProjetosExecucao)
    console.log('[cron/sync-execucao] Sync complete:', JSON.stringify(stats))

    type DistResult = Awaited<ReturnType<typeof distributeUnassignedExecucao>>
    let distResult: DistResult = { distributed: 0, updated: 0, inserted: 0, vendedores: [], skipped: true }
    if (AUTO_DISTRIBUTION_ENABLED) {
      console.log('[cron/sync-execucao] Starting auto-distribute...')
      distResult = await distributeUnassignedExecucao()
      console.log(`[cron/sync-execucao] Distributed ${distResult.distributed} CNPJs:`, distResult.vendedores.map(v => `${v.nome}: +${v.assigned}`).join(', '))
    } else {
      console.log('[cron/sync-execucao] Auto-distribution disabled; skipping round-robin step')
    }

    return NextResponse.json({
      success: true,
      ...stats,
      distribution: distResult,
      fonte_dados: tgovSourcesUsed(),
    })
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    console.error('[cron/sync-execucao] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
