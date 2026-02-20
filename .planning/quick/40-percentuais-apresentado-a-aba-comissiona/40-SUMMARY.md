---
phase: quick-40
plan: 01
subsystem: ui
tags: [react, dashboard, comissoes, status-config, accent]

# Dependency graph
requires:
  - phase: quick-20
    provides: "STATUS_CONFIG fallback key accent fix in page.tsx"
provides:
  - "comissoes/page.tsx STATUS_CONFIG uses correct accented key 'Não Contatado'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STATUS_CONFIG keys must use exact accented Portuguese strings matching DB status values"

key-files:
  created: []
  modified:
    - "web/src/app/comissoes/page.tsx"

key-decisions:
  - "STATUS_CONFIG fallback key fixed from 'Nao Contatado' to 'Não Contatado' — mirrors quick-20 fix for page.tsx"
  - "pipeline card pct in page.tsx already correct (g.total_leads denominator) — no regression found"
  - "API total_leads has no status filter — correctly counts all CNPJs"

requirements-completed: [QUICK-40]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Quick Task 40: Percentuais / STATUS_CONFIG Accent Fix in Comissoes Summary

**STATUS_CONFIG key in comissoes/page.tsx corrected from 'Nao Contatado' (no accent) to 'Não Contatado' (with accent), matching DB status values and completing the fix quick-20 started for page.tsx**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-20T19:15:00Z
- **Completed:** 2026-02-20T19:21:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Investigated all three files specified in the plan: `page.tsx`, `comissoes/page.tsx`, `api/dashboard-crm/route.ts`
- Confirmed `page.tsx` pipeline cards already use `g.total_leads` as denominator (quick-20 fix intact)
- Confirmed API `total_leads` query has no status filter — counts all distinct CNPJs correctly
- Found remaining bug in `comissoes/page.tsx`: `STATUS_CONFIG` key was `'Nao Contatado'` (no accent), which would never match the actual status value `'Não Contatado'`, causing undefined styling for non-Fechado statuses
- Fixed key to `'Não Contatado'` with proper accent — mirrors the exact same fix quick-20 applied to `page.tsx`
- TypeScript compilation passes with zero errors

## Task Commits

1. **Task 1: Fix STATUS_CONFIG fallback key accent in comissoes page** - `098dbf5` (fix)

## Files Created/Modified

- `web/src/app/comissoes/page.tsx` - Fixed STATUS_CONFIG key from `'Nao Contatado'` to `'Não Contatado'`

## Decisions Made

- Pipeline percentage denominators are already correct everywhere — this task confirmed the prior fix (quick-20) holds
- The only remaining issue was the STATUS_CONFIG key accent in comissoes page — a rendering/styling bug not a math bug
- No changes needed to API or page.tsx

## Deviations from Plan

None - plan executed exactly as written. The investigation found no percentage denominator bugs beyond the STATUS_CONFIG key issue.

## Issues Encountered

None. TypeScript compiles clean after fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- comissoes/page.tsx now correctly maps `'Não Contatado'` status to its styling config
- All percentage denominators across pipeline and comissoes views are now correctly using `g.total_leads`

## Self-Check: PASSED

- `web/src/app/comissoes/page.tsx` exists and contains the fix
- Commit `098dbf5` exists in git log
- TypeScript compiles with zero errors

---
*Phase: quick-40*
*Completed: 2026-02-20*
