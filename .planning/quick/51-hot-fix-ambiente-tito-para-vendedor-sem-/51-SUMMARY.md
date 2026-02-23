---
phase: quick-51
plan: 01
subsystem: crm-roles
tags: [gestor, hybrid-view, pipeline, leads, dashboard]
dependency_graph:
  requires: [quick-48]
  provides: [gestor-personal-pipeline, gestor-leads-toggle]
  affects: [leads-api, dashboard-crm-api, leads-page, dashboard-page]
tech_stack:
  added: []
  patterns: [role-based-api-filtering, conditional-ui-state-toggle]
key_files:
  created: []
  modified:
    - web/src/app/api/leads/route.ts
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/leads/page.tsx
    - web/src/app/page.tsx
decisions:
  - gestor treated like coordenador for personal lead filtering (own leads by default, all=true for admin view)
  - showAllLeads toggle state in leads page controls all=true param passed to API
  - isVendedor flag in dashboard extended to include gestor for personal pipeline display
metrics:
  duration: 101s
  completed: 2026-02-23
  tasks_completed: 2
  files_modified: 4
---

# Quick-51: Hot-fix Ambiente Tito para Vendedor sem Comissao — Summary

**One-liner:** Gestor (Tito) now defaults to own assigned leads as "Meu Pipeline" with a "Ver Todos os Leads" toggle for admin view, while retaining full admin controls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | API changes — gestor role behaves like coordenador for own leads | 9457fd2 | `api/leads/route.ts`, `api/dashboard-crm/route.ts` |
| 2 | UI — leads page shows own leads for gestor; dashboard shows Meu Pipeline | d18eead | `leads/page.tsx`, `page.tsx` |

## What Was Built

### Task 1: API Changes

**`web/src/app/api/leads/route.ts`**
- Added `session.role === 'gestor'` to the `coordenador` branch so gestor defaults to own leads unless `all=true` is passed
- Updated comment to reference coordenador/gestor together

**`web/src/app/api/dashboard-crm/route.ts`**
- Added `isGestor = session.role === 'gestor'` variable
- Extended `isFiltered` to include `isGestor`
- Updated `vendedorFilter` to apply `WHERE (vendedor_id = $1 OR closer_id = $1)` for gestor (same as coordenador)
- All 7 queries now auto-filter to gestor's own leads via `isFiltered`

### Task 2: UI Changes

**`web/src/app/page.tsx`**
- Changed `isVendedor = role === 'vendedor' || role === 'coordenador'` to include `role === 'gestor'`
- Gestor now sees "Meu Pipeline — Campanha Emendas 2026" title and personal pipeline stats cards

**`web/src/app/leads/page.tsx`**
- Added `showAllLeads` boolean state (default `false`)
- `fetchLeads` now passes `all=true` to API when gestor has `showAllLeads=true` or a specific `vendedorFilter` set
- Added `showAllLeads` to `useCallback` dependency array
- Added "Ver Todos os Leads" / "Meu Pipeline" toggle button in filter bar for gestor only
- Updated subtitle text for gestor based on toggle state

## Verification

- TypeScript: `npx tsc --noEmit` returns 0 errors after both tasks
- Grep confirms `isGestor`, `isFiltered`, `gestor.*all` logic in API files
- Grep confirms `isVendedor` includes gestor in page.tsx and `showAllLeads` logic in leads/page.tsx

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- `web/src/app/api/leads/route.ts` — FOUND
- `web/src/app/api/dashboard-crm/route.ts` — FOUND
- `web/src/app/leads/page.tsx` — FOUND
- `web/src/app/page.tsx` — FOUND

Commits verified:
- `9457fd2` — FOUND (Task 1)
- `d18eead` — FOUND (Task 2)
