---
phase: quick-15
plan: 01
subsystem: api, ui
tags: [sql, count-distinct, cnpj, dashboard-crm, bi, vendedores, comissoes, distribuir]

requires:
  - phase: quick-31
    provides: "cascade grouping with multiple rows per CNPJ"
provides:
  - "All lead count metrics use COUNT(DISTINCT cnpj) instead of COUNT(*)"
  - "Frontend distribuir page shows unique CNPJ counts in tabs, cards, and bottom bar"
affects: [dashboard-crm, bi, vendedores, comissoes, distribuir]

tech-stack:
  added: []
  patterns: ["COUNT(DISTINCT cnpj) for lead metrics, SUM for value aggregations"]

key-files:
  created: []
  modified:
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/api/bi/route.ts
    - web/src/app/api/vendedores/route.ts
    - web/src/app/api/comissoes/route.ts
    - web/src/app/distribuir/page.tsx

key-decisions:
  - "Spreadsheet-only DB for MVP: no propostas/convenios from REPO in DB"

patterns-established:
  - "COUNT(DISTINCT cnpj) for lead counts: every metric showing 'total leads' must count unique CNPJs, not rows"
  - "Value SUMs unchanged: valor_emenda, valor_venda, comissao_valor always sum all rows (each emenda row has its own value)"
  - "Frontend Set-based dedup: when displaying lead counts from raw row arrays, use new Set(arr.map(l => l.cnpj)).size"

requirements-completed: [FIX-LEAD-COUNT]

duration: 3min
completed: 2026-02-17
---

# Quick Task 15: Fix Total Leads Count Summary

**All lead count metrics across 4 API endpoints + distribuir page now use COUNT(DISTINCT cnpj), fixing overcounting caused by multiple emenda rows per CNPJ**

## Performance

- **Duration:** 2m 44s
- **Started:** 2026-02-17T17:09:26Z
- **Completed:** 2026-02-17T17:12:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed global stats (total_leads, total_assigned, total_unassigned) and all status breakdown counts in dashboard-crm API
- Fixed per-vendedor lead counts in dashboard-crm, vendedores, and comissoes APIs
- Fixed BI conversion rate (fechado_count/assigned_count), pipeline funnel, and leads-by-UF counts
- Fixed distribuir page tab badges, vendedor summary cards, and bottom bar to show unique CNPJ counts
- Preserved all value SUM aggregations (emenda, venda, comissao) unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix SQL queries in all API endpoints to use COUNT(DISTINCT cnpj)** - `5eb8564` (fix)
2. **Task 2: Fix frontend lead counts in distribuir page** - `2caddee` (fix)

## Files Created/Modified
- `web/src/app/api/dashboard-crm/route.ts` - Global + per-vendedor lead counts use DISTINCT cnpj
- `web/src/app/api/bi/route.ts` - Conversion rate, pipeline funnel, leads by UF use DISTINCT cnpj
- `web/src/app/api/vendedores/route.ts` - lead_count per vendedor uses DISTINCT cnpj
- `web/src/app/api/comissoes/route.ts` - Summary + per-vendedor lead counts use DISTINCT cnpj
- `web/src/app/distribuir/page.tsx` - Tab badges, vendedor cards, bottom bar show unique CNPJ counts

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved uniqueFilteredCount memo after sortedLeads declaration**
- **Found during:** Task 2 (Frontend lead counts)
- **Issue:** Plan placed uniqueFilteredCount memo before sortedLeads was defined, which would cause a ReferenceError since const is not hoisted
- **Fix:** Moved uniqueFilteredCount declaration to after sortedLeads useMemo
- **Files modified:** web/src/app/distribuir/page.tsx
- **Verification:** TypeScript compilation passes with no errors
- **Committed in:** 2caddee (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All lead count metrics are now accurate across the entire application
- Any new API endpoints or pages that display lead counts should follow the established pattern: COUNT(DISTINCT cnpj) in SQL, Set-based dedup in frontend

## Self-Check: PASSED

All 5 modified files verified present. Both task commits (5eb8564, 2caddee) verified in git log. SUMMARY.md created at expected path.

---
*Quick Task: 15*
*Completed: 2026-02-17*
