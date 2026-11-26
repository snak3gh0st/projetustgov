import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/dal'
import { getPool } from '@/lib/db'
import { commercialActivity } from '@/lib/commercial-activity'
import { todaySP } from '@/lib/conta-azul/finance/dates'
import { slackConfig, configurationIssues } from '@/lib/slack/config'
import { dailyMessage } from '@/lib/slack/messages'
import { pendingApprovals } from '@/lib/slack/job'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['gestor','diretoria','admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const config = slackConfig(), pool = getPool()
  try {
    const ready = (await pool.query("SELECT to_regclass('public.projete_slack_notifications') IS NOT NULL AS ready")).rows[0].ready
    const deliveries = ready ? (await pool.query('SELECT status,COUNT(*)::int AS count FROM projete_slack_notifications WHERE team_id=$1 GROUP BY status', [config.teamId])).rows : []
    let preview = null
    if (new URL(request.url).searchParams.get('preview') === '1') {
      const now = new Date(), day = todaySP(now)
      const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
      const activity = await commercialActivity(day, null, now)
      preview = dailyMessage(day, time, activity.consultores, await pendingApprovals(pool))
    }
    return NextResponse.json({ enabled: config.enabled, ready, issues: configurationIssues(config), workspace: config.teamId || null,
      channels: { daily: config.channel || null, approvals: config.approvalsChannel || null, operations: config.operationsChannel || null },
      schedule: { time: config.reportTime || null, days: config.reportDays, timezone: 'America/Sao_Paulo' }, deliveries, preview }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Não foi possível consultar a integração Slack.' }, { status: 500 }) }
}
