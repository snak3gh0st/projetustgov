---
phase: quick-28
plan: "01"
subsystem: sync
tags: [repo-sync, bug-fix, debug-endpoint, upsert, nat-jur-filter]
dependency_graph:
  requires: [web/src/lib/repo-sync.ts, web/src/app/api/cron/sync-leads/route.ts]
  provides: [web/src/app/api/debug-sync/route.ts, fixed sync stats accuracy]
  affects: [daily cron sync, gestor sync diagnosis]
tech_stack:
  added: []
  patterns: [RETURNING xmax=0 for INSERT vs UPDATE detection, gestor-only debug endpoint]
key_files:
  created:
    - web/src/app/api/debug-sync/route.ts
  modified:
    - web/src/lib/repo-sync.ts
decisions:
  - "Use RETURNING (xmax = 0) AS was_inserted to accurately detect INSERT vs UPDATE — more reliable than the isExisting proxy which had false positives"
  - "isExisting now uses ONLY exact assignmentKey match (not cnpjAssignments.has(cnpj)) to correctly identify brand-new emenda rows"
  - "POST /api/debug-sync triggers full sync but capped at maxDuration=60 (Vercel hobby); note added to use /api/cron/sync-leads for 300s production runs"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-02-20"
  tasks_completed: 2
  files_changed: 2
---

# Phase quick-28 Plan 01: Fix Sync Bugs + Debug Endpoint Summary

**One-liner:** Fixed 3 repo-sync bugs (isExisting false-positive, missing RETURNING clause, silent natJur drop) and added `/api/debug-sync` gestor endpoint for DB state diagnosis and manual sync triggering.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Fix isExisting logic + RETURNING xmax + natJur filter logging | 01755e5 | Done |
| 2 | Create /api/debug-sync endpoint | 329275b | Done |

## What Was Built

### Task 1: Three bugs fixed in `web/src/lib/repo-sync.ts`

**Bug 1 — isExisting false-positive (fixed):**

Before: `const isExisting = existingAssignments.has(assignmentKey) || cnpjAssignments.has(lead.cnpj)`

The `cnpjAssignments.has(lead.cnpj)` condition returned `true` if the CNPJ had ANY row in the DB — even with a different programa/emenda. So a brand-new emenda row for an existing CNPJ was counted as `updated` instead of `inserted`, masking new leads in stats.

After: `const isExisting = existingAssignments.has(assignmentKey)` — exact match only. `cnpjAssignments` still used for the vendedor fallback lookup below.

**Bug 2 — UPSERT with no RETURNING (fixed):**

Added `RETURNING (xmax = 0) AS was_inserted` to the UPSERT SQL. PostgreSQL's `xmax = 0` is `true` for a freshly inserted row and `false` for an updated row. The stats block now uses `result.rows[0]?.was_inserted === true` instead of the broken `isExisting` proxy.

**Bug 3 — Silent natJur filter (fixed):**

Added `totalProgramsScanned`, `programsDroppedNatJur`, and `droppedNatJurSamples` counters around the natJur filter. After the download, logs:
- `[repo-sync] Programs dropped by natJur filter: N of M scanned`
- `[repo-sync] Dropped natJur samples: [...]`

Added `programs_scanned` and `programs_dropped_nat_jur` to the `SyncStats` interface so they appear in API responses.

### Task 2: New `web/src/app/api/debug-sync/route.ts`

**GET /api/debug-sync** — returns:
```json
{
  "db_state": {
    "total_rows": 421,
    "distinct_cnpjs": 240,
    "by_source": [{"importado_de": "auto-repo-sync", "count": 421}],
    "last_repo_sync": "2026-02-20T..."
  },
  "cron_schedule": "06:00 UTC daily (03:00 BRT)",
  "note": "POST to this endpoint to manually trigger a sync (gestor only)"
}
```

**POST /api/debug-sync** — triggers `syncLeadsFromRepo()` and returns full stats including `programs_scanned` and `programs_dropped_nat_jur`.

Both handlers: gestor and gestor_vendedor roles only (403 for others).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] `npx tsc --noEmit` — 0 errors
- [x] UPSERT SQL contains `RETURNING (xmax = 0) AS was_inserted`
- [x] `stats.inserted` and `stats.updated` use `result.rows[0]?.was_inserted` not `isExisting`
- [x] `SyncStats` interface has `programs_scanned` and `programs_dropped_nat_jur`
- [x] File `web/src/app/api/debug-sync/route.ts` exists with GET and POST handlers

## Self-Check: PASSED

- FOUND: web/src/app/api/debug-sync/route.ts
- FOUND commit: 01755e5 (fix isExisting + RETURNING xmax + natJur logging)
- FOUND commit: 329275b (debug-sync endpoint)
