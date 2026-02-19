---
phase: quick-24
plan: 01
subsystem: api
tags: [postgres, nextjs, crm, leads, permissions]

requires:
  - phase: quick-25
    provides: gestor_vendedor role (Paulo Gabriel's role enabling the closer flow)
provides:
  - Fixed PATCH /api/leads/[cnpj] that correctly sets closer_id when status = Aguardando Closer
  - Removed silent failure when Paulo's active flag is false
  - GET /api/debug-closer endpoint for post-deploy verification
affects: [leads, pipeline, commission-flow, aguardando-closer-status]

tech-stack:
  added: []
  patterns:
    - "Privileged status transitions bypass vendorCondition restriction (gestor_vendedor on Aguardando Closer)"
    - "Paulo lookup without active filter + warn/error logging for observability"

key-files:
  created:
    - web/src/app/api/debug-closer/route.ts
  modified:
    - web/src/app/api/leads/[cnpj]/route.ts

key-decisions:
  - "gestor_vendedor bypasses vendedorCondition when setting Aguardando Closer (any lead can be handed off)"
  - "Paulo lookup removes AND active = true filter to prevent silent failures — always assigns closer_id if user exists"
  - "Debug endpoint restricted to gestor + gestor_vendedor roles only"

patterns-established:
  - "Role-conditional WHERE clause: check body.status_contato before applying row-level restriction"
  - "Paulo closer lookup: no active filter, log warn/error explicitly"

requirements-completed: [QUICK-24]

duration: 2min
completed: 2026-02-19
---

# Quick Task 24: Aguardando Closer closer_id Assignment Fix

**Fixed two-part bug: gestor_vendedor blocked from setting Aguardando Closer on others' leads + Paulo Gabriel's active=false causing silent closer_id failure**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-19T03:01:38Z
- **Completed:** 2026-02-19T03:02:42Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- Fixed `gestor_vendedor` restriction that blocked status update on leads not owned by Paulo (WHERE clause matched 0 rows, status never saved)
- Removed `AND active = true` from Paulo's user lookup (prevented closer_id from being set if account was inactive)
- Added explicit `console.warn` / `console.error` logging so future failures are immediately visible in Vercel logs
- Created `/api/debug-closer` endpoint so gestor can verify Paulo's user record and closer_id assignment post-deploy

## Task Commits

1. **Task 1: Fix Aguardando Closer closer_id assignment in PATCH route** - `a047282` (fix)
2. **Task 2: Verify Paulo's view + create /api/debug-closer diagnostic endpoint** - `b68eb7d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `web/src/app/api/leads/[cnpj]/route.ts` - Fixed vendedorCondition logic for gestor_vendedor + fixed Paulo lookup query
- `web/src/app/api/debug-closer/route.ts` - New GET endpoint returning Paulo's user record, closer_id count, Aguardando Closer sample

## Decisions Made

- `gestor_vendedor` bypasses `vendedorCondition` only when `body.status_contato === 'Aguardando Closer'`. Other status changes still restrict to their own leads — this preserves existing access control while enabling the SDR-to-Closer flow.
- Paulo's user lookup no longer filters by `active = true`. The closer should always be Paulo regardless of active flag. A warning is logged so the team knows if the account is inactive.
- Debug endpoint is gestor/gestor_vendedor only (not vendedor-accessible) to prevent data leaks.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both bugs were straightforward to identify and fix. TypeScript compilation passed with zero errors after both changes.

## Verification

- `npx tsc --noEmit` in `web/` — zero errors (confirmed twice)
- GET route at `/api/leads` already had correct `closer_id` filter: `(vp.vendedor_id = $N OR vp.closer_id = $N)` — no fix needed
- `/api/debug-closer` can be hit as gestor after deployment to confirm Paulo's UUID and verify Aguardando Closer leads have closer_id set

## Next Phase Readiness

- SDR-to-Closer flow is unblocked: any user with sell access can hand a lead to Paulo Gabriel by setting "Aguardando Closer"
- Paulo's /leads view will show those leads immediately (closer_id filter already correct in GET handler)
- Use `/api/debug-closer` post-deploy to confirm everything works end-to-end

---
*Phase: quick-24*
*Completed: 2026-02-19*
