---
phase: quick-42
plan: "01"
subsystem: dashboard-crm
tags: [pipeline, status, ui, api]
dependency_graph:
  requires: []
  provides: ["AINDA NÃO visible in administrative pipeline funnel"]
  affects: ["web/src/app/api/dashboard-crm/route.ts", "web/src/app/page.tsx"]
tech_stack:
  added: []
  patterns: ["SQL CASE WHEN for status count", "STATUS_ORDER array expansion"]
key_files:
  created: []
  modified:
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/page.tsx
decisions:
  - "AINDA NÃO placed between Não Contatado and Retorno in STATUS_ORDER (rose color, distinct from orange Não Contatado)"
  - "Grid updated from md:grid-cols-5 to md:grid-cols-6 to accommodate 6th pipeline stage"
metrics:
  duration: "5 minutes"
  completed: "2026-02-20"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 42: AINDA NÃO no Pipeline Administrativo Summary

**One-liner:** Added AINDA NÃO as a distinct rose-colored 6th pipeline stage in the CRM dashboard funnel, backed by a new SQL COUNT in the dashboard-crm API.

## What Was Done

Leads with `status_contato = 'AINDA NÃO'` were previously invisible in the administrative pipeline — the API did not count them and `STATUS_ORDER` did not include the status. Gestor and vendedores had no visibility into how many leads were in this state.

Two changes were made:

1. **API (`dashboard-crm/route.ts`):** Added a new SQL CASE expression `COUNT(DISTINCT CASE WHEN status_contato = 'AINDA NÃO' THEN cnpj END)::int as status_ainda_nao` to the global stats query, and added the `'AINDA NÃO'` key to the `by_status` response object.

2. **UI (`page.tsx`):** Inserted `'AINDA NÃO'` into `STATUS_ORDER` between `'Não Contatado'` and `'Retorno'`. Updated the pipeline grid from `md:grid-cols-5` to `md:grid-cols-6`. The existing `STATUS_CONFIG` entry for `'AINDA NÃO'` (rose color scheme) rendered the new card automatically.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6586a87 | feat(quick-42): add AINDA NÃO count to dashboard-crm API |
| 2 | 8a1a538 | feat(quick-42): add AINDA NÃO to STATUS_ORDER pipeline funnel (6 cards) |

## Verification

- `npm run build` passed with no TypeScript or build errors
- Pipeline funnel now shows 6 cards: Não Contatado (orange), AINDA NÃO (rose), Retorno (amber), Proposta (blue), Aguardando Closer (purple), Fechado (green)
- `by_status['AINDA NÃO']` returned in API response with correct DB count
- Clicking AINDA NÃO card navigates to `/leads?status_contato=AINDA%20N%C3%83O` via existing onClick handler

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- web/src/app/api/dashboard-crm/route.ts modified: confirmed
- web/src/app/page.tsx modified: confirmed
- Commit 6586a87 exists: confirmed
- Commit 8a1a538 exists: confirmed
- Build passed: confirmed
