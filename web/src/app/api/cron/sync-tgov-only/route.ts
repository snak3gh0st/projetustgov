// systemd timer on btapps: daily TGov-only sync at 10:30 BRT, after sync-execucao.
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-tgov-only
//
// Sincroniza tabelas TGov-only (tgov_propostas, tgov_projetos_execucao) sem
// jamais tocar projetos_execucao, propostas, vendedor_projetos ou lead_contacts.

import { NextResponse } from 'next/server'
import { syncTgovOnly } from '@/lib/tgov-only-sync'
import { tgovSourcesUsed } from '@/lib/tgov-repo'
import { getApiSession } from '@/lib/dal'
import { runExclusive, SyncAlreadyRunningError } from '@/lib/sync-lock'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || (session.role !== 'diretoria' && session.role !== 'admin' && session.role !== 'adm_produto')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('[cron/sync-tgov-only] Starting TGov-only sync...')
    const stats = await runExclusive('sync-tgov-only', syncTgovOnly)
    console.log('[cron/sync-tgov-only] Sync complete:', JSON.stringify(stats))
    return NextResponse.json({ success: true, ...stats, fonte_dados: tgovSourcesUsed() })
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    console.error('[cron/sync-tgov-only] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
