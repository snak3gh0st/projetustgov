---
phase: 21-tgov-ajustes-0904
plan: 02
subsystem: ui
tags: [nextjs, sidebar, tgov, kanban, rbac]

# Dependency graph
requires:
  - phase: 21-tgov-ajustes-0904
    provides: "New execution roles (coord_execucao, assistente_execucao, projetista_execucao) added to DB and RBAC"
provides:
  - "Sidebar renamed: TGov BI (→/tgov) + new TGov Pipeline (→/tgov/pipeline) in all TGov role branches"
  - "3 new execution role cases in Sidebar nav with emerald badge styling"
  - "/tgov/pipeline server page with auth guard for all 10 TGov roles"
  - "TGovPipelineClient.tsx — kanban cards from /api/tgov/aprovacao byStatus, clickable to /tgov?status="
affects: [tgov-dashboard, sidebar-nav, execution-roles]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sidebar nav uses chained ternary with role checks — new execution roles added before BASE_WITH_EXECUCAO fallback"
    - "Pipeline kanban page fetches /api/tgov/aprovacao with page_size=1 to get only byStatus aggregate"
    - "TGOV_STATUS_ORDER (Record<string,number>) used via Object.keys() to get ordered status list"

key-files:
  created:
    - web/src/app/tgov/pipeline/page.tsx
    - web/src/app/tgov/pipeline/TGovPipelineClient.tsx
  modified:
    - web/src/components/Sidebar.tsx

key-decisions:
  - "TGov BI label (href=/tgov) and TGov Pipeline label (href=/tgov/pipeline) coexist in all TGov role branches — clean visual separation of analytics vs funnel views"
  - "TGOV_STATUS_ORDER is Record<string,number> not array — use Object.keys() to iterate, then merge with API-returned statuses for completeness"
  - "void userRole pragma in TGovPipelineClient suppresses TS unused-var warning — prop kept for future role-specific UI"

patterns-established:
  - "Pipeline kanban pattern: fetch byStatus aggregate only (page_size=1), render clickable cards that push /tgov?status= filter"

requirements-completed: [NAV-BI-RENAME, NAV-PIPELINE-NEW]

# Metrics
duration: 10min
completed: 2026-04-10
---

# Phase 21 Plan 02: Sidebar restructuring + /tgov/pipeline kanban page Summary

**Sidebar renamed TGov BI (analytics) + new TGov Pipeline (kanban) for all 10 TGov roles, with /tgov/pipeline rendering situacao cards from Aprovação data**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-10T00:00:00Z
- **Completed:** 2026-04-10T00:10:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Renamed all "TGov Pipeline" sidebar labels (pointing to /tgov) to "TGov BI" across 8 role branches
- Added new "TGov Pipeline" item (→/tgov/pipeline) in all TGov role branches including 3 new execution roles
- Built /tgov/pipeline as protected kanban page — auth guard covers all 10 TGov roles
- Kanban cards fetch byStatus from /api/tgov/aprovacao, render count/pct/bar, click navigates to /tgov?status=

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Sidebar — rename TGov BI + add TGov Pipeline + new execution role cases** - `aa69941` (feat)
2. **Task 2: Create /tgov/pipeline route (server page + client kanban component)** - `352ab25` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `web/src/components/Sidebar.tsx` - Extended role type union, renamed labels, added execution role nav cases + badge styles
- `web/src/app/tgov/pipeline/page.tsx` - Server component with auth guard (10 allowed roles)
- `web/src/app/tgov/pipeline/TGovPipelineClient.tsx` - Kanban client with byStatus fetch and clickable situação cards

## Decisions Made
- `TGOV_STATUS_ORDER` is `Record<string, number>` — used `Object.keys()` to iterate. Also merged API-returned statuses to cover any DB values not in the known list.
- Kept `userRole` prop in `TGovPipelineClient` (suppressed with `void`) for future role-specific UI without breaking the server→client prop contract.

## Deviations from Plan

None - plan executed exactly as written. One minor adaptation: plan's sample code called `.filter()` on `TGOV_STATUS_ORDER` as if it were an array, but it is a `Record<string, number>`. Fixed inline using `Object.keys()` — no plan change needed, purely an implementation detail.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sidebar nav is now complete for all 10 TGov roles including the 3 execution roles from plan 21-01
- /tgov/pipeline is live and renders kanban from Aprovação data
- Ready for plan 21-03 (remaining adjustments in phase 21)

---
*Phase: 21-tgov-ajustes-0904*
*Completed: 2026-04-10*
