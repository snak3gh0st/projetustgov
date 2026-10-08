import { NextResponse } from 'next/server'
import { canManageContaAzul, canReadBiFinanceiro, getApiSession } from '@/lib/dal'
import { getContaAzulConfig } from '@/lib/conta-azul/config'
import { ContaAzulNotActiveError, executePullRun, startPullRun, WEB_BUDGET_MS } from '@/lib/conta-azul/sync/runner'
import { getRunningRun, lastFinishedRun, lastSuccessfulRun, listPullRuns } from '@/lib/conta-azul/sync/runs'
import { getConnectionRow } from '@/lib/conta-azul/sync/store'

export const dynamic = 'force-dynamic'

/** Sync status for the Financeiro header and the Conta Azul admin page (?history=1 adds the last 10 runs). */
export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session || !canReadBiFinanceiro(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { tenantKey } = getContaAzulConfig()
    const conn = await getConnectionRow(tenantKey)
    if (!conn) return NextResponse.json({ connection: null, running: null, lastFinished: null, lastSuccessful: null })
    const wantHistory = new URL(request.url).searchParams.get('history') === '1'
    const [running, lastFinished, lastSuccessful, runs] = await Promise.all([
      getRunningRun(conn.id),
      lastFinishedRun(conn.id),
      lastSuccessfulRun(conn.id),
      wantHistory ? listPullRuns(conn.id, 10) : Promise.resolve(undefined),
    ])
    return NextResponse.json({
      connection: { status: conn.status, companyName: conn.company_name },
      running,
      lastFinished,
      lastSuccessful,
      ...(runs ? { runs } : {}),
    })
  } catch (error) {
    console.error('[api/financeiro/sync] status error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao ler o status' }, { status: 500 })
  }
}

/** "Sincronizar agora": starts a pull in the background and returns its id for polling. */
export async function POST() {
  const session = await getApiSession()
  if (!session || !canManageContaAzul(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const start = await startPullRun('web')
    if (!start.existing) {
      void executePullRun(start.runId, start.connectionId, WEB_BUDGET_MS).catch((err) =>
        console.error('[api/financeiro/sync] background run failed:', err)
      )
    }
    return NextResponse.json({ runId: start.runId, existing: start.existing }, { status: 202 })
  } catch (error) {
    if (error instanceof ContaAzulNotActiveError) {
      return NextResponse.json({ error: 'Conecte o Conta Azul antes de sincronizar.' }, { status: 409 })
    }
    console.error('[api/financeiro/sync] start error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao iniciar' }, { status: 500 })
  }
}
