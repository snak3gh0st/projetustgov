import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { SlackConfig } from './config'
import type { SlackMessage } from './client'
import { approvalMessage, connectionMessage, connectionTransition, type ConnectionState } from './messages'
import { normalizeCrmStatus } from '../crm-catalog'

export interface Notification { id: string; kind: string; channel_id: string; payload: SlackMessage; lead_event_id: string | null }
export class SlackStore {
  constructor(private db: Pick<PoolClient, 'query'>, private config: SlackConfig) {}
  async initialize() {
    await this.db.query('INSERT INTO projete_slack_state(team_id) VALUES($1) ON CONFLICT DO NOTHING', [this.config.teamId])
  }
  async acquire(owner: string) {
    return (await this.db.query(`UPDATE projete_slack_state SET job_owner=$2,job_until=now()+interval '3 minutes'
      WHERE team_id=$1 AND (job_owner IS NULL OR job_until<now()) RETURNING team_id`, [this.config.teamId, owner])).rowCount === 1
  }
  async heartbeat(owner: string) {
    const renewed = await this.db.query(`UPDATE projete_slack_state SET job_until=now()+interval '3 minutes'
      WHERE team_id=$1 AND job_owner=$2 AND job_until>now() RETURNING team_id`, [this.config.teamId, owner])
    if (!renewed.rowCount) throw new Error('job_lease_lost')
  }
  async release(owner: string) {
    await this.db.query('UPDATE projete_slack_state SET job_owner=NULL,job_until=NULL WHERE team_id=$1 AND job_owner=$2', [this.config.teamId, owner])
  }
  async enqueue(key: string, kind: string, channel: string, payload: SlackMessage, event: string | null = null) {
    const r = await this.db.query(`INSERT INTO projete_slack_notifications(team_id,notification_key,kind,channel_id,payload,lead_event_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(team_id,notification_key) DO NOTHING RETURNING id`, [this.config.teamId, key, kind, channel, JSON.stringify(payload), event])
    return r.rowCount === 1
  }
  async approvals() {
    // A time boundary plus the unique delivery key also catches transactions committing out of ID order.
    const { rows } = await this.db.query(`SELECT e.id::text, e.lead_id, e.cnpj, vp.nome,
        COALESCE(u.nome, a.nome) AS consultor
      FROM lead_events e JOIN vendedor_projetos vp ON vp.id = e.lead_id
      LEFT JOIN users u ON u.id = vp.vendedor_id LEFT JOIN users a ON a.id = e.user_id
      WHERE e.created_at >= (SELECT started_at FROM projete_slack_state WHERE team_id=$1)
        AND e.tipo='status' AND e.origem='manual' AND e.valor_novo IN ('Em Aprovação','Aprovação','Aguardando Closer')
        AND vp.status_contato IN ('Em Aprovação','Aprovação','Aguardando Closer')
        AND NOT EXISTS (SELECT 1 FROM lead_events later WHERE later.lead_id=e.lead_id AND later.tipo='status' AND later.id>e.id)
        AND NOT EXISTS (SELECT 1 FROM projete_slack_notifications n WHERE n.team_id=$1 AND n.notification_key='approval:'||e.id::text)
      ORDER BY e.id LIMIT 100`, [this.config.teamId])
    let queued = 0
    for (const row of rows) if (await this.enqueue(`approval:${row.id}`, 'approval', this.config.approvalsChannel, approvalMessage(row, this.config.approvalUser), row.id)) queued++
    return queued
  }
  async observe(instance: string, label: string, state: ConnectionState, now: Date) {
    const { rows } = await this.db.query('SELECT * FROM projete_slack_connections WHERE team_id=$1 AND instance=$2', [this.config.teamId, instance])
    const row = rows[0]
    const transition = connectionTransition(row ? { badSince: row.bad_since, incident: row.incident, lastChecked: row.last_checked } : null, state, now)
    if (transition === 'ignore') return
    let badSince = row?.bad_since || null, incident = row?.incident || null
    await this.db.query('BEGIN')
    try {
      if (transition === 'down') {
        incident = randomUUID()
        await this.enqueue(`down:${instance}:${incident}`, 'connection_down', this.config.operationsChannel, connectionMessage(label, state, false, this.config.operationsUser))
      } else if (transition === 'recovered') {
        const sent = await this.db.query("SELECT 1 FROM projete_slack_notifications WHERE team_id=$1 AND notification_key=$2 AND status='sent'", [this.config.teamId, `down:${instance}:${incident}`])
        if (sent.rowCount) await this.enqueue(`recovered:${instance}:${incident}`, 'connection_recovered', this.config.operationsChannel, connectionMessage(label, state, true, this.config.operationsUser))
        await this.db.query("UPDATE projete_slack_notifications SET status='cancelled' WHERE team_id=$1 AND notification_key=$2 AND status IN ('pending','retry')", [this.config.teamId, `down:${instance}:${incident}`])
        incident = null; badSince = null
      } else if (transition === 'healthy') { badSince = null; incident = null }
      else if (!badSince) badSince = now
      await this.db.query(`INSERT INTO projete_slack_connections(team_id,instance,bad_since,incident,last_checked) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(team_id,instance) DO UPDATE SET bad_since=$3,incident=$4,last_checked=$5`, [this.config.teamId, instance, badSince, incident, now])
      await this.db.query('COMMIT')
    } catch (error) { await this.db.query('ROLLBACK'); throw error }
  }
  async claim(): Promise<Notification | null> {
    const c = this.config
    await this.db.query(`UPDATE projete_slack_notifications SET status='uncertain',error_code='interrupted'
      WHERE team_id=$1 AND status='sending' AND sending_at<now()-interval '3 minutes'`, [c.teamId])
    await this.db.query(`UPDATE projete_slack_notifications SET status='cancelled',error_code='destination_changed'
      WHERE team_id=$1 AND status IN ('pending','retry') AND NOT (
        (kind='approval' AND channel_id=$2) OR (kind='daily' AND channel_id=$3)
        OR (kind IN ('connection_down','connection_recovered') AND channel_id=$4))`, [c.teamId, c.approvalsChannel, c.channel, c.operationsChannel])
    const { rows } = await this.db.query(`WITH candidate AS (
      SELECT id FROM projete_slack_notifications WHERE team_id=$1 AND status IN ('pending','retry') AND next_attempt_at<=now()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE projete_slack_notifications n SET status='sending',sending_at=now(),attempts=attempts+1
      FROM candidate WHERE n.id=candidate.id RETURNING n.id::text,n.kind,n.channel_id,n.payload,n.lead_event_id::text`, [c.teamId])
    return rows[0] || null
  }
  async approvalCurrent(eventId: string) {
    const { rows } = await this.db.query(`SELECT vp.status_contato FROM lead_events e JOIN vendedor_projetos vp ON vp.id=e.lead_id
      WHERE e.id=$1 AND NOT EXISTS (SELECT 1 FROM lead_events later WHERE later.lead_id=e.lead_id AND later.tipo='status' AND later.id>e.id)`, [eventId])
    return normalizeCrmStatus(rows[0]?.status_contato) === 'Em Aprovação'
  }
  async finish(id: string, status: 'sent' | 'retry' | 'failed' | 'uncertain' | 'cancelled', code: string | null = null, ts: string | null = null, retrySeconds = 60) {
    await this.db.query(`UPDATE projete_slack_notifications SET status=$3,error_code=$4,message_ts=$5,
      sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END,next_attempt_at=now()+($6*interval '1 second')
      WHERE id=$1 AND team_id=$2 AND status='sending'`, [id, this.config.teamId, status, code, ts, retrySeconds])
  }
}
