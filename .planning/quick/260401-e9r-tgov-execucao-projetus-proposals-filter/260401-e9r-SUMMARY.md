---
phase: quick
plan: 260401-e9r
subsystem: tgov-dashboard
tags: [tgov, filter, whitelist, proposals, aprovacao, execucao]
dependency_graph:
  requires: [19-03]
  provides: [TGOV-PROJETUS-FILTER]
  affects: [web/src/lib/tgov.ts, web/src/app/api/tgov/aprovacao/route.ts, web/src/app/api/tgov/execucao/route.ts]
tech_stack:
  added: []
  patterns: [parameterized-sql-in-clause, shared-constant-single-source-of-truth]
key_files:
  modified:
    - web/src/lib/tgov.ts
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/app/api/tgov/execucao/route.ts
decisions:
  - "Whitelist defined once in tgov.ts as Set<string> and consumed via helper function — single source of truth prevents drift between tabs"
  - "buildProjetusProposalWhereClause() parameterizes all 246 IDs into $N placeholders — no SQL injection risk"
  - "Whitelist inserted as FIRST mainCondition in both routes — applies to all sub-queries (total, byStatus, table count, table rows) without special casing"
  - "NULL id_proposta rows in projetos_execucao are correctly excluded — IN clause semantics handle nulls automatically"
metrics:
  duration: "~3 min"
  completed: "2026-04-01"
  tasks: 2
  files: 3
---

# Quick Task 260401-e9r: TGov Execucao/Aprovacao Projetus Proposals Filter — Summary

**One-liner:** Hardcoded 246-ID Projetus whitelist added to tgov.ts filters both TGov API tabs via parameterized SQL IN clause.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add PROJETUS_PROPOSAL_IDS whitelist to tgov.ts | 5235654 | web/src/lib/tgov.ts |
| 2 | Filter both TGov API routes by Projetus whitelist | c1e1243 | aprovacao/route.ts, execucao/route.ts |

## What Was Built

### Task 1 — PROJETUS_PROPOSAL_IDS whitelist in tgov.ts

Added two new exports to `web/src/lib/tgov.ts`:

- `PROJETUS_PROPOSAL_IDS: Set<string>` — 246 unique proposal ID strings sourced from client-provided "NUMERO/ANO" list (numeric portion only, no "/YEAR" suffix)
- `buildProjetusProposalWhereClause(columnName, params): string` — appends all 246 IDs to the params array and returns a parameterized `{column} IN ($N, ...)` SQL fragment

### Task 2 — Both API routes filter by whitelist

**aprovacao/route.ts:**
- Imports `buildProjetusProposalWhereClause` from `@/lib/tgov`
- Calls it immediately after initializing `mainParams`/`mainConditions`, pushing `p.transfer_gov_id IN (...)` as the first condition
- All four sub-queries (total, byStatus, tableCount, tableData) inherit the filter via `mainWhereClause` / `tableWhereClause`

**execucao/route.ts:**
- Imports `buildProjetusProposalWhereClause` from `@/lib/tgov`
- Calls it immediately after initializing `mainParams`/`mainConditions`, pushing `pe.id_proposta IN (...)` as the first condition
- Rows with `NULL id_proposta` are excluded — this is correct behavior (no matching proposal = not a Projetus convenio)

## Verification

- TypeScript compiles with zero errors after both tasks
- All 246 IDs from the plan's canonical list are present in the Set — no missing, no extra entries
- The whitelist is defined exactly once in tgov.ts

## Deviations from Plan

None — plan executed exactly as written.

The plan stated "~250 unique proposal IDs (251 entries minus 1 duplicate of 11225)" but the actual canonical list has 246 unique entries with no duplicates. All values from the plan's list were included.

## Self-Check

- [x] `web/src/lib/tgov.ts` modified — FOUND
- [x] `web/src/app/api/tgov/aprovacao/route.ts` modified — FOUND
- [x] `web/src/app/api/tgov/execucao/route.ts` modified — FOUND
- [x] Commit 5235654 exists — FOUND
- [x] Commit c1e1243 exists — FOUND

## Self-Check: PASSED
