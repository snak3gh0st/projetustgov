---
phase: 21-tgov-ajustes-0904
plan: "03"
subsystem: tgov-dashboard
tags: [tgov, rbac, tabs, execucao, prestacao-contas]
dependency_graph:
  requires: [21-01]
  provides: [prestacao_contas-tab, three-tab-rbac-isolation]
  affects: [TGovDashboardClient, execucao-api, tgov-types]
tech_stack:
  added: []
  patterns: [mode-query-param, tab-rbac-filter, per-tab-state]
key_files:
  created: []
  modified:
    - web/src/lib/tgov.ts
    - web/src/app/api/tgov/execucao/route.ts
    - web/src/app/tgov/TGovDashboardClient.tsx
decisions:
  - TGovTab extended with 'prestacao_contas'; DEFAULT_TGOV_TAB stays 'aprovacao'
  - LOWER(pe.situacao) = 'em execução' for execucao mode (handles case variants)
  - ILIKE '%Prestação de Contas%' for prestacao_contas mode (catches all PC variants)
  - prestacao_contas maps to /api/tgov/execucao?mode=prestacao_contas (reuses execucao route)
  - EXECUCAO_ONLY_ROLES start on 'execucao' tab by default (not 'aprovacao')
metrics:
  duration: ~10 min
  completed_date: "2026-04-10"
  tasks: 2
  files_modified: 3
---

# Phase 21 Plan 03: Execução/Prestação de Contas Tab Split Summary

Introduced a third independent "Prestação de Contas" tab in the TGov dashboard, splitting it from the Execução tab with separate ILIKE filters, per-tab state, and RBAC-aware visibility using the APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES constants from Plan 21-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TGovTab type update + execucao API mode filter | 538e80f | web/src/lib/tgov.ts, web/src/app/api/tgov/execucao/route.ts |
| 2 | TGovDashboardClient — three tabs + RBAC filter + per-tab state | 0610da9 | web/src/app/tgov/TGovDashboardClient.tsx |

## What Was Built

**Task 1 — Type + API:**
- `TGovTab` in `tgov.ts` extended from `'aprovacao' | 'execucao'` to `'aprovacao' | 'execucao' | 'prestacao_contas'`
- `execucao/route.ts` now parses `mode` query param (defaults to `'execucao'`)
- Mode filter added first in `mainConditions`:
  - `execucao` mode: `LOWER(pe.situacao) = 'em execução'` (handles 'Em Execução' and 'Em execução')
  - `prestacao_contas` mode: `pe.situacao ILIKE '%Prestação de Contas%'` (catches all PC variants)

**Task 2 — UI:**
- Imports `APROVACAO_ONLY_ROLES` and `EXECUCAO_ONLY_ROLES` from `@/lib/tgov`
- `initialTab` computed dynamically: execucao roles start on `'execucao'`, others on `'aprovacao'`
- Tab filter expanded to 3 tabs with RBAC-aware `.filter()` using the constants
- `handleTabSwitch` and `handleResetFilters` treat `prestacao_contas` like `execucao` for filter defaults
- `fetchData` maps `prestacao_contas` tab to `/api/tgov/execucao?mode=prestacao_contas`
- Table render uses three-way conditional; both execucao and PC use `ExecucaoTable`
- BI summary shown for both `execucao` and `prestacao_contas` tabs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] handleResetFilters also referenced activeTab === 'execucao'**
- Found during: Task 2
- Issue: Only `handleTabSwitch` was specified in the plan but `handleResetFilters` had the same pattern
- Fix: Updated to `activeTab === 'execucao' || activeTab === 'prestacao_contas'`
- Files modified: web/src/app/tgov/TGovDashboardClient.tsx

**2. [Rule 2 - Missing] tabLabel and BI summary conditional not in plan**
- Found during: Task 2
- Issue: `tabLabel` defaulted to 'Execução' for the new tab; BI summary only checked `activeTab === 'execucao'`
- Fix: Updated tabLabel to three-way ternary; added `|| activeTab === 'prestacao_contas'` to BI summary check
- Files modified: web/src/app/tgov/TGovDashboardClient.tsx

## Verification

- `npx tsc --noEmit`: passed (both after Task 1 and Task 2)
- TGovTab type includes 'prestacao_contas': confirmed
- execucao/route.ts has mode param handling: confirmed
- TGovDashboardClient.tsx tab filter uses APROVACAO_ONLY_ROLES and EXECUCAO_ONLY_ROLES: confirmed
- Three tab buttons render for general roles: confirmed in code

## Self-Check: PASSED
