---
phase: quick
plan: 260323
subsystem: dashboard-crm
tags: [pipeline, execucao, dashboard, postgres, nextjs]
dependency_graph:
  requires: [projetos_execucao grouped data, dashboard-crm API, home dashboard pipeline cards]
  provides: [execucao pipeline verifier, separate execucao_pipeline payload, dual funnel home dashboard]
  affects: [web/scripts/verify-dashboard-execucao-pipeline.mjs, web/src/app/api/dashboard-crm/route.ts, web/src/app/page.tsx]
tech_stack:
  added: []
  patterns: [distinct CNPJ aggregation for execution funnel, prioritized CRM stage per CNPJ, shared dashboard funnel section renderer]
key_files:
  created:
    - web/scripts/verify-dashboard-execucao-pipeline.mjs
  modified:
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/page.tsx
key-decisions:
  - Keep approval and execution funnels in the existing dashboard route so the home page compares both universes in one fetch
  - Reuse the same card styling for both funnels while giving execution its own status order and /execucao navigation target
patterns-established:
  - "Execution pipeline metrics must come from COUNT(DISTINCT cnpj) over projetos_execucao"
  - "Execution CRM stage uses the same normalized priority ladder already used by /api/execucao"
requirements-completed: [PIPE-EXEC-01]
duration: 15 min
completed: 2026-03-25
---

# Quick Task 260323: Pipeline de Execução no Dashboard Summary

**Home dashboard now compares approval and execution funnels side by side using a dedicated execucao_pipeline payload counted from projetos_execucao CNPJs.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-25T20:09:03Z
- **Completed:** 2026-03-25T20:18:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added a focused verifier that fails when the execution funnel loses, duplicates, or mis-buckets CNPJs.
- Extended `/api/dashboard-crm` with a dedicated `execucao_pipeline` block derived only from `projetos_execucao` distinct CNPJs.
- Split the home pipeline view into `Pipeline Aprovação` and `Pipeline Execução` with separate totals and click behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Criar verificador automatizado das contagens do pipeline de execucao** - `c4f134c` (test)
2. **Task 2: Expor um bloco execucao_pipeline separado no dashboard CRM** - `beace66` (feat)
3. **Task 3: Separar visualmente Pipeline Aprovação e Pipeline Execução na home** - `0377b2c` (feat)

## Files Created/Modified
- `web/scripts/verify-dashboard-execucao-pipeline.mjs` - Checks distinct CNPJ universe, bucket coverage, and bucket sum consistency for the execution funnel.
- `web/src/app/api/dashboard-crm/route.ts` - Returns `execucao_pipeline` with zero-filled status buckets and prioritized CRM stage aggregation.
- `web/src/app/page.tsx` - Renders separate approval and execution funnel sections on the same dashboard tab.

## Decisions Made
- Kept the new execution funnel inside `/api/dashboard-crm` instead of creating another route so both funnel blocks stay synchronized in one home fetch.
- Reused the existing funnel card look on the home page and only changed labels, status order, totals, and target links to minimize UI drift.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dashboard now exposes and renders separate approval vs execution funnel data.
- Verifier script can be reused in future quick tasks touching execution pipeline semantics.

## Verification

- `cd web && node scripts/verify-dashboard-execucao-pipeline.mjs` — passed
- `cd web && npx tsc --noEmit --pretty false` — passed
- Approval funnel still links to `/leads?status_contato=...`
- Execution funnel cards link to `/execucao`

## Self-Check: PASSED

- .planning/quick/260323-criar-pipeline-de-execucao-podendo-ficar/260323-SUMMARY.md — FOUND
- web/scripts/verify-dashboard-execucao-pipeline.mjs — FOUND
- web/src/app/api/dashboard-crm/route.ts — FOUND
- web/src/app/page.tsx — FOUND
- Commit c4f134c — FOUND
- Commit beace66 — FOUND
- Commit 0377b2c — FOUND
