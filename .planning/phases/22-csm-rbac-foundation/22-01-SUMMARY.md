---
phase: 22-csm-rbac-foundation
plan: 01
subsystem: auth
tags: [rbac, middleware, next-auth, jwt, dal, csm, sidebar]

# Dependency graph
requires:
  - phase: 20-tgov-ajustes-0704
    provides: "canReadTgov/canWriteTgov/canCommentTgov helpers in dal.ts that canCsm() follows"
  - phase: 21-tgov-ajustes-0904
    provides: "projetista_execucao removal + EXECUCAO_ONLY_ROLES in tgov.ts"
provides:
  - "canCsm(role) helper in dal.ts — single source of truth for CSM area access (csm|gestor|admin)"
  - "/csm page scaffold with server-component canCsm() guard"
  - "CsmDashboardClient.tsx placeholder (Phase 23 data deferred)"
  - "CSM_PATHS + isCsmPath middleware exemption for /csm and /api/csm"
  - "CSM CRM-page redirect changed from /tgov to /csm (avoids redirect loop)"
  - "Sidebar 'Clientes CSM' nav entry as first item for csm role"
  - "auth.ts JWT/session callbacks typed via Role from @/lib/dal (stale union eliminated)"
  - "bruno@projetus.org user updated to role='csm' in production DB"
affects:
  - "22-02 (CSM clients API uses canCsm and /api/csm namespace)"
  - "22-03 (CSM commissions page uses canCsm and /csm/comissoes)"
  - "middleware.ts (any future role block must preserve isCsmPath before isCrmPage check)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canCsm() follows canReadTgov()/canWriteTgov() JSDoc+signature pattern in dal.ts"
    - "CSM_PATHS allow-list + isCsmPath early-return inside role block (before isCrmApi)"
    - "Server component page.tsx (no 'use client') + CsmDashboardClient.tsx ('use client') split"
    - "Role type from @/lib/dal imported in auth.ts to replace stale inline union"

key-files:
  created:
    - "web/src/app/csm/page.tsx"
    - "web/src/app/csm/CsmDashboardClient.tsx"
  modified:
    - "web/src/lib/dal.ts"
    - "web/src/lib/auth.ts"
    - "web/src/middleware.ts"
    - "web/src/components/Sidebar.tsx"

key-decisions:
  - "canCsm() placed after canCommentTgov() in dal.ts — logical grouping with TGov helpers"
  - "isCsmPath computed at top-level scope (not inside csm block) so it's available before role checks"
  - "CSM CRM-page redirect changed from /tgov to /csm — prevents disorientation and aligns with CSM-01"
  - "bruno@projetus.org existed with role='vendedor'; updated to 'csm' via UPDATE (no INSERT needed)"
  - "auth.ts stale union replaced with Role from @/lib/dal — single source of truth for role type"

patterns-established:
  - "Pattern: CSM area gate uses canCsm() from dal.ts in both page.tsx and API route handlers"
  - "Pattern: CSM_PATHS exempted before isCrmApi check in middleware csm role block"
  - "Pattern: /csm page uses verifySession() + canCsm() guard (mirrors /tgov/page.tsx)"

requirements-completed:
  - CSM-01

# Metrics
duration: 25min
completed: 2026-04-27
---

# Phase 22 Plan 01: CSM RBAC Foundation Summary

**canCsm() auth helper, /csm middleware exemption, /csm page scaffold with server guard, Sidebar nav entry, and bruno@projetus.org promoted to csm role**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-27T15:05:00Z
- **Completed:** 2026-04-27T15:34:32Z
- **Tasks:** 5 (1 human-action gate + 4 auto)
- **Files modified:** 6

## Accomplishments

- `canCsm(role)` exported from `dal.ts` — single source of truth for /csm area access (csm, gestor, admin)
- Middleware extended: `CSM_PATHS` allow-list + `isCsmPath` early-return inside csm block; CRM-page redirect target changed from `/tgov` to `/csm`
- `/csm` page created with `verifySession()` + `canCsm()` guard; `CsmDashboardClient.tsx` placeholder renders "Clientes CSM" header
- Sidebar prepends `{ href: '/csm', label: 'Clientes CSM', icon: 'leads' }` as first nav item for csm role
- `auth.ts` JWT/session callbacks now use `Role` from `@/lib/dal` — stale 5-element union eliminated

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify or create bruno@projetus.org user** — DB UPDATE (no git commit — pure DB operation)
2. **Task 2: Add canCsm() helper to dal.ts and fix auth.ts JWT role type** — `427f112` (feat)
3. **Task 3: Patch middleware to allow /csm and /api/csm** — `f0ef9c0` (feat)
4. **Task 4: Create /csm page scaffold and CsmDashboardClient placeholder** — `52784ba` (feat)
5. **Task 5: Prepend /csm nav entry to Sidebar csm role block** — `9edca58` (feat)

## Files Created/Modified

- `web/src/lib/dal.ts` — added `canCsm()` helper after `canCommentTgov()`
- `web/src/lib/auth.ts` — imported `Role` from `@/lib/dal`; replaced two stale type casts
- `web/src/middleware.ts` — added `CSM_PATHS` / `isCsmPath`; updated csm role block
- `web/src/app/csm/page.tsx` — new server component with `canCsm()` guard (10 lines)
- `web/src/app/csm/CsmDashboardClient.tsx` — new client placeholder (22 lines)
- `web/src/components/Sidebar.tsx` — prepended `/csm` nav item to csm role array

## Decisions Made

- `canCsm()` placed immediately after `canCommentTgov()` in `dal.ts` — follows the existing JSDoc+signature pattern of TGov helpers
- `isCsmPath` computed at top-level middleware scope (before all role blocks) so it is in scope inside the csm role block without hoisting issues
- CSM CRM-page redirect changed from `/tgov` to `/csm` — the old target was a stopgap; `/csm` is now the CSM home
- `bruno@projetus.org` existed in DB with `role='vendedor'` — a simple `UPDATE SET role='csm'` was sufficient; no INSERT or bcrypt needed
- `auth.ts` `Role` import uses `import type` — correct since it is a TS-only type alias, not a runtime value

## Deviations from Plan

None — plan executed exactly as written.

The only adaptive step was discovering that `bruno@projetus.org` existed with `role='vendedor'` rather than being absent. The plan already specified the UPDATE path for this case; no deviation from spec was required.

## Issues Encountered

- Task 1 verify script initially failed because `npx tsx` from outside the `web/` directory could not resolve `./src/lib/db`. Solved by creating a temporary script inside `web/` using the `pg` Pool directly with `DATABASE_URL`. Scripts were deleted after verification.

## User Setup Required

None — the DB role update was executed automatically as part of Task 1. No environment variables or dashboard steps required.

## Next Phase Readiness

- Plans 22-02 and 22-03 can now execute in parallel (Wave 2)
- 22-02: `POST /api/csm/clients` and `PATCH /api/csm/clients/[cnpj]/contacts` — middleware already allows `/api/csm`
- 22-03: `/csm/comissoes` page + `GET /api/csm/comissoes` proxy — sidebar `/csm/comissoes` entry added in 22-03
- `tsc --noEmit` passes cleanly — no blocking TS issues

---
*Phase: 22-csm-rbac-foundation*
*Completed: 2026-04-27*
