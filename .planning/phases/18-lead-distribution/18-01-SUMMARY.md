---
phase: 18-lead-distribution
plan: 01
subsystem: api
tags: [postgres, advisory-lock, distribution, lead-assignment, concurrency]

# Dependency graph
requires:
  - phase: 17-ui-navigation
    provides: execucao pipeline UI and data model
provides:
  - pg_try_advisory_lock concurrency guard on distributeUnassignedExecucao()
  - existing_clients-based client routing to coordenador user before round-robin
  - DistributeResult with skipped and coordenador optional fields
  - POST /api/execucao/distribute returns 409 Conflict when lock held
affects: [18-lead-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory lock on dedicated pg connection: getPool().connect() + pg_try_advisory_lock + pg_advisory_unlock in nested try/finally"
    - "Client-routing pre-step: split unassigned CNPJs into existing_clients bucket (coordenador) and round-robin bucket (vendedores)"
    - "409 Conflict response for skip-if-locked API semantics"

key-files:
  created: []
  modified:
    - web/src/lib/distribute-execucao.ts
    - web/src/app/api/execucao/distribute/route.ts

key-decisions:
  - "pg_try_advisory_lock (skip) over pg_advisory_lock (wait) — Vercel 300s timeout makes blocking dangerous if cron already running"
  - "Lock key 19876543210 (Phase 18 reference) — avoids collisions with other advisory lock users"
  - "existing_clients table (not vendedor_projetos.is_existing_client column) as authoritative client detection source"
  - "Coordenador null guard falls back to regular round-robin if no active coordenador found"
  - "REGEXP_REPLACE normalization on both sides of existing_clients join — defensive against inconsistent CNPJ formatting"

patterns-established:
  - "Advisory lock pattern: getPool().connect() + pg_try_advisory_lock in outer try, work in inner try, pg_advisory_unlock in inner finally, client.release() in outer finally"
  - "DistributeResult.skipped semantic: true = lock not acquired (already running), absent/false = distribution ran normally"

requirements-completed: [DIST-01, DIST-02, DIST-03]

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 18 Plan 01: Lead Distribution — Advisory Lock and Client Routing Summary

**pg_try_advisory_lock wrapper + existing_clients pre-routing to coordenador added to distributeUnassignedExecucao(), with 409 Conflict on concurrent lock contention**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-30T16:04:08Z
- **Completed:** 2026-03-30T16:06:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wrapped entire distribution function in a dedicated pg connection with pg_try_advisory_lock to prevent double-assignment between cron and manual trigger
- Added client-routing pre-step that checks unassigned CNPJs against existing_clients table and routes client leads to coordenador user instead of round-robin queue
- Updated DistributeResult interface with optional skipped and coordenador fields for caller visibility
- API route now returns HTTP 409 Conflict when lock is already held, allowing UI to differentiate "nothing to distribute" from "already running"

## Task Commits

Each task was committed atomically:

1. **Task 1: Add advisory lock and client-routing to distribute-execucao.ts** - `ace915f` (feat)
2. **Task 2: Update API route to surface skipped and coordenador in response** - `e1acbbb` (feat)

## Files Created/Modified
- `web/src/lib/distribute-execucao.ts` - Rewrote with dedicated-connection advisory lock, client routing pre-step, updated DistributeResult interface
- `web/src/app/api/execucao/distribute/route.ts` - Added 409 Conflict response when result.skipped is true

## Decisions Made
- pg_try_advisory_lock chosen over pg_advisory_lock: skip-if-locked is safer on Vercel (300s function timeout — blocking cron could cause timeout cascade)
- Lock key 19876543210 chosen to document Phase 18 origin and avoid collision with other advisory lock usages
- REGEXP_REPLACE normalization on existing_clients join query guards against CNPJ formatting inconsistencies across import paths
- Coordenador null guard: if no active coordenador found, log warning and route client leads into regular round-robin (no crash, no silent loss)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-01 complete: distribution backend has concurrency safety and client routing
- Plan 18-02 (UI trigger button on /distribuir page) can proceed immediately
- The DistributeResult.coordenador field is available for UI display in the result modal

---
*Phase: 18-lead-distribution*
*Completed: 2026-03-30*
