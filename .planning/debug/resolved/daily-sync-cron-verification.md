---
status: resolved
trigger: "Investigate issue: daily-sync-cron-verification"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:20:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED and FIXED - Cron is properly wired end-to-end. Two bugs found and fixed: (1) debug-sync GET returned wrong schedule string "06:00 UTC", now corrected to "12:30 UTC"; (2) cron_sync_log added to schema.sql.
test: Read vercel.json, debug-sync/route.ts, cron/sync-leads/route.ts, repo-sync.ts, schema.sql — applied fixes — verified with grep
expecting: Both files show correct values
next_action: Archive

## Symptoms

expected: Sync diário automático — cron roda diariamente e atualiza dados de leads/projetos
actual: Nunca verificado — não sabemos se está rodando ou não
errors: Nenhum erro visível
reproduction: N/A — investigação proativa
timeline: Nunca confirmado desde implementação
started: Nunca confirmado

## Eliminated

- hypothesis: Cron route handler does not exist
  evidence: /api/cron/sync-leads/route.ts exists with full GET handler, proper auth (CRON_SECRET Bearer + gestor session fallback), and calls syncLeadsFromRepo()
  timestamp: 2026-02-24T00:05:00Z

- hypothesis: No observability / sync is untracked
  evidence: repo-sync.ts writes to cron_sync_log table in the finally block of every sync run. Table auto-created via CREATE TABLE IF NOT EXISTS on every sync call. debug-sync GET reads last row from this table.
  timestamp: 2026-02-24T00:06:00Z

- hypothesis: Authentication is broken for cron calls
  evidence: Handler checks Authorization: Bearer $CRON_SECRET (Vercel sets this automatically for cron jobs). Falls back to gestor session for manual triggers. Both paths correctly implemented.
  timestamp: 2026-02-24T00:07:00Z

- hypothesis: Sync function is missing or incomplete
  evidence: repo-sync.ts has a full 9-step pipeline: downloads 3 gov ZIP files, parses CSVs, upserts leads, enriches via BrasilAPI, populates lead_contacts, sends push notifications for monitored CNPJs. maxDuration=300 on cron route.
  timestamp: 2026-02-24T00:08:00Z

## Evidence

- timestamp: 2026-02-24T00:03:00Z
  checked: vercel.json
  found: Cron defined at path /api/cron/sync-leads with schedule "30 12 * * *" = 12:30 UTC = 09:30 BRT
  implication: Cron is properly configured in Vercel's cron system

- timestamp: 2026-02-24T00:04:00Z
  checked: /api/cron/sync-leads/route.ts
  found: maxDuration=300, GET handler with CRON_SECRET auth + gestor session fallback, calls syncLeadsFromRepo()
  implication: Handler is fully implemented and correctly protected

- timestamp: 2026-02-24T00:05:00Z
  checked: /lib/repo-sync.ts
  found: 9-step sync pipeline — downloads 3 government ZIP files from repositorio.dados.gov.br, parses CSVs, upserts leads into vendedor_projetos, enriches via BrasilAPI, populates lead_contacts, sends push notifications for monitored CNPJs. Writes row to cron_sync_log in finally block.
  implication: Sync is comprehensive and self-logging. If it runs, there will be a row in cron_sync_log.

- timestamp: 2026-02-24T00:06:00Z
  checked: /api/debug-sync/route.ts line 48
  found: cron_schedule hardcoded as '06:00 UTC daily (03:00 BRT)' — WRONG. vercel.json says "30 12 * * *" = 12:30 UTC = 09:30 BRT
  implication: The debug endpoint returns misleading schedule info to anyone checking it

- timestamp: 2026-02-24T00:07:00Z
  checked: schema.sql (grep for cron_sync_log)
  found: cron_sync_log table was NOT in schema.sql. It is auto-created by repo-sync.ts via CREATE TABLE IF NOT EXISTS at STEP 5.
  implication: If DB was reset from schema.sql, the table would not exist until the first sync runs. Also missing from source-of-truth schema documentation.

- timestamp: 2026-02-24T00:15:00Z
  checked: Both fixes applied and verified with grep
  found: debug-sync/route.ts now shows '12:30 UTC daily (09:30 BRT)'; schema.sql now has cron_sync_log table definition at section 13.
  implication: Both issues resolved.

## Resolution

root_cause: The cron is correctly configured and fully implemented end-to-end. The "never confirmed" status was due to lack of visibility — GET /api/debug-sync (gestor-only) is the way to check last run, but it was returning a stale/wrong schedule string. Two bugs:
  (1) /api/debug-sync GET returned wrong cron_schedule "06:00 UTC" — actual was "12:30 UTC" (09:30 BRT) per vercel.json
  (2) cron_sync_log table was missing from schema.sql (auto-created at runtime by repo-sync.ts)

fix: |
  1. Fixed web/src/app/api/debug-sync/route.ts: changed cron_schedule from '06:00 UTC daily (03:00 BRT)' to '12:30 UTC daily (09:30 BRT)'
  2. Added cron_sync_log table definition to web/schema.sql as section 13

verification: |
  - grep confirms debug-sync/route.ts now has '12:30 UTC daily (09:30 BRT)' on line 48
  - grep confirms schema.sql now has CREATE TABLE IF NOT EXISTS cron_sync_log on line 225
  - To confirm cron has actually run in production: call GET /api/debug-sync as gestor — last_sync_log will have ran_at timestamp
  - To manually trigger in production: POST /api/debug-sync as gestor
  - Schedule "30 12 * * *" = daily at 12:30 UTC = 09:30 BRT

files_changed:
  - web/src/app/api/debug-sync/route.ts
  - web/schema.sql
