---
phase: 15-etl-sync-validation
plan: 01
subsystem: database
tags: [etl, streaming, csv, zip, postgresql, upsert, cron, node]

# Dependency graph
requires:
  - phase: 14-data-audit-foundation
    provides: projetos_execucao table with UNIQUE(nr_convenio) constraint and NUMERIC(18,2) columns
provides:
  - syncProjetosExecucao() ETL function in web/src/lib/execucao-sync.ts
  - Four exported helpers from repo-sync.ts (cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV)
  - cron_sync_log schema extended with join_miss_count and source columns
affects: [15-02, phase-16, phase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step in-memory join — stream proposta first into Map, then stream convenio and join in-memory
    - OSC filter with multi-column fallback (NATUREZA_JURIDICA -> TIPO_INSTRUMENTO -> error)
    - LEFT JOIN with join_miss_count logging — never silently drop unmatched rows
    - UPSERT ON CONFLICT (nr_convenio) — government convenio ID as stable conflict key
    - parseBRDate helper — DD/MM/YYYY to YYYY-MM-DD conversion for pg DATE parameters

key-files:
  created:
    - web/src/lib/execucao-sync.ts
  modified:
    - web/src/lib/repo-sync.ts
    - web/schema.sql

key-decisions:
  - "OSC filter uses multi-column fallback: tries NATUREZA_JURIDICA, NATUREZA_JURIDICA_PROPONENTE, NAT_JUR, then TIPO_INSTRUMENTO — robust against government CSV header changes"
  - "parseBRDate added as internal helper (not exported) — handles DD/MM/YYYY format used in siconv CSVs"
  - "insert/update heuristic uses SELECT COUNT(*) before and after UPSERT loop — avoids need for per-row tracking"
  - "Memory guard logs CRITICAL warning at 900MB heap — two-pass fallback documented but not implemented (Phase 16 decides if needed based on test results)"

patterns-established:
  - "Pattern: multi-column CSV header fallback — try multiple column name variants for each data field to handle government CSV header changes"
  - "Pattern: debug logging of CSV headers on row 1 — every streaming function logs raw headers so column mapping can be verified without re-running"
  - "Pattern: LEFT JOIN with miss counting — always count join misses and persist to cron_sync_log, never silently drop rows"

requirements-completed: [DATA-01, DATA-02, DATA-04, DATA-05]

# Metrics
duration: 15min
completed: 2026-03-18
---

# Phase 15 Plan 01: ETL Core Function Summary

**Streaming ETL syncProjetosExecucao() joining siconv_proposta (OSC filter) with siconv_convenio (em-execucao filter) via in-memory Map, UPSERTing into projetos_execucao ON CONFLICT (nr_convenio)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-18T15:54:46Z
- **Completed:** 2026-03-18T16:09:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Exported four helpers from repo-sync.ts (cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV) for reuse by execucao-sync.ts
- Extended cron_sync_log schema with join_miss_count INT and source VARCHAR(50) columns via ALTER TABLE IF NOT EXISTS
- Created web/src/lib/execucao-sync.ts — complete streaming ETL with two-step in-memory join, robust OSC filter, parseBRDate helper, UPSERT ON CONFLICT (nr_convenio), and cron_sync_log logging
- TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Export helpers from repo-sync.ts and migrate cron_sync_log schema** - `9e85951` (feat)
2. **Task 2: Create execucao-sync.ts — streaming ETL with in-memory join and UPSERT** - `ab0deb0` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `web/src/lib/execucao-sync.ts` — New ETL function: streams siconv_proposta.csv.zip (OSC filter) and siconv_convenio.csv.zip (em-execucao filter), joins in-memory via propostaMap, UPSERTs into projetos_execucao, logs to cron_sync_log
- `web/src/lib/repo-sync.ts` — Added export keyword to cleanCNPJ, parseBRNumber, fixText, downloadAndStreamCSV (no function bodies modified)
- `web/schema.sql` — Added ALTER TABLE cron_sync_log ADD COLUMN IF NOT EXISTS join_miss_count INT and source VARCHAR(50)

## Decisions Made
- OSC filter is multi-column: tries NATUREZA_JURIDICA variants first (natureza juridica is more reliable for OSC classification), then falls back to TIPO_INSTRUMENTO contains 'osc'. This handles government CSV header changes without silent failures.
- parseBRDate implemented as internal (non-exported) helper — only execucao-sync.ts needs it currently; if Phase 16 or 17 need date parsing it can be exported from repo-sync.ts.
- insert/updated heuristic: SELECT COUNT(*) before and after UPSERT loop. Simple and accurate for the sync-only pattern.
- Memory guard at 900MB is a warning-only for Phase 15 — two-pass fallback deferred until test script (Phase 15 Plan 02) confirms whether memory is actually a problem.

## Deviations from Plan

None — plan executed exactly as written. All four OSC filter column names specified in the plan (NATUREZA_JURIDICA, NATUREZA_JURIDICA_PROPONENTE, NAT_JUR, TIPO_INSTRUMENTO) are implemented with the exact fallback priority order from the plan.

## Issues Encountered

None.

## User Setup Required

The ALTER TABLE statements for cron_sync_log need to run against the live Supabase database. The plan specifies these can be run via Supabase SQL Editor if CLI execution is not available. They are idempotent (ADD COLUMN IF NOT EXISTS) and safe to re-run.

The SQL to run in Supabase SQL Editor:
```sql
ALTER TABLE cron_sync_log ADD COLUMN IF NOT EXISTS join_miss_count INT NOT NULL DEFAULT 0;
ALTER TABLE cron_sync_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'sync-leads';
```

## Next Phase Readiness
- execucao-sync.ts is ready to be called by /api/cron/sync-execucao (Phase 15 Plan 02)
- Test script web/scripts/test-execucao-sync.mjs can now be written against the exported syncProjetosExecucao()
- CSV header debug logging is in place — first test run will reveal actual column names for verification
- If OSC filter returns propostaMap.size === 0, check the logged "OSC filter strategy" line for the column that was selected

---
*Phase: 15-etl-sync-validation*
*Completed: 2026-03-18*
