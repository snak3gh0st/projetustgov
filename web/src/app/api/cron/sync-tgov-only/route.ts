// systemd timer on btapps: daily TGov-only sync at 10:30 BRT, after sync-execucao.
// Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/sync-tgov-only
//
// Sincroniza tabelas TGov-only (tgov_propostas, tgov_projetos_execucao) sem
// jamais tocar projetos_execucao, propostas, vendedor_projetos ou lead_contacts.

import { NextResponse } from 'next/server'
import { syncTgovOnly } from '@/lib/tgov-only-sync'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin' && session.role !== 'adm_produto')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('[cron/sync-tgov-only] Starting TGov-only sync...')
    const stats = await syncTgovOnly()
    console.log('[cron/sync-tgov-only] Sync complete:', JSON.stringify(stats))
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    console.error('[cron/sync-tgov-only] Sync failed:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
