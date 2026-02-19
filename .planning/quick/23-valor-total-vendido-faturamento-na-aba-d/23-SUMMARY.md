---
phase: quick-23
plan: "01"
subsystem: comissoes-ui
tags: [comissoes, faturamento, summary-cards, ui]
dependency_graph:
  requires: [/api/comissoes]
  provides: [Faturamento Total card in all role views]
  affects: [web/src/app/comissoes/page.tsx]
tech_stack:
  added: []
  patterns: [role-based summary cards, reuse existing API data]
key_files:
  created: []
  modified:
    - web/src/app/comissoes/page.tsx
decisions:
  - "Faturamento Total placed before Total Pago in gestor view to visually set context for commission costs"
  - "Grid updated from md:grid-cols-5 to md:grid-cols-3 xl:grid-cols-6 to accommodate 6 cards responsively"
  - "Reused existing data.summary.total_valor_venda — no API changes needed"
metrics:
  duration: "<1 minute"
  completed: "2026-02-19T02:05:25Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-23 Plan 01: Faturamento Total na Aba de Comissoes Summary

**One-liner:** Added "Faturamento Total" card showing `total_valor_venda` across all three role views (gestor, gestor_vendedor, vendedor) in the comissoes page.

## What Was Built

A single UI change to `/comissoes` page that surfaces the total sales value (faturamento) alongside commission figures, enabling gestors and vendedores to compare revenue generated vs. commissions paid.

### Changes by Role View

**Gestor view** (was 5 cards, now 6):
- Grid updated from `grid-cols-2 md:grid-cols-5` to `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`
- New card "Faturamento Total" inserted before "Total Pago"
- Shows `data.summary.total_valor_venda` formatted as currency
- Subtitle: "Valor vendas fechadas"

**gestor_vendedor view** (4 cards, renamed):
- "Valor Vendas" label renamed to "Faturamento Total"
- Added subtitle "Valor vendas fechadas" for consistency

**vendedor view** (4 cards, renamed):
- "Valor Vendas" label renamed to "Faturamento Total"
- Added subtitle "Valor vendas fechadas" for consistency

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add Faturamento Total card to comissoes summary cards | 43d4a16 | web/src/app/comissoes/page.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript `npx tsc --noEmit` passed with zero errors
- All three role views updated consistently
- Data source `data.summary.total_valor_venda` was already present in API response — no backend changes needed

## Self-Check: PASSED

- [x] `web/src/app/comissoes/page.tsx` modified (confirmed)
- [x] Commit 43d4a16 exists (confirmed)
- [x] "Faturamento Total" present in gestor view (6-card grid)
- [x] "Faturamento Total" present in gestor_vendedor view (renamed from "Valor Vendas")
- [x] "Faturamento Total" present in vendedor view (renamed from "Valor Vendas")
- [x] TypeScript: no errors
