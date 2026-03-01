---
phase: quick-57
plan: 01
subsystem: leads-ui
tags: [export, csv, gestor, coordenador, pendentes]
dependency_graph:
  requires: []
  provides: [exportPendentesCSV]
  affects: [web/src/app/leads/page.tsx]
tech_stack:
  added: []
  patterns: [client-side CSV export with UTF-8 BOM, role-based UI visibility]
key_files:
  created: []
  modified:
    - web/src/app/leads/page.tsx
decisions:
  - UTF-8 BOM (\uFEFF) prepended to CSV so Excel on Windows opens accented characters (ã, ç, etc.) without import wizard
  - Filter operates on the already-loaded `leads` state (client-side, no extra API call needed)
  - Button visibility gated by sessionUser role check (gestor | coordenador) matching the existing pattern in the page
metrics:
  duration_minutes: 5
  completed_date: 2026-02-28
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 57: Export Não Contatados + Retorno CSV per Vendedor — Summary

**One-liner:** Gestor-only "Exportar Pendentes CSV" button that downloads a UTF-8 BOM CSV of Não Contatado and Retorno leads sorted by vendedor name for Excel review.

## What Was Built

Added a second export button ("Exportar Pendentes CSV") in the footer of the `/leads` page, visible only to users with `gestor` or `coordenador` roles. The button triggers a new `exportPendentesCSV` function that:

1. Filters the already-loaded `leads` state to rows where `status_contato` is `'Não Contatado'` or `'Retorno'`
2. Sorts results first by `vendedor_nome` (pt-BR locale), then by `nome` within the same vendedor
3. Produces an 11-column CSV: Vendedor, CNPJ, Nome, Status, Telefone, Email, Valor Emenda, UF, Municipio, Parlamentar, Observacoes
4. Prepends a UTF-8 BOM (`\uFEFF`) so Excel on Windows resolves accented characters correctly without a manual import wizard
5. Downloads as `pendentes-YYYY-MM-DD.csv`

The existing "Exportar CSV" button and `exportCSV` function were left completely unchanged.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 794991c | feat(quick-57): add exportPendentesCSV + gestor-only Exportar Pendentes CSV button |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `web/src/app/leads/page.tsx` modified — confirmed
- [x] `exportPendentesCSV` function present — confirmed (line 315)
- [x] Button renders only for `gestor`/`coordenador` — confirmed
- [x] TypeScript compiles with no errors — confirmed (`npx tsc --noEmit` clean)
- [x] Commit 794991c exists — confirmed

## Self-Check: PASSED
