---
phase: quick-52
plan: 01
subsystem: leads-ui
tags: [commission, multi-emenda, grouping, display-logic]
dependency_graph:
  requires: []
  provides: [correct-multi-emenda-commission-display]
  affects: [web/src/app/leads/page.tsx]
tech_stack:
  added: []
  patterns: [allFechado-flag, totalComissao-aggregation, conditional-sub-row-display]
key_files:
  created: []
  modified:
    - web/src/app/leads/page.tsx
decisions:
  - "allFechado uses Array.every so a partially-closed group never shows green commission total"
  - "totalComissao sums comissao_valor+comissao_bonus per Fechado sub-emenda (bonus included for accuracy)"
  - "comissao_locked indicator and label remain tied to first emenda's lock status (acceptable for MVP)"
metrics:
  duration: "4 minutes"
  completed: "2026-02-23T22:49:12Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 52: Fix Multi-Emenda Commission — Sum Comissao Summary

**One-liner:** Fixed grouped CNPJ rows so commission totals sum all Fechado emendas and Fechado state only triggers when every emenda is closed.

## What Was Done

Two bugs existed in the multi-emenda lead grouping logic in the leads table:

**Bug 1 — Wrong commission total:** The main row showed `lead.comissao_valor` (first emenda only) when `isFechado`, instead of the sum across all Fechado sub-emendas.

**Bug 2 — Wrong Fechado trigger:** `isFechado` was computed as `lead.status_contato === 'Fechado'`, which checked only the first emenda's status. Closing one emenda out of N incorrectly flipped the entire grouped row to show green commission.

## Changes Made

### `web/src/app/leads/page.tsx`

**Edit 1 — displayLeads useMemo:**
Added `totalComissao` (sum of `comissao_valor + comissao_bonus` for all Fechado sub-emendas) and `allFechado` (true only when every sub-emenda has `status_contato === 'Fechado'`) to the returned grouped row object.

**Edit 2 — isFechado computation:**
Changed from `lead.status_contato === 'Fechado'` to `(lead as any).allFechado ?? lead.status_contato === 'Fechado'`. Multi-emenda groups use `allFechado`; single-emenda rows fall back to their own status.

**Edit 3 — Main row value cell:**
Changed condition from `isFechado && lead.comissao_valor` to `isFechado && (lead as any).totalComissao`. Changed displayed value from `formatCompactCurrency(lead.comissao_valor)` to `formatCompactCurrency((lead as any).totalComissao)`.

**Edit 4 — Sub-row value cell:**
Added conditional: if `sub.status_contato === 'Fechado'` and `comissao_valor > 0`, display green commission (`comissao_valor + comissao_bonus`). Otherwise show neon `valor_emenda` as before.

## Verification

- `npx tsc --noEmit` passes with zero errors
- Multi-emenda CNPJ with only some emendas Fechado: main row shows neon `totalValor` (not commission)
- Multi-emenda CNPJ with ALL emendas Fechado: main row shows green summed commission
- Sub-rows for Fechado emendas display green commission; non-Fechado sub-rows show neon valor_emenda

## Deviations from Plan

None — plan executed exactly as written. All 4 edits implemented as specified.

## Self-Check: PASSED

- File modified: `web/src/app/leads/page.tsx` — verified
- Commit `1b52267` — verified
- TypeScript compiles clean — verified
