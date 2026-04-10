---
phase: quick
plan: 260410-kmx
subsystem: tgov-dashboard
tags: [tgov, execucao, prestacao-contas, ui, table]
key-files:
  modified:
    - web/src/app/tgov/TGovDashboardClient.tsx
decisions:
  - "ExecucaoTable receives mode prop with 'execucao' | 'prestacao_contas' union — default 'execucao' preserves all existing behavior without any conditional at call site"
  - "IIFE pattern (() => { ... })() used inside JSX to compute limiteDate/isAtraso per row without polluting outer scope or extracting a separate component"
  - "Date comparison uses ISO string truncation to T00:00:00 on both sides to ensure midnight-aligned day comparison (no timezone drift)"
metrics:
  duration: ~5 min
  completed: 2026-04-10
  tasks: 1
  files: 1
---

# Quick Task 260410-kmx: Ultima Coluna da Prestacao de Contas TGov Summary

**One-liner:** Mode-aware last column in ExecucaoTable — Prestacao de Contas tab shows Prazo PC (Atraso/Em tempo) while Execucao tab keeps Desembolso Sim/Nao unchanged.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add mode prop to ExecucaoTable and render Atraso/Em tempo for prestacao_contas | 9bd8b04 | TGovDashboardClient.tsx |

## What Was Built

Added a `mode` prop (`'execucao' | 'prestacao_contas'`, default `'execucao'`) to the `ExecucaoTable` component.

**Prestacao de Contas tab** (`mode="prestacao_contas"`):
- Last column header: "Prazo PC" (sortable via `SortableTh` on `diasPrestContas`)
- Per row: computes `limiteDate` from `diaLimitePrestContas + 'T00:00:00'`, compares against today's midnight
  - Past date → red badge "Atraso"
  - Future/today → green badge "Em tempo"
  - Null → gray dash "—"

**Execucao tab** (`mode="execucao"`):
- Last column header: "Desembolso" (non-sortable, unchanged)
- Per row: Sim/Nao based on `valorDesembolsado > 0` (unchanged)

Call sites updated: prestacao_contas block passes `mode="prestacao_contas"`, execucao block passes `mode="execucao"` explicitly.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/tgov/TGovDashboardClient.tsx` — confirmed
- Commit 9bd8b04 — confirmed
- TypeScript: no errors (`npx tsc --noEmit` returned clean)
