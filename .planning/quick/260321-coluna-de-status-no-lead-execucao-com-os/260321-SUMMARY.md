---
phase: quick
plan: 260321
subsystem: execucao
tags: [crm-status, sql, ui, badges, vendedor_projetos]
dependency_graph:
  requires: [projetos_execucao grouped API, vendedor_projetos CRM statuses, leads status color taxonomy]
  provides: [crm_status on /api/execucao rows, Status badge column on /execucao]
  affects: [web/src/app/api/execucao/route.ts, web/src/app/execucao/ExecucaoClient.tsx]
tech_stack:
  added: []
  patterns: [correlated SQL status lookup per CNPJ, shared CRM badge colors across leads and execucao]
key_files:
  created: []
  modified:
    - web/src/app/api/execucao/route.ts
    - web/src/app/execucao/ExecucaoClient.tsx
decisions:
  - Aggregate crm_status in SQL using vendedor_projetos priority order so /execucao matches CRM semantics per CNPJ
  - Reuse the exact Lead Aprovação STATUS_COLORS map in ExecucaoClient to keep status badges visually consistent across screens
metrics:
  duration: ~2 min
  completed: 2026-03-25
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260321: Status Column in Lead Execucao Summary

**One-liner:** `/api/execucao` now returns prioritized CRM status per CNPJ and `/execucao` renders it as the same colored badge used on Lead Aprovação.

## What Was Built

Added CRM status visibility to the execution list so gestor/coordenador can see the commercial stage of each CNPJ without leaving `/execucao`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Expor status CRM agregado no GET /api/execucao | b39f656 | web/src/app/api/execucao/route.ts |
| 2 | Renderizar coluna Status no Lead Execucao com as mesmas cores do Lead Aprovacao | 1ad08b2 | web/src/app/execucao/ExecucaoClient.tsx |

## Task Details

### Task 1: API aggregation

- Added `crm_status` to `ExecucaoAggRow`
- Added a correlated lookup against `vendedor_projetos` per grouped CNPJ
- Normalized `NULL` and `Nao Contatado` to `Não Contatado`
- Applied CRM priority order with `updated_at DESC NULLS LAST` as tie-breaker

### Task 2: UI status badge

- Added `crm_status` to the client row type
- Copied the exact `STATUS_COLORS` mapping from `web/src/app/leads/page.tsx`
- Inserted a non-sortable `Status` column between `Contato` and `Tags`
- Rendered read-only badges with fallback to `Não Contatado`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `cd web && npx tsc --noEmit --pretty false` — passed
- `/api/execucao` rows now include `crm_status`
- `/execucao` table now includes a colored `Status` badge column
- Missing CRM status falls back to `Não Contatado`

## Self-Check: PASSED

- .planning/quick/260321-coluna-de-status-no-lead-execucao-com-os/260321-SUMMARY.md — FOUND
- web/src/app/api/execucao/route.ts — FOUND
- web/src/app/execucao/ExecucaoClient.tsx — FOUND
- Commit b39f656 — FOUND
- Commit 1ad08b2 — FOUND
