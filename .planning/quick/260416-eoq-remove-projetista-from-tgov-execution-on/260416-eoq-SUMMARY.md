---
phase: quick-260416-eoq
plan: 01
subsystem: tgov-dashboard
tags: [access-control, rbac, tgov, execucao]
dependency_graph:
  requires: []
  provides: [projetista_execucao-blocked-from-tgov-execucao]
  affects: [tgov-page, tgov-execucao-api, tgov-pipeline-page, sidebar]
tech_stack:
  added: []
  patterns: [role-guard, canReadTgov-helper, EXECUCAO_ONLY_ROLES-constant]
key_files:
  modified:
    - web/src/lib/tgov.ts
    - web/src/lib/dal.ts
    - web/src/app/tgov/page.tsx
    - web/src/app/api/tgov/execucao/route.ts
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/app/tgov/pipeline/page.tsx
    - web/src/components/Sidebar.tsx
decisions:
  - "projetista_execucao removed from EXECUCAO_ONLY_ROLES — only coord_execucao and assistente_execucao retain execution access"
  - "projetista_execucao Sidebar branch now shows only TGov Pipeline (still accessible); /tgov BI and Dashboard items removed"
  - "pipeline/page.tsx no longer allows projetista_execucao — consistent with page guard for /tgov"
metrics:
  duration: ~5 min
  completed_date: "2026-04-16"
  tasks: 2
  files: 7
---

# Quick Task 260416-eoq: Remove projetista_execucao from TGov Execution Access

**One-liner:** Removed projetista_execucao from all TGov execution access points — EXECUCAO_ONLY_ROLES, canReadTgov, canCommentTgov, page guard, API route, client type union, pipeline page, and Sidebar nav.

## Objective

Business decision: projetista_execucao role loses access to /tgov execucao tab, /tgov pipeline, and /api/tgov/execucao. Only coord_execucao and assistente_execucao retain execution area access.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove projetista_execucao from execution access guards and constants | 54e75ce | tgov.ts, dal.ts, page.tsx, execucao/route.ts |
| 2 | Update TGovDashboardClient and pipeline page type unions, update Sidebar nav | d45d8ad | TGovDashboardClient.tsx, pipeline/page.tsx, Sidebar.tsx |

## Changes Made

### Task 1: Core access guards

1. **web/src/lib/tgov.ts** — `EXECUCAO_ONLY_ROLES` now `['coord_execucao', 'assistente_execucao']` (removed `projetista_execucao`)
2. **web/src/lib/dal.ts** — `canReadTgov`: removed `|| role === 'projetista_execucao'`
3. **web/src/lib/dal.ts** — `canCommentTgov`: removed `|| role === 'projetista_execucao'`
4. **web/src/app/tgov/page.tsx** — role guard no longer allows `projetista_execucao` (redirects to /sem-permissao)
5. **web/src/app/api/tgov/execucao/route.ts** — removed the `projetista_execucao` tecnico_id isolation block (dead code after canReadTgov 403 gate)

### Task 2: Client types and nav

1. **web/src/app/tgov/TGovDashboardClient.tsx** — `userRole` prop union type no longer includes `'projetista_execucao'`
2. **web/src/app/tgov/pipeline/page.tsx** — `ALLOWED_ROLES` array excludes `'projetista_execucao'`
3. **web/src/components/Sidebar.tsx** — `projetista_execucao` nav branch now shows only `TGov Pipeline` (not /tgov BI or Dashboard)

## Verification Results

- `npx tsc --noEmit` — zero errors after both tasks
- `EXECUCAO_ONLY_ROLES` contains only `coord_execucao` and `assistente_execucao`
- No occurrences of `projetista_execucao` in page.tsx or execucao route.ts
- `canReadTgov` and `canCommentTgov` exclude `projetista_execucao`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- 54e75ce: feat(quick-260416-eoq): remove projetista_execucao from execution access guards — FOUND
- d45d8ad: feat(quick-260416-eoq): update client types and sidebar nav for projetista_execucao removal — FOUND
- All 7 files modified as specified in plan frontmatter
