---
phase: quick-20
plan: 01
subsystem: ui
tags: [react, dashboard, pipeline, commission, status-config]

# Dependency graph
requires:
  - phase: quick-19
    provides: "STATUS_CONFIG with AINDA NÃO yellow palette in page.tsx"
provides:
  - "Pipeline cards show pct relative to total leads (g.total_leads) not active pipeline subtotal"
  - "STATUS_CONFIG fallback in Detalhamento Comissoes uses correct accent key 'Não Contatado'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pipeline card percentages always denominated by g.total_leads for cross-status comparability"
    - "STATUS_CONFIG fallback key must use exact accented Portuguese string"

key-files:
  created: []
  modified:
    - "web/src/app/page.tsx"

key-decisions:
  - "Pipeline pct uses g.total_leads as denominator so all 5 status cards sum to ~100%"
  - "STATUS_CONFIG fallback restored to 'Não Contatado' (with cedilla+tilde) matching map key"

patterns-established:
  - "Percentage denominator: always g.total_leads, never a subset sum"

requirements-completed: [QUICK-20]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Quick Task 20: Percentuais / Detalhamento Comissoes Summary

**Pipeline card percentages now relative to total leads (not active-pipeline subtotal) and STATUS_CONFIG fallback key corrected from 'Nao Contatado' to 'Não Contatado'**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed `totalForPipeline` variable that caused pipeline card percentages to inflate (e.g., "Não Contatado" showing ~92% instead of ~60%)
- Pipeline `pct` calculation now uses `g.total_leads` as denominator — percentages across all 5 cards now sum to ~100%
- Fixed `STATUS_CONFIG['Nao Contatado']` fallback (no accent) that returned `undefined`, causing potential runtime errors in the Detalhamento Comissoes section
- TypeScript compilation passes with no new errors after both fixes

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix pipeline pct denominator + STATUS_CONFIG fallback key** - `717c6a7` (fix)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `web/src/app/page.tsx` - Removed totalForPipeline, updated pct denominator to g.total_leads, fixed STATUS_CONFIG fallback accent

## Decisions Made
- Pipeline pct uses `g.total_leads` so percentages reflect each status as a share of all leads, not just the active pipeline subset

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dashboard home page pipeline cards now display proportionally meaningful percentages
- Detalhamento Comissoes section renders with correct color styling for all status values including unknown fallbacks

---
*Phase: quick-20*
*Completed: 2026-02-18*
