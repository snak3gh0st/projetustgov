---
phase: quick-48
plan: 01
subsystem: auth-roles
tags: [hotfix, roles, coordenador, gestor, commission]
dependency_graph:
  requires: []
  provides: [coordenador-role, tito-gestor-lead-assignment, zero-commission-for-gestor]
  affects: [auth, dal, all-api-routes, all-ui-pages, sidebar]
tech_stack:
  added: []
  patterns: [role-based-access-control, commission-zeroing-for-gestor-role]
key_files:
  created: []
  modified:
    - web/src/lib/types.ts
    - web/src/types/next-auth.d.ts
    - web/src/lib/auth.ts
    - web/src/lib/dal.ts
    - web/src/lib/validations.ts
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/vendedores/route.ts
    - web/src/app/api/leads/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/app/api/comissoes/route.ts
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/api/usuarios/[id]/role/route.ts
    - web/src/app/api/bi/route.ts
    - web/src/app/api/debug-sync/route.ts
    - web/src/app/api/dashboard/route.ts
    - web/src/app/api/debug-closer/route.ts
    - web/src/app/page.tsx
    - web/src/app/leads/page.tsx
    - web/src/app/distribuir/page.tsx
    - web/src/app/comissoes/page.tsx
    - web/src/app/cadastro-vendedor/page.tsx
    - web/src/app/bi/page.tsx
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/components/Sidebar.tsx
    - web/src/components/SaleModal.tsx
decisions:
  - "Keep gestor_vendedor in DB constraint during migration (backward compat) — migration step converts existing rows"
  - "Tito (gestor) zero commission enforced at API level in comissoes route, not at DB level"
  - "gestors now included in vendedores API result so Tito appears in /distribuir assignment dropdown"
metrics:
  duration: 6 minutes
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 25
---

# Phase quick-48 Plan 01: Hotfix Roles — coordenador + Tito gestor zero commission Summary

**One-liner:** Renamed `gestor_vendedor` role to `coordenador` system-wide (Paulo) and enabled gestor-role users (Tito) to receive lead assignments with forced R$0 commission.

## What Was Built

### Task 1: Rename gestor_vendedor → coordenador across all types, auth, DAL, and API routes

- `UserRole` type updated in `types.ts`, `next-auth.d.ts`, `auth.ts`, `dal.ts`, `validations.ts`
- `setup-crm` DB constraint: now allows both `gestor_vendedor` and `coordenador` for migration safety, plus a new step: `UPDATE users SET role = 'coordenador' WHERE role = 'gestor_vendedor'`
- Paulo's seed role changed from `gestor_vendedor` to `coordenador`
- All API routes (12 files): every `session.role === 'gestor_vendedor'` check updated to `'coordenador'`
- `vendedores` API now returns `WHERE role IN ('vendedor', 'coordenador', 'gestor')` — enabling Tito to appear in /distribuir dropdown
- `comissoes` API: added `u.role as vendedor_role` to main query; `mappedLeads` now zeroes `comissao_valor`, `comissao_bonus`, and `closer_comissao_valor` when `vendedor_role === 'gestor'`

### Task 2: UI labels and Tito can receive lead assignments

- `Sidebar.tsx`: `coordenador` role shows indigo "Coordenador" badge (was "Gestor Vendedor")
- `cadastro-vendedor/page.tsx`: `ROLE_LABELS`, `ROLE_BADGE_CLASSES`, `ROLE_SELECT_BG`, and both dropdowns updated to `coordenador` / "Coordenador"
- `leads/page.tsx`, `distribuir/page.tsx`, `comissoes/page.tsx`, `bi/page.tsx`, `SaleModal.tsx`, `lead/[cnpj]/page.tsx`: all client-side role checks updated to `coordenador`
- Tito appears in /distribuir vendedor dropdown automatically (vendedores API now includes gestors)
- Leads assigned to Tito show R$0 commission in /comissoes (enforced in API layer)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed additional files not in plan that had gestor_vendedor references**
- **Found during:** Task 1 verification (TypeScript errors)
- **Issue:** `dashboard/route.ts`, `debug-closer/route.ts`, `page.tsx`, `Sidebar.tsx`, `SaleModal.tsx`, `validations.ts`, `lead/[cnpj]/page.tsx` all had `gestor_vendedor` strings that would cause TypeScript errors or runtime mismatches after the role was renamed
- **Fix:** Updated all files to use `coordenador`
- **Files modified:** 7 additional files beyond the plan's scope
- **Commit:** fa80a6d

## Verification

- `grep -r "gestor_vendedor" web/src/` returns only intentional SQL migration references in `setup-crm/route.ts`
- `npx tsc --noEmit` — 0 errors
- Paulo's workflow (leads, comissoes, closer assignments, /distribuir) functionally identical to before
- Tito (gestor) will appear in /distribuir vendedor dropdown after next page load
- After `/api/setup-crm` runs in production: Paulo's DB row migrated to `coordenador`, Tito can receive assignments

## Self-Check: PASSED

- types.ts: FOUND
- Sidebar.tsx: FOUND
- vendedores/route.ts: FOUND
- commit fa80a6d: FOUND
