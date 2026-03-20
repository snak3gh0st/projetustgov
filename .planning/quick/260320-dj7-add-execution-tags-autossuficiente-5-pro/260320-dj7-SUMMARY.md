---
phase: quick
plan: 260320-dj7
subsystem: execucao
tags: [tags, badges, sql, ui, classification]
dependency_graph:
  requires: [projetos_execucao, propostas, convenios tables]
  provides: [CNPJ classification tags in execucao list and slide-over]
  affects: [ExecucaoClient.tsx, ExecucaoSlideOver.tsx, api/execucao/route.ts, api/execucao/[cnpj]/route.ts]
tech_stack:
  added: []
  patterns: [SQL boolean flags via BOOL_OR/EXISTS subqueries, conditional badge rendering]
key_files:
  created: []
  modified:
    - web/src/app/api/execucao/route.ts
    - web/src/app/api/execucao/[cnpj]/route.ts
    - web/src/app/execucao/ExecucaoClient.tsx
    - web/src/components/ExecucaoSlideOver.tsx
decisions:
  - All tag computation in SQL (no JS logic) — consistent with v4.0 decision to keep financial/classification calc close to data
  - tag_autossuficiente and tag_iniciante use separate subqueries not aliases — avoids GROUP BY alias reference issues in PostgreSQL
  - Tags column is non-sortable — tags can be multiple per row; sorting a multi-value column is undefined behavior
metrics:
  duration: ~8 min
  completed: 2026-03-20
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260320-dj7: Add Execution Tags Summary

**One-liner:** 5 SQL-computed classification tags (Autossuficiente, Iniciante, Desembolso, Lobby, Rendimento) added as colored badges in execucao table rows and slide-over.

## What Was Built

Added CNPJ classification tags to the execucao area, computed entirely in SQL and rendered as colored badge chips in the UI.

**Tag definitions implemented:**

| Tag | Rule | Color |
|-----|------|-------|
| Autossuficiente | CNPJ has >5 propostas in propostas table | Emerald |
| Iniciante | CNPJ has <5 propostas in propostas table | Violet |
| Desembolso | Any project has <100 dias em execucao | Sky |
| Lobby | Any project has >=100 dias AND valor_desembolsado = 0 | Rose |
| Rendimento | CNPJ has rendimento_aplicacao > 0 in convenios table | Teal |

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add tag computation SQL to both execucao APIs | c361b89 | route.ts, [cnpj]/route.ts |
| 2 | Render tag badges in table and slide-over | 7bb3bc7 | ExecucaoClient.tsx, ExecucaoSlideOver.tsx |

## Task Details

### Task 1: API SQL Changes

**`/api/execucao/route.ts` (grouped API):**
- Added 5 fields to `ExecucaoAggRow` interface: `tag_autossuficiente`, `tag_iniciante`, `tag_desembolso`, `tag_lobby`, `tag_rendimento`
- Added 5 computed SQL columns to the SELECT using `BOOL_OR` for per-group aggregation and `EXISTS` subquery for rendimento
- `tag_autossuficiente` and `tag_iniciante` use correlated subqueries against the `propostas` table
- `tag_desembolso` and `tag_lobby` use `BOOL_OR` over per-row day calculations
- `tag_rendimento` uses `EXISTS` joining `convenios` to `propostas` via `proposta_id = transfer_gov_id`

**`/api/execucao/[cnpj]/route.ts` (detail API):**
- Added 2 fields to `ExecucaoDetailRow` interface: `tag_desembolso`, `tag_lobby`
- Added 2 per-convenio computed columns using row-level day calculation (no BOOL_OR needed — one row per convenio)

### Task 2: UI Badge Rendering

**`ExecucaoClient.tsx`:**
- Added 5 tag fields to `ExecucaoAggRow` interface
- Refactored header column array to include `sortable: boolean` property
- Added non-sortable "Tags" column — no `onClick`, no `SortIcon`, no cursor-pointer
- Added `<td>` with `flex flex-wrap gap-1` container rendering up to 5 conditional badge spans
- Passed 5 `tag*` props to `ExecucaoSlideOver` invocation

**`ExecucaoSlideOver.tsx`:**
- Added 5 tag props to `ExecucaoSlideOverProps` interface
- Destructured new props in component function signature
- Changed header badge div to `flex-wrap` to accommodate 5+ badges
- Added 5 conditional CNPJ-level tag badges in slide-over header after existing Alerta/Contato badges
- Added 2 tag fields to `ExecucaoDetailRow` interface
- Added per-convenio `(conv.tag_desembolso || conv.tag_lobby)` conditional tag row before the alert badge section

## Deviations from Plan

None — plan executed exactly as written. The only minor addition was refactoring the header column array to include an explicit `sortable` boolean property (rather than special-casing the Tags column via index), which is cleaner TypeScript and doesn't change behavior.

## Verification

- `npx tsc --noEmit`: passes with zero errors (verified after each task and final)
- All 5 tags computed in SQL with no JavaScript classification logic
- Existing badges (Alerta amber, Contato blue, Propostas priority red/orange/gray) untouched
- Tags column is non-sortable — no sort icon, no click handler
- Per-convenio Desembolso/Lobby tags appear in detail cards inside slide-over

## Self-Check: PASSED

- web/src/app/api/execucao/route.ts — FOUND
- web/src/app/execucao/ExecucaoClient.tsx — FOUND
- web/src/components/ExecucaoSlideOver.tsx — FOUND
- Commit c361b89 — FOUND
- Commit 7bb3bc7 — FOUND
