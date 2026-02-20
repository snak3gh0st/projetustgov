---
phase: quick-31
plan: "01"
subsystem: lead-assignment, leads-ui
tags: [round-robin, roleta, cascade, valor-emenda, gestor-vendedor]
dependency_graph:
  requires: []
  provides: ["Paulo excluded from round-robin", "cascade totalValor display"]
  affects: [repo-sync.ts, leads/page.tsx]
tech_stack:
  added: []
  patterns: ["role filter narrowing", "reduce sum for multi-emenda display"]
key_files:
  modified:
    - web/src/lib/repo-sync.ts
    - web/src/app/leads/page.tsx
decisions:
  - "Use existing_clients table JOIN (not column on vendedor_projetos) to identify new vs existing leads in redistribution script"
  - "Use (lead as any).totalValor to avoid modifying TypeScript interface"
metrics:
  duration: "~20 min"
  completed: "2026-02-20T15:45:23Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 31: Fix Paulo Roleta Exclusion + Cascade Sum Value — Summary

**One-liner:** Exclude gestor_vendedor Paulo from round-robin via role filter, redistribute his 442 leads evenly, and show sum of all emendas on cascade main row instead of highest single value.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Exclude gestor_vendedor from round-robin + redistribute Paulo's leads | 78b952a | web/src/lib/repo-sync.ts |
| 2 | Fix cascade main row to show SUM of all emendas | c90a7f8 | web/src/app/leads/page.tsx |

## What Was Done

### Task 1: Round-robin role filter + lead redistribution

Changed `repo-sync.ts` line 491 from:
```sql
WHERE role IN ('vendedor', 'gestor_vendedor') AND active = true
```
to:
```sql
WHERE role = 'vendedor' AND active = true
```

Ran a redistribution script to reassign Paulo's 442 today-leads via round-robin to the 4 active vendedores:
- Elisson: 111 leads
- Gabriel: 111 leads
- Vitoria: 110 leads
- Wellington: 110 leads
- Total redistributed: 442 (Paulo now has 0 new leads today)

### Task 2: Cascade main row total valor

In `displayLeads` useMemo, added `totalValor` as sum of all emenda values for a CNPJ group. Updated:
1. `reduce` computation of `totalValor` in the map
2. Sort `case 'valor'` to use `totalValor` when available
3. Main row render to display `totalValor` instead of `valor_emenda` of the first row

Sub-rows unchanged — they still display individual `sub.valor_emenda`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] is_existing_client column does not exist on vendedor_projetos**
- **Found during:** Task 1 redistribution script
- **Issue:** Plan specified `WHERE is_existing_client = false` on `vendedor_projetos`, but `is_existing_client` is a computed field from a JOIN with `existing_clients` table, not a column.
- **Fix:** Changed redistribution query to use `LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj WHERE ec.cnpj IS NULL` to identify new leads.
- **Files modified:** Script only (inline Bash, not committed)
- **Commit:** N/A (script was inline)

## Verification

1. `grep "WHERE role" web/src/lib/repo-sync.ts` returns `role = 'vendedor'` only — confirmed
2. Redistribution output: Elisson 111, Gabriel 111, Vitoria 110, Wellington 110 — ~110 each as expected
3. `npx tsc --noEmit` — no errors
4. `grep -n "totalValor" web/src/app/leads/page.tsx` — 4 occurrences (reduce, spread, sort, render)

## Self-Check: PASSED
