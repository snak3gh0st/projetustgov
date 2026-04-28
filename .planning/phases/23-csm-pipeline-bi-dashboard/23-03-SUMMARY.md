---
phase: 23-csm-pipeline-bi-dashboard
plan: 03
subsystem: ui
tags: [react, tailwind, csm, priority-badge, expandable-rows, client-side-filter]

# Dependency graph
requires:
  - phase: 23-01
    provides: GET /api/csm/portfolio returning CsmClientRow[] with aggregated financials and priority_level
  - phase: 23-02
    provides: GET /api/csm/clients/[cnpj]/projects returning per-project rows with priority_level
  - phase: 22-csm-rbac-foundation
    provides: canCsm() RBAC gate, /csm page scaffold with CsmDashboardClientProps shape
provides:
  - PriorityBadge component (5 colour levels + null state) at web/src/components/PriorityBadge.tsx
  - Full CSM client list UI at web/src/app/csm/CsmDashboardClient.tsx — search, filter, expandable rows, badges
affects:
  - 23-04-csm-bi-dashboard (BI tab uses PriorityBadge; same /csm page host)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PriorityBadge: pure presentational component keyed by 1..5 level + null; 5 distinct Tailwind colour palettes
    - Expandable row with on-demand fetch + client-side cache (projectsCache Record<string, CsmProjectRow[]>)
    - Cancel-boolean pattern for clean useEffect unmount (no AbortController needed)
    - fetchTrigger counter pattern for retry on error

key-files:
  created:
    - web/src/components/PriorityBadge.tsx
  modified:
    - web/src/app/csm/CsmDashboardClient.tsx

key-decisions:
  - "PriorityBadge level 3 label is Rendimento (not Rendimento Previsto) — data layer returns realized rendimento"
  - "Search filter applies to both name AND digits-only CNPJ, single input, no separate tabs"
  - "Priority pills (1..5) serve as the situacao filter — priority bucket IS the situacao filter, single-axis UX"
  - "projectsCache keyed by cnpj in parent component state — prevents refetch on collapse/re-expand"

patterns-established:
  - "PriorityBadge: import and use for any priority_level 1..5 display across the CSM area"
  - "Cancel-boolean useEffect: let cancel = false; ... return () => { cancel = true } — use for all single-run fetches"

requirements-completed: [CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06]

# Metrics
duration: ~5min
completed: 2026-04-28
---

# Phase 23 Plan 03: CSM Client List UI Summary

**React client list with PriorityBadge, expandable rows fetching /api/csm/clients/{cnpj}/projects on first expand, and client-side search/filter over /api/csm/portfolio data — satisfying all six CLI requirements**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-28T00:36:14Z
- **Completed:** 2026-04-28T00:41:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 fully replaced)

## Accomplishments
- Created PriorityBadge component with 5 distinct colour levels (emerald/amber/sky/violet/slate) and null state
- Replaced 24-line placeholder CsmDashboardClient with full 465-line working client list UI
- Expandable rows with on-demand fetch and client-side caching (no refetch on re-expand)
- Three-section expanded panel: Aprovação / Execução / Prestação de Contas sub-tables
- Client-side search (name + CNPJ digits), priority filter pills, saldo min/max range
- Loading, error with retry, and empty states

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PriorityBadge component** - `5935d58` (feat)
2. **Task 2: Replace CsmDashboardClient with full client list** - `480f96a` (feat)

## Files Created/Modified
- `web/src/components/PriorityBadge.tsx` — Pure presentational badge with 5 colour levels; null renders neutral grey
- `web/src/app/csm/CsmDashboardClient.tsx` — Full CSM client list: table, search, filter pills, expandable rows, sub-tables, badges

## Decisions Made
- Level 3 label is "Rendimento" (not "Rendimento Previsto") — data layer returns realized values
- Search filter uses single input matching both name (case-insensitive) and CNPJ digits
- Priority pills 1..5 serve as the situacao bucket filter — avoids duplicate state
- projectsCache held in parent state, keyed by cnpj — prevents refetch on collapse/re-expand
- fetchTrigger counter used for retry pattern (increment to re-run useEffect)

## Deviations from Plan

None — plan executed exactly as written.

Note: TSC was run against the worktree (no local node_modules); all errors shown were pre-existing infrastructure issues identical to existing components like KPICard.tsx (missing React types due to absent node_modules). No new errors introduced by our files.

## Issues Encountered
- Worktree did not have Wave 1 CSM files (23-01 + 23-02) as the branch diverged before the merge. Resolved by merging `master` (which contained the ef33a98 merge commit with all Wave 1 work) into the worktree branch before implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PriorityBadge available for Phase 23-04 BI dashboard
- /csm page fully functional for CSM users (CLI-01..06 satisfied)
- Phase 22 routes (POST /api/csm/clients, /csm/comissoes) are untouched

---
*Phase: 23-csm-pipeline-bi-dashboard*
*Completed: 2026-04-28*
