---
phase: 21-tgov-ajustes-0904
plan: "01"
subsystem: tgov-rbac
tags: [rbac, tgov, execucao-roles, typescript, migration]
dependency_graph:
  requires: []
  provides: [coord_execucao, assistente_execucao, projetista_execucao roles in DB+TS]
  affects: [dal.ts, validations.ts, tgov.ts, page.tsx, execucao/route.ts, TGovDashboardClient.tsx]
tech_stack:
  added: []
  patterns: [RBAC role hierarchy, tab isolation by role group]
key_files:
  created:
    - migrations/add_roles_execucao.sql
  modified:
    - web/src/lib/dal.ts
    - web/src/lib/validations.ts
    - web/src/lib/tgov.ts
    - web/src/app/tgov/page.tsx
    - web/src/app/api/tgov/execucao/route.ts
    - web/src/app/tgov/TGovDashboardClient.tsx
decisions:
  - "APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES exported from tgov.ts for tab isolation"
  - "projetista_execucao isolated to tecnico_id filter in execucao API (mirrors projetista in aprovacao)"
  - "TGovDashboardClient tab filter updated to hide aprovacao tab from execucao-only roles"
metrics:
  duration: "~10 min"
  completed: "2026-04-10T14:17:20Z"
  tasks_completed: 2
  files_changed: 6
---

# Phase 21 Plan 01: Foundation RBAC for Execution Roles Summary

**One-liner:** Three new execution roles (coord_execucao, assistente_execucao, projetista_execucao) wired through all stack layers — DB constraint, TypeScript types, RBAC helpers, page guard, API isolation, and tab visibility.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB migration + TypeScript type layer (validations, dal, tgov) | e86e041 | migrations/add_roles_execucao.sql, dal.ts, validations.ts, tgov.ts |
| 2 | Page guard + execucao API RBAC enforcement | 85fa683 | page.tsx, execucao/route.ts, TGovDashboardClient.tsx |

## Decisions Made

1. **APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES exported from tgov.ts** — Centralizes role group constants so tab filtering logic in TGovDashboardClient and page.tsx share a single source of truth.

2. **projetista_execucao isolated to tecnico_id filter** — Mirrors the same isolation pattern applied to `projetista` in the aprovacao flow; projetista_execucao can only see execucao records assigned to them.

3. **TGovDashboardClient tab filter bidirectional** — Aprovacao-only roles already couldn't see the execucao tab; execucao-only roles now also cannot see the aprovacao tab (tab === 'aprovacao' filtered out for coord_execucao/assistente_execucao/projetista_execucao).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TGovDashboardClient userRole prop type incomplete**
- **Found during:** Task 2 — TypeScript compilation
- **Issue:** `TGovDashboardClientProps.userRole` was typed as a literal union of 10 roles, missing the 3 new execucao roles, causing TS2322 error when page.tsx passed `session.role` of the new types
- **Fix:** Extended the literal union in TGovDashboardClientProps to include `coord_execucao | assistente_execucao | projetista_execucao`
- **Files modified:** web/src/app/tgov/TGovDashboardClient.tsx
- **Commit:** 85fa683

**2. [Rule 2 - Missing functionality] Tab filter not bidirectional**
- **Found during:** Task 2 — reviewing tab filter logic
- **Issue:** The plan called for execucao-only roles to not see the aprovacao tab, but the existing filter only blocked aprovacao roles from the execucao tab; the reverse direction was missing
- **Fix:** Added second filter condition: `!((userRole === 'coord_execucao' || userRole === 'assistente_execucao' || userRole === 'projetista_execucao') && tab === 'aprovacao')`
- **Files modified:** web/src/app/tgov/TGovDashboardClient.tsx
- **Commit:** 85fa683

## Verification

- `npx tsc --noEmit` passes with zero errors
- `migrations/add_roles_execucao.sql` contains all 13 roles including coord_execucao
- `APROVACAO_ONLY_ROLES` and `EXECUCAO_ONLY_ROLES` exported from tgov.ts
- `canReadTgov('coord_execucao')` returns true (verified by reading function body)
- `web/src/app/tgov/page.tsx` guard lists 10 allowed roles
- execucao API blocks aprovacao roles with 403 after canReadTgov check
- execucao API applies tecnico_id filter for projetista_execucao

## Self-Check: PASSED

Files created/modified:
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/migrations/add_roles_execucao.sql
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/dal.ts
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/tgov.ts
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/tgov/page.tsx
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/tgov/execucao/route.ts
- FOUND: /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/tgov/TGovDashboardClient.tsx

Commits:
- FOUND: e86e041 (feat(21-01): DB migration + TypeScript RBAC layer)
- FOUND: 85fa683 (feat(21-01): page guard + execucao API RBAC)
