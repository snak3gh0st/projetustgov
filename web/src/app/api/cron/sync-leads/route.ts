// Vercel Cron Job: Daily lead sync from repositorio.dados.gov.br
// Schedule: 06:00 UTC daily (configured in vercel.json)
// Env required: CRON_SECRET (auto-set by Vercel for cron jobs)
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-leads

import { NextResponse } from 'next/server'
import { syncLeadsFromRepo } from '@/lib/repo-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro max timeout

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[cron/sync-leads] Starting daily lead sync...')
    const stats = await syncLeadsFromRepo()

    console.log('[cron/sync-leads] Sync complete:', JSON.stringify(stats))

    return NextResponse.json({
      success: true,
      ...stats,
    })
  } catch (error) {
    console.error('[cron/sync-leads] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
