---
phase: quick-30
plan: "01"
subsystem: sync-visibility
tags: [sync, gestor, dashboard, cron_sync_log, repo-sync]
dependency_graph:
  requires: [quick-28]
  provides: [cron_sync_log, SyncPanel, last_sync_log_in_debug_api]
  affects: [web/src/lib/repo-sync.ts, web/src/app/api/debug-sync/route.ts, web/src/app/page.tsx]
tech_stack:
  added: [cron_sync_log PostgreSQL table]
  patterns: [INSERT at end of sync run, try/catch log isolation, client-side fetch panel]
key_files:
  created: []
  modified:
    - web/src/lib/repo-sync.ts
    - web/src/app/api/debug-sync/route.ts
    - web/src/app/page.tsx
decisions:
  - "cron_sync_log table created via CREATE TABLE IF NOT EXISTS inside syncLeadsFromRepo() client session — no separate migration file needed"
  - "Log INSERT wrapped in try/catch so logging failure never breaks the sync run"
  - "stats.duration_ms moved to finally block (before client.release()) so accurate value is available for log INSERT"
  - "SyncPanel uses client-side fetch on mount (GET /api/debug-sync) + POST on button click — no new API endpoint needed"
  - "Panel shown only for role === 'gestor', hidden for gestor_vendedor and vendedor"
metrics:
  duration: "~8 minutes"
  completed: "2026-02-20"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 30: Add Sync Visibility Panel to Gestor Dashboard — Summary

**One-liner:** cron_sync_log PostgreSQL table auto-created on first sync + SyncPanel component in gestor dashboard showing last sync stats and Sincronizar Agora button wired to /api/debug-sync.

## Objective

Add operational visibility into cron sync runs for the gestor: (1) persist stats from every `syncLeadsFromRepo()` call to a DB table, (2) expose last log row via GET /api/debug-sync, (3) show a "Ultimo Sync" panel on the gestor dashboard with one-click manual resync.

## Tasks Completed

| # | Name | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create cron_sync_log table + write to repo-sync.ts | f848a7c | CREATE TABLE IF NOT EXISTS inside try block, INSERT in finally with try/catch, duration_ms moved to finally |
| 2 | Update debug-sync GET + add SyncPanel to page.tsx | 1d7abc6 | last_sync_log field in GET response, SyncLog interface, SyncPanel component, role-gated placement in dashboard |

## Deliverables

### cron_sync_log Table

Schema:
```sql
CREATE TABLE IF NOT EXISTS cron_sync_log (
  id SERIAL PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0
)
```

Auto-created on first `syncLeadsFromRepo()` call. Every subsequent call (cron or manual) writes one row. Log INSERT is isolated in `try/catch` so a DB error during logging never crashes the sync.

### GET /api/debug-sync Response

Added `last_sync_log` field:
```json
{
  "last_sync_log": {
    "ran_at": "2026-02-20T15:00:00Z",
    "inserted": 12,
    "updated": 350,
    "errors": 0,
    "duration_ms": 42000
  }
}
```
Returns `null` if no rows exist or if table hasn't been created yet (graceful `try/catch`).

### SyncPanel Component

- Fetches GET /api/debug-sync on mount to show last sync data
- Displays: time ago + full ISO date, insert/update/error badge pills, duration in seconds, next scheduled time
- "Sincronizar Agora" button: POST /api/debug-sync, spinner during flight, panel updates with returned stats on success
- Error text shown below button on failure
- Rendered only when `role === 'gestor'` — not visible to vendedor or gestor_vendedor

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/repo-sync.ts` — modified (cron_sync_log CREATE + INSERT)
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/debug-sync/route.ts` — modified (last_sync_log in GET response)
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/page.tsx` — modified (SyncLog interface + SyncPanel component + placement)

### Commits Exist
- f848a7c: feat(quick-30): create cron_sync_log table + write log row after each sync
- 1d7abc6: feat(quick-30): add SyncPanel to gestor dashboard + last_sync_log in debug-sync GET

### TypeScript
- `npx tsc --noEmit` passed with zero errors

## Self-Check: PASSED
