import assert from 'node:assert/strict'
import test from 'node:test'

import { addDaysISO, agingBucket, daysBetween, monthKey, todaySP } from './dates'

test('todaySP uses Sao Paulo, not UTC, after 21:00 BRT', () => {
  // 23:30 BRT on Oct 8 is already Oct 9 in UTC
  assert.equal(todaySP(new Date('2026-10-09T02:30:00Z')), '2026-10-08')
  assert.equal(todaySP(new Date('2026-10-09T03:30:00Z')), '2026-10-09')
})

test('daysBetween counts calendar days between ISO dates', () => {
  assert.equal(daysBetween('2026-10-08', '2026-10-08'), 0)
  assert.equal(daysBetween('2026-10-01', '2026-10-08'), 7)
  assert.equal(daysBetween('2026-10-08', '2026-10-01'), -7)
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1)
})

test('agingBucket boundaries', () => {
  const today = '2026-10-08'
  assert.equal(agingBucket('2026-10-20', today), 0)
  assert.equal(agingBucket('2026-10-08', today), 0)
  assert.equal(agingBucket('2026-10-07', today), 1)
  assert.equal(agingBucket(addDaysISO(today, -30), today), 1)
  assert.equal(agingBucket(addDaysISO(today, -31), today), 2)
  assert.equal(agingBucket(addDaysISO(today, -60), today), 2)
  assert.equal(agingBucket(addDaysISO(today, -61), today), 3)
  assert.equal(agingBucket(addDaysISO(today, -90), today), 3)
  assert.equal(agingBucket(addDaysISO(today, -91), today), 4)
})

test('addDaysISO and monthKey', () => {
  assert.equal(addDaysISO('2026-12-30', 3), '2027-01-02')
  assert.equal(monthKey('2026-03-15'), '2026-03')
})
