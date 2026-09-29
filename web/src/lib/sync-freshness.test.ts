import assert from 'node:assert/strict'
import test from 'node:test'

import { assessLeadSyncFreshness, type SyncLogRow } from './sync-freshness'

const now = new Date('2026-09-29T12:00:00Z')
const day = (n: number) => new Date(now.getTime() - n * 86_400_000 + 3_600_000).toISOString()
const runs = (n: number, inserted = 0, errors = 0): SyncLogRow[] =>
  Array.from({ length: n }, (_, i) => ({ ran_at: day(i), inserted, errors }))

test('no rows is no_data', () => {
  assert.equal(assessLeadSyncFreshness([], now).status, 'no_data')
})

test('recent insert is ok', () => {
  const rows = [...runs(3), { ran_at: day(3), inserted: 5, errors: 0 }]
  const r = assessLeadSyncFreshness(rows, now)
  assert.equal(r.status, 'ok')
  assert.equal(r.successful_runs_without_insert, 3)
})

test('many successful runs without insert is stale_source, not failing', () => {
  const r = assessLeadSyncFreshness(runs(9), now)
  assert.equal(r.status, 'stale_source')
  assert.equal(r.successful_runs_without_insert, 9)
})

test('errors on last run is failing', () => {
  assert.equal(assessLeadSyncFreshness([{ ran_at: day(0), inserted: 0, errors: 2 }, ...runs(9)], now).status, 'failing')
})

test('overdue last run is not_running', () => {
  const rows = [{ ran_at: new Date(now.getTime() - 50 * 3_600_000), inserted: 0, errors: 0 }]
  assert.equal(assessLeadSyncFreshness(rows, now).status, 'not_running')
})
