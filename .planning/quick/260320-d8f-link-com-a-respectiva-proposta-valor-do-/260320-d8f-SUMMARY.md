---
phase: quick
plan: 260320-d8f
subsystem: execucao
tags: [execucao, ui, kpi, slide-over, priority-coloring]
dependency_graph:
  requires: []
  provides: [total_valor_global in grouped API, Valor Convenio column in execucao list, slide-over total valor summary]
  affects: [web/src/app/api/execucao/route.ts, web/src/app/execucao/ExecucaoClient.tsx, web/src/components/ExecucaoSlideOver.tsx]
tech_stack:
  added: []
  patterns: [SUM aggregate in grouped SQL query, IIFE pattern for scoped variable in JSX]
key_files:
  created: []
  modified:
    - web/src/app/api/execucao/route.ts
    - web/src/app/execucao/ExecucaoClient.tsx
    - web/src/components/ExecucaoSlideOver.tsx
decisions:
  - Added Valor Total Convenios as 5th KPI rather than replacing Total Fomentos — both values are independently useful
  - Used IIFE pattern in JSX for selectedRow to consolidate 3 separate find() calls cleanly without refactoring component structure
metrics:
  duration: ~2 min
  completed: 2026-03-20
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260320-d8f: Valor Convenio in Execucao List and Slide-Over Summary

**One-liner:** Added total valor_global (SUM) column to execucao list table and slide-over header, with inverted propostas priority coloring (red for high counts = lower priority).

## What Was Built

### Task 1: API + List Table + Propostas Colors (commit feb0329)

**API (route.ts):**
- Added `SUM(pe.valor_global) AS total_valor_global` to the GROUP BY SELECT query after `total_saldo`
- Added `total_valor_global: string` to `ExecucaoAggRow` interface

**ExecucaoClient.tsx:**
- Added `total_valor_global: string` to local `ExecucaoAggRow` interface
- Added `{ key: 'valor_convenio', label: 'Valor Convenio' }` column header after UF and before Fomentos
- Added `<td>` rendering `formatCompactCurrency(row.total_valor_global)` with `text-sm font-bold text-gray-900`
- Added `case 'valor_convenio'` sort branch using `Number(a/b.total_valor_global)`
- Added 5th KPI "Valor Total Convenios" with `formatCompactCurrency(SUM of total_valor_global)` and money icon
- Inverted Propostas badge color scheme: `bg-red-50 text-red-700` for 6+, `bg-orange-50 text-orange-700` for 3-5, `bg-gray-50 text-gray-600` for 1-2
- Updated Propostas title to: `{N} proposta(s) ja executadas — quanto mais, menor a prioridade`

### Task 2: Slide-Over Summary Header (commit 8a05d1d)

**ExecucaoSlideOver.tsx:**
- Added `totalValorGlobal: string | null` and `totalPropostas: number` to `ExecucaoSlideOverProps`
- Added summary section below badges div with `mt-4 pt-4 border-t border-gray-200` separator
- Left side: "Valor total dos convenios" label + `text-lg font-bold text-gray-900` value
- Right side: propostas badge using same warm-color scheme (red/orange/gray) when `totalPropostas > 0`

**ExecucaoClient.tsx:**
- Consolidated 3 separate `rows.find(r => r.cnpj === selectedCnpj)` calls into a single `selectedRow` lookup using IIFE pattern
- Passes `totalValorGlobal={selectedRow?.total_valor_global ?? null}` and `totalPropostas={selectedRow?.total_propostas_db ?? 0}` to ExecucaoSlideOver

## Verification

- `npx tsc --noEmit` passes with zero errors after both tasks
- All artifacts contain expected patterns (total_valor_global, totalValorGlobal, valor_convenio, bg-red-50 text-red-700)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- FOUND: web/src/app/api/execucao/route.ts
- FOUND: web/src/app/execucao/ExecucaoClient.tsx
- FOUND: web/src/components/ExecucaoSlideOver.tsx

Commits exist:
- FOUND: feb0329
- FOUND: 8a05d1d
