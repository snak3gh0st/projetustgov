import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { getPool } from '../db'
import { commercialActivity } from '../commercial-activity'
import { crmAliasSql } from '../execucao-status'
import { buildStructuredLeadScopeSql } from '../crm-scope'
import { whatsappChannels, type WhatsappConfig } from '../whatsapp/channels'
import { connectionState } from '../whatsapp/evolution'
import { slackConfig, configurationIssues, reportDue, type SlackConfig } from './config'
import { SlackClient, SlackError } from './client'
import { dailyMessage, type ConnectionState } from './messages'
import { SlackStore } from './store'

export async function pendingApprovals(db: Pick<Pool, 'query'>): Promise<number> {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM vendedor_projetos vp
    WHERE ${buildStructuredLeadScopeSql('vp')} AND ${crmAliasSql("COALESCE(vp.status_contato,'Não Contatado')")}='Em Aprovação'`)
  return rows[0].count
}
export async function runSlackJob(options: {
  config?: SlackConfig; pool?: Pool; client?: SlackClient; now?: Date; channels?: WhatsappConfig[]
  state?: (config: WhatsappConfig) => Promise<ConnectionState>
  activity?: typeof commercialActivity; pause?: () => Promise<void>
} = {}) {
  const config = options.config || slackConfig()
  if (!config.enabled) return { skipped: true, reason: 'disabled' }
  const issues = configurationIssues(config)
  if (issues.length) return { skipped: true, reason: 'configuration', issues }
  const db = await (options.pool || getPool()).connect()
  const store = new SlackStore(db, config), owner = randomUUID()
  let locked = false
  try {
    // A persisted lease works with PgBouncer transaction pooling; session locks do not.
    await store.initialize()
    locked = await store.acquire(owner)
    if (!locked) return { skipped: true, reason: 'running' }
    const client = options.client || new SlackClient(config.token, config.teamId)
    await client.verify()
    await store.heartbeat(owner)
    const now = options.now || new Date()
    const approvals = await store.approvals()
    const due = reportDue(now, config)
    if (due && !(await db.query('SELECT 1 FROM projete_slack_notifications WHERE team_id=$1 AND notification_key=$2', [config.teamId, `daily:${due.day}`])).rowCount) {
      const cutoff: Date = (await db.query("SELECT ($1::date+$2::time) AT TIME ZONE 'America/Sao_Paulo' AS at", [due.day, due.time])).rows[0].at
      const activity = await (options.activity || commercialActivity)(due.day, null, cutoff)
      await store.enqueue(`daily:${due.day}`, 'daily', config.channel, dailyMessage(due.day, due.time, activity.consultores, await pendingApprovals(db)))
    }
    for (const channel of options.channels || whatsappChannels()) {
      await store.heartbeat(owner)
      const state = await (options.state || ((c) => connectionState(5000, c)))(channel)
      await store.observe(channel.instance, channel.label, state, now)
    }
    let sent = 0, stopped: string | null = null
    for (let i = 0; i < 8; i++) {
      await store.heartbeat(owner)
      const item = await store.claim()
      if (!item) break
      if (item.kind === 'approval' && (!item.lead_event_id || !(await store.approvalCurrent(item.lead_event_id)))) {
        await store.finish(item.id, 'cancelled', 'approval_changed'); continue
      }
      try {
        const ts = await client.post(item.channel_id, item.payload)
        await store.finish(item.id, 'sent', null, ts)
        sent++
      } catch (error) {
        const e = error instanceof SlackError ? error : new SlackError('delivery_uncertain', 'uncertain')
        await store.finish(item.id, e.outcome, e.code, null, e.retryAfter)
        stopped = e.code; break
      }
      // Slack normally allows one posted message per second per channel.
      if (i < 7) await (options.pause || (() => new Promise(resolve => setTimeout(resolve, 1100))))()
    }
    return { sent, approvalsQueued: approvals, stopped }
  } finally {
    try { if (locked) await store.release(owner) }
    finally { db.release() }
  }
}
