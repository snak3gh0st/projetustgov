// Distinguishes "source had nothing new" from "sync is broken" for the daily
// sync-leads job. Pure function over recent cron_sync_log rows (newest first).

export interface SyncLogRow {
  ran_at: Date | string
  inserted: number
  errors: number
}

export type LeadSyncHealth = 'ok' | 'stale_source' | 'failing' | 'not_running' | 'no_data'

export interface LeadSyncFreshness {
  status: LeadSyncHealth
  last_run_at: string | null
  last_insert_at: string | null
  successful_runs_without_insert: number
  message: string
}

const RUN_OVERDUE_HOURS = 36
export const STALE_SOURCE_RUNS = 7

export function assessLeadSyncFreshness(
  rows: SyncLogRow[],
  now: Date = new Date(),
  staleRuns: number = STALE_SOURCE_RUNS,
): LeadSyncFreshness {
  if (rows.length === 0) {
    return { status: 'no_data', last_run_at: null, last_insert_at: null, successful_runs_without_insert: 0, message: 'Nenhuma execução registrada.' }
  }

  const last = rows[0]
  const lastRunAt = new Date(last.ran_at)
  const lastInsert = rows.find((r) => r.inserted > 0)
  const base = {
    last_run_at: lastRunAt.toISOString(),
    last_insert_at: lastInsert ? new Date(lastInsert.ran_at).toISOString() : null,
  }

  const hoursSinceRun = (now.getTime() - lastRunAt.getTime()) / 3_600_000
  if (hoursSinceRun > RUN_OVERDUE_HOURS) {
    return { ...base, status: 'not_running', successful_runs_without_insert: 0, message: `Última execução há ${Math.floor(hoursSinceRun)}h; o timer pode não estar disparando.` }
  }
  if (last.errors > 0) {
    return { ...base, status: 'failing', successful_runs_without_insert: 0, message: `Última execução terminou com ${last.errors} erro(s).` }
  }

  let withoutInsert = 0
  for (const r of rows) {
    if (r.inserted > 0) break
    if (r.errors === 0) withoutInsert++
  }
  if (withoutInsert >= staleRuns) {
    return { ...base, status: 'stale_source', successful_runs_without_insert: withoutInsert, message: `${withoutInsert} execuções bem-sucedidas sem chave nova: revisar frescor da fonte do governo.` }
  }
  return { ...base, status: 'ok', successful_runs_without_insert: withoutInsert, message: 'Sync saudável.' }
}
