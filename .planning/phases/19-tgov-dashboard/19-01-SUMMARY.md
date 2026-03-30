---
phase: 19-tgov-dashboard
plan: "01"
subsystem: tgov-dashboard
tags: [tgov, contracts, verification, typescript, sql]
dependency_graph:
  requires: []
  provides: [tgov-shared-contracts, tgov-verification-harness]
  affects: [web/src/app/api/tgov/aprovacao/route.ts, web/src/app/api/tgov/execucao/route.ts, web/src/app/tgov/TGovDashboardClient.tsx]
tech_stack:
  added: []
  patterns: [shared-type-contracts, sql-verification-script, env-file-db-loading]
key_files:
  created:
    - web/src/lib/tgov.ts
    - web/scripts/verify-tgov-dashboard.mjs
    - web/.eslintrc.json
  modified: []
decisions:
  - "tipo=meus_proponentes maps to vendedor_projetos EXISTS predicate with REGEXP_REPLACE CNPJ normalisation"
  - "ano filter uses propostas.data_publicacao for both tabs (execucao via id_proposta->transfer_gov_id join)"
  - "inline table filters (proponente, numeroProposta) are isolated — do NOT affect donut/KPI aggregates"
  - "TGOV_PAGE_SIZE=25, DEFAULT_TGOV_TAB='aprovacao' locked as constants"
metrics:
  duration: "4 min"
  completed: "2026-03-30"
  tasks_completed: 2
  files_created: 3
---

# Phase 19 Plan 01: TGov Shared Contracts and Verification Harness Summary

**One-liner:** Shared TGov TypeScript contracts plus an 11-check SQL verification harness that proves filter semantics before any API or UI code is written.

## What Was Built

### Task 1 — `web/src/lib/tgov.ts`

Single source of truth for all TGov dashboard types, constants, and helpers. Exports consumed by both backend route handlers and the client component:

- `TGovTab`, `TGovTipoFilter` — tab and filter discriminant types
- `TGovMainFilters`, `TGovTableFilters` — request shape contracts
- `TGovStatusBucket`, `TGovTableRow`, `TGovTabResponse` — API response contracts
- `TGOV_PAGE_SIZE = 25`, `DEFAULT_TGOV_TAB = 'aprovacao'` — locked constants
- `DEFAULT_MAIN_FILTERS`, `DEFAULT_TABLE_FILTERS` — default values
- `TGOV_STATUS_ORDER`, `tgovStatusSortKey()` — shared status ordering used by both SQL and UI
- `TGOV_TIPO_LABELS` — human-readable labels for the filter dropdowns
- Inline documentation of exact SQL semantics for `tipo` and `ano` on both tabs

### Task 2 — `web/scripts/verify-tgov-dashboard.mjs`

Database-backed verification harness with 11 deterministic SQL assertions:

1. **Approval no-filter:** bucket sum == total propostas
2. **Approval ano-filtered:** bucket sum == total for `EXTRACT(YEAR FROM data_publicacao) = 2026` (480 proposals)
3. **Execution no-filter:** bucket sum == total projetos_execucao (8,749 rows)
4. **Execution ano-via-join:** bucket sum == total with `id_proposta -> propostas.transfer_gov_id -> data_publicacao` join (3 rows for 2026)
5. **tipo=meus on approval:** EXISTS predicate sum == total
6. **tipo=meus on execution:** EXISTS predicate sum == total
7. **tipo split exhaustive on approval:** meus + outros == all propostas
8. **tipo split exhaustive on execution:** meus + outros == all projetos_execucao
9. **Inline search isolation on approval:** table filter returns fewer rows than unfiltered aggregate
10. **Inline search isolation on execution:** same pattern for projetos_execucao
11. **CNPJ normalisation:** all vendedor_projetos CNPJs normalise to exactly 14 digits

All 11 checks passed against production database.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `tipo=meus_proponentes` = vendedor_projetos EXISTS predicate | Only established meaning of "ownership" in the current codebase — no ambiguity between "assigned" and "in CRM" since they map to the same table |
| `ano` uses `propostas.data_publicacao` on both tabs | Consistent "proposal publication year" meaning prevents the Pitfall 3 cross-tab drift described in RESEARCH.md |
| Inline table filters isolated from aggregates | CONTEXT.md states "whether inline table filters affect only the table or also recalculate the KPI and donut" was Claude's discretion — chose isolation so donut/KPI stay stable as analytics lens |
| `TGOV_PAGE_SIZE = 25` | CONTEXT.md requirement: "table density should target 25 compact rows per page" |
| Default tab = 'aprovacao' | CONTEXT.md requirement: "default landing state: Aprovacao tab with Ano atual selected" |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
npm --prefix web run lint  -> OK (no new errors; 3 pre-existing warnings in other files)
node web/scripts/verify-tgov-dashboard.mjs  -> OK: All TGov dashboard semantic checks passed.
```

## Self-Check

- [x] `web/src/lib/tgov.ts` created and exports all required contracts
- [x] `web/scripts/verify-tgov-dashboard.mjs` created and passes 11 checks
- [x] Task 1 committed: `904c493`
- [x] Task 2 committed: `64c9508`
