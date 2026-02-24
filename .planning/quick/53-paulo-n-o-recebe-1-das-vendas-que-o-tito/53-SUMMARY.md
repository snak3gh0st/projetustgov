---
phase: quick-53
plan: 01
subsystem: api
tags: [postgres, commission, sql, coordenador, role-filter]

# Dependency graph
requires:
  - phase: quick-48
    provides: coordenador role for Paulo, gestor role for Tito
  - phase: 13-02
    provides: paulo_breakdown commission calculation in /api/comissoes
provides:
  - coordenadorRows SQL excludes non-vendedor roles from 1% base
affects: [comissoes, paulo_breakdown, coordenador commission]

# Tech tracking
tech-stack:
  added: []
  patterns: [JOIN users to filter by role before aggregation]

key-files:
  created: []
  modified:
    - web/src/app/api/comissoes/route.ts

key-decisions:
  - "u.role = 'vendedor' filter in coordenadorRows excludes both Tito (gestor) and Paulo (coordenador) implicitly, plus explicit vp.vendedor_id != pauloUserId guard for clarity"

patterns-established:
  - "Pattern: When calculating team-leader commissions on subordinates' sales, JOIN users table and filter by role to prevent leakage from non-target roles"

requirements-completed: [QUICK-53]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Quick Task 53: Paulo's 1% Coordenador Commission Fix Summary

**coordenadorRows SQL now filters to only regular vendedores (role='vendedor'), excluding Tito's gestor leads and Paulo's own coordenador leads from the 1% commission base**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T00:00:00Z
- **Completed:** 2026-02-24T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed coordenadorRows query: added `JOIN users u ON u.id = vp.vendedor_id`
- Added `AND u.role = 'vendedor'` to exclude Tito (gestor) and Paulo himself (coordenador) from the 1% base
- Added `AND vp.vendedor_id != $N` with pauloUserId as an explicit self-exclusion safety guard
- pauloUserId passed as last param `[...pauloParams, pauloUserId]` consistent with exclusivoRows/closerRows pattern
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix coordenadorRows query to exclude gestor leads and Paulo's own leads** - `dbf81da` (fix)

## Files Created/Modified
- `web/src/app/api/comissoes/route.ts` - coordenadorRows query with JOIN users + role filter + self-exclusion

## Decisions Made
- Used `u.role = 'vendedor'` (not a denylist like `u.role NOT IN ('gestor', 'coordenador')`) so it remains correct if new non-vendedor roles are added
- Kept explicit `vp.vendedor_id != $N` guard even though `u.role = 'vendedor'` already covers it: makes intent clear and is immune to future role changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Paulo's Coordenador (1%) card in /comissoes will now correctly reflect only regular vendedor sales
- Cross-check: the card total should drop by (Tito's valor_venda + Paulo's own valor_venda) * 0.01

---
*Phase: quick-53*
*Completed: 2026-02-24*
