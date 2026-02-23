---
phase: quick-45
plan: 01
subsystem: ui, api
tags: [react, nextjs, roles, gestor_vendedor, lead-distribution]

requires:
  - phase: quick-25
    provides: gestor_vendedor role added to the system
  - phase: quick-20
    provides: /distribuir page with lead distribution UI

provides:
  - gestor_vendedor can access /distribuir page via sidebar nav
  - gestor_vendedor sees all leads (unassigned + distributed) on /distribuir
  - leads API all=true param bypasses self-filter for gestor_vendedor
  - amber CNPJ monitoring box hidden from gestor_vendedor (gestor-only)

affects: [distribuir, sidebar, leads-api, role-based-access]

tech-stack:
  added: []
  patterns:
    - "API escape hatch via ?all=true query param for role-scoped endpoints"
    - "Amber admin box wrapped with {userRole === 'gestor' && ()} for role-gated UI sections"

key-files:
  created: []
  modified:
    - web/src/components/Sidebar.tsx
    - web/src/app/distribuir/page.tsx
    - web/src/app/api/leads/route.ts

key-decisions:
  - "gestor_vendedor with all=true bypasses self-filter in leads API — same visibility as gestor, without changing normal /leads behavior"
  - "CNPJ monitoring amber box (assign to Paulo) is gestor-only UI — wrapped in userRole === 'gestor' conditional"

requirements-completed: [QUICK-45]

duration: 2min
completed: 2026-02-23
---

# Quick Task 45: Paulo Gabriel (gestor_vendedor) Distribution Access Summary

**gestor_vendedor role now has /distribuir in sidebar nav with full all-leads visibility via all=true API param, while /leads page retains self-only behavior unchanged**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T17:02:23Z
- **Completed:** 2026-02-23T17:03:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Paulo Gabriel (gestor_vendedor) now sees "Distribuir Leads" in sidebar navigation
- /distribuir page accepts gestor_vendedor role — no longer redirects to /
- On /distribuir, gestor_vendedor fetches with all=true so both tabs (Nao Atribuidos, Distribuidos) show all leads across all sellers
- Amber CNPJ monitoring section (assign directly to Paulo) remains gestor-only — hidden for gestor_vendedor
- /leads page behavior unchanged: gestor_vendedor without all=true still sees only own leads

## Task Commits

1. **Task 1: Add Distribuir Leads to gestor_vendedor nav and fix page role guard** - `e098447` (feat)
2. **Task 2: gestor_vendedor sees all leads on distribuir page via all=true param** - `7645188` (feat)

## Files Created/Modified

- `web/src/components/Sidebar.tsx` - Added /distribuir nav item to gestor_vendedor navItems array
- `web/src/app/distribuir/page.tsx` - Updated role guard checks (3 places) + fetch calls include all=true + amber box conditional
- `web/src/app/api/leads/route.ts` - Separated vendedor and gestor_vendedor branches; gestor_vendedor + all=true skips self-filter

## Decisions Made

- Used `?all=true` query param as an explicit opt-in for full lead visibility — keeps the API behavior backward-compatible; /leads page without this param retains self-only view.
- Amber CNPJ monitoring box is a gestor admin tool (assigns directly to Paulo Gabriel) — Paulo himself should not see it, so wrapped with `userRole === 'gestor'` conditional.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Paulo Gabriel can now distribute leads and reassign them across vendors
- /comissoes was already correct (isGestor guards the Editar button, which covers gestor_vendedor correctly since isGestor = role === 'gestor')
- No further changes needed for this capability

## Self-Check: PASSED

- web/src/components/Sidebar.tsx: FOUND
- web/src/app/distribuir/page.tsx: FOUND
- web/src/app/api/leads/route.ts: FOUND
- Commit e098447: FOUND
- Commit 7645188: FOUND

---
*Phase: quick-45*
*Completed: 2026-02-23*
