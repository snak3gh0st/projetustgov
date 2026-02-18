---
phase: quick-21
plan: 01
subsystem: ui
tags: [react, leads, valor, emenda, sort]

requires: []
provides:
  - "Multi-emenda main row valor shows highest individual emenda (lead.valor_emenda), not sum of all emendas"
  - "Sort by valor column uses lead.valor_emenda directly"
affects: [leads-table, valor-display]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - web/src/app/leads/page.tsx

key-decisions:
  - "Multi-emenda main row valor uses lead.valor_emenda (highest individual emenda, ordered DESC by API) instead of summing all subLeads"

patterns-established: []

requirements-completed: [QUICK-21]

duration: 5min
completed: 2026-02-18
---

# Quick Task 21: Remove Summed Valor from Multi-Emenda Main Rows Summary

**Multi-emenda main row valor now displays lead.valor_emenda (highest individual emenda) instead of the misleading sum of all sub-lead emenda values**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed `subLeads.reduce` sum from the main row valor display — always uses `lead.valor_emenda`
- Removed `subLeads.reduce` sum from the sort-by-valor logic — sort uses `lead.valor_emenda` directly
- Sub-row individual valor display was already correct and was not touched
- TypeScript compiles clean, no new errors

## Task Commits

1. **Task 1: Remove subLeads.reduce from valor display and sort logic** - `2270ac6` (fix)

## Files Created/Modified
- `web/src/app/leads/page.tsx` - Removed two `subLeads.reduce` branches (valor display ternary + sort case)

## Decisions Made
- Use `lead.valor_emenda` as representative value for multi-emenda rows (it is the highest individual emenda because the API orders by `valor_emenda DESC`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Multi-emenda valor display is now accurate and consistent with sub-row values
- No follow-up work required

---
*Phase: quick-21*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: `web/src/app/leads/page.tsx`
- FOUND: `21-SUMMARY.md`
- FOUND: commit `2270ac6`
