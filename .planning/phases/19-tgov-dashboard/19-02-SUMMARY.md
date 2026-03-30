---
phase: 19-tgov-dashboard
plan: "02"
subsystem: tgov-dashboard
tags: [tgov, api, sql, gestor, analytics, pagination]
dependency_graph:
  requires: [tgov-shared-contracts]
  provides: [tgov-aprovacao-api, tgov-execucao-api]
  affects:
    - web/src/app/tgov/TGovDashboardClient.tsx
tech_stack:
  added: []
  patterns: [gestor-only-api-guard, sql-level-aggregation, sql-level-pagination, inline-filter-isolation, cnpj-normalisation-regexp]
key_files:
  created:
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/app/api/tgov/execucao/route.ts
  modified: []
decisions:
  - "Both routes return identical TGovTabResponse contract from @/lib/tgov"
  - "Main filters (ano, tipo, status, uf) build separate mainParams/mainConditions from inline tableParams/tableConditions"
  - "ano for execucao tab uses EXISTS (SELECT 1 FROM propostas WHERE transfer_gov_id = pe.id_proposta AND EXTRACT(YEAR...) = $n) — same proposal-year semantics as aprovacao"
  - "tipo=meus_proponentes uses REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = p.proponente_cnpj on aprovacao and = pe.cnpj on execucao"
  - "execucao numeroProposta: COALESCE(id_proposta, nr_convenio) — prefers proposal ID, falls back to convenio number"
  - "execucao Data column: COALESCE(propostas.data_publicacao, pe.data_assinatura, pe.data_inicio_vigencia)"
  - "Table sort: newest-first by Data expression, then id_proposta DESC NULLS LAST, nr_convenio DESC"
  - "Pre-existing build failures in export/route.ts, monitoramento/route.ts are out of scope (exist in main repo before this plan)"
metrics:
  duration: "3 min"
  completed: "2026-03-30"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 19 Plan 02: TGov Backend Routes Summary

**One-liner:** Gestor-only approval and execution API routes returning shared TGovTabResponse contract with SQL-level aggregation, SQL-level pagination, and isolated inline table filters.

## What Was Built

### Task 1 — `web/src/app/api/tgov/aprovacao/route.ts`

`GET /api/tgov/aprovacao` — approval analytics endpoint over `propostas`:

- **Auth guard:** HTTP 403 for any non-gestor session (uses `getApiSession()`)
- **Main filter params:** `ano` (EXTRACT(YEAR FROM data_publicacao)), `tipo` (EXISTS/NOT EXISTS against vendedor_projetos using REGEXP_REPLACE CNPJ normalisation), `status` (p.situacao exact match), `uf` (p.estado)
- **Aggregate queries:** Total count + situacao bucket counts — main filters only, inline filters never touch these
- **Table query:** Adds `proponente` (LIKE) and `numero_proposta` (transfer_gov_id LIKE) as table-only conditions; sorted by `data_publicacao DESC NULLS LAST, transfer_gov_id DESC`
- **Pagination:** 25-row pages via `LIMIT/OFFSET`; returns `page`, `pageSize`, `totalRows`, `totalPages`
- **Response:** Exact `TGovTabResponse` shape from `@/lib/tgov`

### Task 2 — `web/src/app/api/tgov/execucao/route.ts`

`GET /api/tgov/execucao` — execution analytics endpoint over `projetos_execucao`:

- **Same auth guard and response contract** as the approval route
- **`ano` semantics via JOIN:** `EXISTS (SELECT 1 FROM propostas p WHERE p.transfer_gov_id = pe.id_proposta AND EXTRACT(YEAR FROM p.data_publicacao) = $n)` — proposal publication year on both tabs for consistent shared-filter UX
- **`tipo` semantics:** REGEXP_REPLACE against `pe.cnpj` (digits-only VARCHAR(14)) matching `vendedor_projetos.cnpj` after stripping non-digits
- **`uf` / `status`:** `pe.uf` and `pe.situacao` direct columns
- **Data column:** `COALESCE(p.data_publicacao::text, pe.data_assinatura::text, pe.data_inicio_vigencia::text)` via LEFT JOIN on propostas
- **Table sort:** newest-first by that COALESCE expression, then `pe.id_proposta DESC NULLS LAST, pe.nr_convenio DESC`
- **numeroProposta:** `COALESCE(pe.id_proposta, pe.nr_convenio)` — prefers proposal ID (matches approval tab semantics)
- **Inline filters:** `proponente` searches `pe.nome_proponente` LIKE; `numero_proposta` matches `pe.id_proposta` LIKE when non-NULL, else `pe.nr_convenio` LIKE

## Verification Results

All 11 checks in `web/scripts/verify-tgov-dashboard.mjs` passed:

- Approval donut bucket sum == total (no filter + ano=2026 filter)
- Execution donut bucket sum == total (no filter + ano=2026 via id_proposta join: 3 rows)
- tipo=meus_proponentes EXISTS predicate confirmed on both tabs (38414 approval, 8749 execution)
- tipo split exhaustive: meus+outros == all (both tabs)
- Inline table search isolation confirmed: table filter is isolated from aggregate
- CNPJ normalisation: all vendedor_projetos CNPJs normalise to 14 digits

## Deviations from Plan

### Pre-existing build failures documented

**Found during:** Task 2 verification
**Issue:** `npm --prefix web run build` fails due to `@typescript-eslint/no-explicit-any` rule not defined in `.eslintrc.json` in `execucao/export/route.ts`, `leads/export-pendentes/route.ts`, and `monitoramento/route.ts`
**Cause:** Pre-existing issue in main repo — confirmed by checking `git stash` state (failures exist before plan 19-02 changes, and also in the main `master` branch build)
**Resolution:** Out of scope per scope boundary rules. TypeScript compilation (`tsc --noEmit`) confirms zero errors in new tgov files. Verification script (`verify-tgov-dashboard.mjs`) proves correct SQL semantics
**Deferred to:** `.planning/phases/19-tgov-dashboard/deferred-items.md`

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `web/src/app/api/tgov/aprovacao/route.ts` exists | FOUND |
| `web/src/app/api/tgov/execucao/route.ts` exists | FOUND |
| commit `bec7b31` (Task 1) | FOUND |
| commit `40f224f` (Task 2) | FOUND |
