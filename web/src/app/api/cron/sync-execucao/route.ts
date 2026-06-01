// Vercel Cron Job: Daily execucao sync from repositorio.dados.gov.br
// Schedule: 13:00 UTC daily (configured in vercel.json)
// Separate from lead sync to avoid 504 timeout cascade
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-execucao

import { NextResponse } from 'next/server'
import { syncProjetosExecucao } from '@/lib/execucao-sync'
import { distributeUnassignedExecucao } from '@/lib/distribute-execucao'
import { AUTO_DISTRIBUTION_ENABLED } from '@/lib/distribution-policy'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  // Allow cron secret OR gestor session for manual triggers
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('[cron/sync-execucao] Starting daily execucao sync...')
    const stats = await syncProjetosExecucao()
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
    })
  } catch (error) {
    console.error('[cron/sync-execucao] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
