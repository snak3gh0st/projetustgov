---
phase: quick
plan: "39"
subsystem: comissoes
tags: [bug-fix, commission, gestor_vendedor, split-lead]
dependency_graph:
  requires: []
  provides: [correct-bonus-display-for-closer]
  affects: [comissoes-page, comissoes-api]
tech_stack:
  added: []
  patterns: [conditional-mapping, derived-aggregate]
key_files:
  created: []
  modified:
    - web/src/app/api/comissoes/route.ts
decisions:
  - Zero out comissao_bonus at mapping layer for split leads where user is closer-not-vendedor; recompute total_bonus from mapped array instead of SQL aggregate
metrics:
  duration: "5m"
  completed: "2026-02-20"
  tasks: 1
  files_modified: 1
---

# Phase quick Plan 39: Fix Closer Bonus Double-Count in Comissoes Page Summary

**One-liner:** Zero out SDR's `comissao_bonus` for closer (Paulo) on split leads by correcting the mapping layer and recomputing `total_bonus` from the corrected array.

## What Was Done

In the SDR->Closer split scenario, a lead has:
- `vendedor_id = SDR`, `comissao_bonus = R$50` (SDR's reward)
- `closer_id = Paulo`, `closer_comissao_valor = valor_venda * 0.03` (Paulo's reward)

The `comissoes` API WHERE clause for `gestor_vendedor` (Paulo) is:
```sql
(vp.vendedor_id = $1 OR vp.closer_id = $1)
```

This correctly pulls both Paulo's own leads AND leads where he is closer. However, the SQL `SUM(COALESCE(vp.comissao_bonus, 0))` aggregated both sets — including the SDR's R$50 bonus on closer-led leads — inflating Paulo's `total_bonus`.

## Fix Applied

In `web/src/app/api/comissoes/route.ts`:

1. **Leads mapping** — Added `isCloserNotVendedor` flag. For `gestor_vendedor` role, when `lead.closer_id === session.userId && lead.vendedor_id !== session.userId`, the returned `comissao_bonus` is set to `0` instead of the raw DB value.

2. **Summary total_bonus** — Changed from using the SQL `SUM` aggregate (`summary.total_bonus`) to recomputing from the corrected `mappedLeads` array via `Array.reduce`. This ensures the summary reflects the same corrected values as individual lead rows.

3. **No UI change needed** — `comissoes/page.tsx` already reads `lead.comissao_bonus` from the API response, so Fix 1 propagates automatically to the UI.

## Deviations from Plan

None — plan executed exactly as the task description's "Final Decision" approach specified.

## Self-Check: PASSED

- Modified file exists: `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/comissoes/route.ts` ✓
- Commit exists: `6ca928f` ✓
- TypeScript build: no errors ✓
