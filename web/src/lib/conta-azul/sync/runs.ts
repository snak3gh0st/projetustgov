import 'server-only'
import { query } from '@/lib/db'

/**
 * Run registry for the pull sync. A partial unique index
 * (ux_conta_azul_sync_runs_running_pull) allows only one running pull per
 * connection, so cron and "Sincronizar agora" cannot overlap.
 */

export type PullTrigger = 'cron' | 'manual' | 'web'
export type RunStatus = 'running' | 'completed' | 'partial' | 'failed'

export type PullRun = {
  id: string
  trigger_type: PullTrigger
  status: RunStatus
  started_at: string
  finished_at: string | null
  error_message: string | null
  total_items: number
  success_items: number
  failed_items: number
  metadata: Record<string, unknown>
}

const STALE_MINUTES = 30

export async function failStaleRuns(connectionId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE conta_azul_sync_runs
     SET status = 'failed',
         finished_at = NOW(),
         error_message = 'Execução interrompida: sem progresso há mais de ${STALE_MINUTES} minutos'
     WHERE connection_id = $1
       AND direction = 'pull'
       AND status = 'running'
       AND COALESCE((metadata->>'heartbeat_at')::timestamptz, started_at) < NOW() - INTERVAL '${STALE_MINUTES} minutes'
     RETURNING id`,
    [connectionId]
  )
  return rows.length
}

export async function getRunningRun(connectionId: string): Promise<PullRun | null> {
  const rows = await selectRuns(`connection_id = $1 AND direction = 'pull' AND status = 'running'`, [connectionId], 1)
  return rows[0] ?? null
}

/** Inserts a running pull; returns null when another pull already holds the slot. */
export async function insertRun(connectionId: string, trigger: PullTrigger): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO conta_azul_sync_runs (connection_id, direction, trigger_type, status, metadata)
       VALUES ($1, 'pull', $2, 'running', jsonb_build_object('phase', 'iniciando', 'heartbeat_at', NOW()))
       RETURNING id`,
      [connectionId, trigger]
    )
    return rows[0]?.id ?? null
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return null
    throw err
  }
}

export async function patchRun(runId: string, metadata: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE conta_azul_sync_runs
     SET metadata = metadata || $2::jsonb || jsonb_build_object('heartbeat_at', NOW())
     WHERE id = $1`,
    [runId, JSON.stringify(metadata)]
  )
}

export async function finishRun(
  runId: string,
  status: Exclude<RunStatus, 'running'>,
  counts: { total: number; success: number; failed: number },
  metadata: Record<string, unknown>,
  errorMessage: string | null
): Promise<void> {
  await query(
    `UPDATE conta_azul_sync_runs
     SET status = $2, finished_at = NOW(), total_items = $3, success_items = $4, failed_items = $5,
         metadata = metadata || $6::jsonb, error_message = $7
     WHERE id = $1`,
    [runId, status, counts.total, counts.success, counts.failed, JSON.stringify(metadata), errorMessage]
  )
}

async function selectRuns(where: string, params: unknown[], limit: number): Promise<PullRun[]> {
  return query<PullRun>(
    `SELECT id, trigger_type, status, started_at::text, finished_at::text, error_message,
            total_items, success_items, failed_items, metadata
     FROM conta_azul_sync_runs
     WHERE ${where}
     ORDER BY started_at DESC
     LIMIT ${limit}`,
    params
  )
}

export async function listPullRuns(connectionId: string, limit = 10): Promise<PullRun[]> {
  return selectRuns(`connection_id = $1 AND direction = 'pull'`, [connectionId], limit)
}

export async function getRun(runId: string): Promise<PullRun | null> {
  const rows = await selectRuns(`id = $1`, [runId], 1)
  return rows[0] ?? null
}

export async function lastFinishedRun(connectionId: string): Promise<PullRun | null> {
  const rows = await selectRuns(`connection_id = $1 AND direction = 'pull' AND status <> 'running'`, [connectionId], 1)
  return rows[0] ?? null
}

/** Last run that produced usable data (completed or partial), for the freshness stamp. */
export async function lastSuccessfulRun(connectionId: string): Promise<PullRun | null> {
  const rows = await selectRuns(
    `connection_id = $1 AND direction = 'pull' AND status IN ('completed', 'partial')`,
    [connectionId],
    1
  )
  return rows[0] ?? null
}
