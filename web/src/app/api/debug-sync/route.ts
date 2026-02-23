import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'
// NOTE: POST triggers full sync (300s needed). Works in local dev.
// On Vercel: use /api/cron/sync-leads with gestor session instead (maxDuration=300).
export const maxDuration = 60 // Vercel hobby limit

// GET /api/debug-sync — gestor-only: returns current DB state for sync diagnosis
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'coordenador')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [totalRows, importSources, recentUpdates, distinctCnpjs] = await Promise.all([
      query('SELECT COUNT(*)::int as total FROM vendedor_projetos'),
      query(`SELECT importado_de, COUNT(*)::int as count FROM vendedor_projetos GROUP BY importado_de ORDER BY count DESC`),
      query(`SELECT MAX(updated_at) as last_updated FROM vendedor_projetos WHERE importado_de = 'auto-repo-sync'`),
      query('SELECT COUNT(DISTINCT cnpj)::int as distinct_cnpjs FROM vendedor_projetos'),
    ])

    // Fetch last sync log row — handle case where table doesn't exist yet
    let lastSyncLog = null
    try {
      const logRows = await query(
        `SELECT ran_at, inserted, updated, errors, duration_ms
         FROM cron_sync_log
         ORDER BY ran_at DESC
         LIMIT 1`
      )
      lastSyncLog = logRows[0] ?? null
    } catch {
      // Table doesn't exist yet — return null
      lastSyncLog = null
    }

    return NextResponse.json({
      db_state: {
        total_rows: totalRows[0]?.total ?? 0,
        distinct_cnpjs: distinctCnpjs[0]?.distinct_cnpjs ?? 0,
        by_source: importSources,
        last_repo_sync: recentUpdates[0]?.last_updated ?? null,
      },
      last_sync_log: lastSyncLog,
      cron_schedule: '06:00 UTC daily (03:00 BRT)',
      note: 'POST to this endpoint to manually trigger a sync (gestor only)',
    })
  } catch (error) {
    console.error('[debug-sync] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch debug data' }, { status: 500 })
  }
}

// POST /api/debug-sync — gestor-only: manually trigger a full sync and return stats
export async function POST() {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'coordenador')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { syncLeadsFromRepo } = await import('@/lib/repo-sync')
    const stats = await syncLeadsFromRepo()

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      stats,
    })
  } catch (error) {
    console.error('[debug-sync] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
