---
phase: quick
plan: 260322
subsystem: execucao
tags: [execucao, tags, sql, postgres, regression]
dependency_graph:
  requires: [projetos_execucao grouped API, propostas counts, execucao tag badges]
  provides: [rendimento tag tied to eligible convenios, 5-proposal maturity boundary, dedicated regression verifier]
  affects: [web/src/app/api/execucao/route.ts, web/src/app/execucao/ExecucaoClient.tsx, web/scripts/verify-execucao-tags-rendimento.mjs]
tech_stack:
  added: []
  patterns: [BOOL_OR convenio eligibility for grouped tags, focused pg-backed regression scripts for business rules]
key_files:
  created:
    - web/scripts/verify-execucao-tags-rendimento.mjs
  modified:
    - web/src/app/api/execucao/route.ts
    - web/src/app/execucao/ExecucaoClient.tsx
decisions:
  - Compute tag_rendimento directly from projetos_execucao with BOOL_OR so the grouped API reflects per-convenio saldo coverage instead of the legacy convenios table
  - Treat exactly 5 propostas as Autossuficiente and not Iniciante to remove the maturity gap in /execucao
metrics:
  duration: ~4 min
  completed: 2026-03-25
  tasks_completed: 3
  files_modified: 3
---

# Quick Task 260322: Atualizar o vinculo da tag Rendimento Summary

**One-liner:** `/api/execucao` agora marca Autossuficiente a partir de 5 propostas, calcula Rendimento por convenio elegivel em `projetos_execucao` e tem um verificador dedicado para evitar regressao dessas regras.

## What Was Built

Corrigi a fronteira de maturidade do Lead Execucao e amarrei a tag `Rendimento` ao mesmo convenio que ainda tem saldo suficiente para cobrir rendimento acima de R$ 5 mil.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Criar verificacao automatizada de regressao para tag Rendimento e limiar de 5 propostas | aaa5294 | web/scripts/verify-execucao-tags-rendimento.mjs |
| 2 | Revisar a regra SQL da tag Rendimento e remover o estado indefinido dos CNPJs com 5 propostas | 37d3366 | web/src/app/api/execucao/route.ts |
| 3 | Alinhar os textos da UI com as novas regras de classificacao | fd21fa2 | web/src/app/execucao/ExecucaoClient.tsx |

## Task Details

### Task 1: Regression verifier

- Added a focused `pg` script for `/api/execucao` business rules
- Verifies the `5 propostas` maturity boundary
- Verifies `tag_rendimento` only when a convenio has `rendimento_aplicacao > 5000` and compatible `saldo_conta`
- Prints a compact summary and example failures before exiting with code `1`

### Task 2: SQL classification fix

- Changed `tag_autossuficiente` from `> 5` to `>= 5`
- Kept `tag_iniciante` as `< 5`
- Removed the obsolete `rendimento_cnpjs` CTE and legacy `convenios` dependency
- Added grouped `BOOL_OR` logic on `projetos_execucao` for `tag_rendimento`

### Task 3: UI copy alignment

- Updated the `Autossuficiente` tooltip to `5 ou mais propostas executadas`
- Updated the `Rendimento` tooltip to explain the saldo-compatible / not-consumed rule

## Decisions Made

- Keep the rendimento rule in the grouped SQL flow so the API and the regression script talk about the same convenio-level eligibility concept
- Make the tooltip text explicit about the financial threshold to avoid the UI documenting the old rule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added local env-file fallback for DB verification**
- **Found during:** Task 1
- **Issue:** The new verifier could not run because `DATABASE_URL` / `POSTGRES_URL` were not exported in the shell used for plan verification
- **Fix:** Added a fallback reader for `web/.env.local` and `web/.env.production` before creating the pg pool
- **Files modified:** web/scripts/verify-execucao-tags-rendimento.mjs
- **Verification:** `cd web && node scripts/verify-execucao-tags-rendimento.mjs`
- **Committed in:** aaa5294

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make the required regression command executable in the local verification environment. No scope creep.

## Verification

- `cd web && node scripts/verify-execucao-tags-rendimento.mjs` — passed
- `cd web && npx tsc --noEmit --pretty false` — passed
- 227 CNPJs with exatamente 5 propostas are now classified without maturity gaps by the verifier
- 218 CNPJs currently satisfy the tightened rendimento rule and no false positives remain in the verifier output

## Issues Encountered

- The shell session did not expose `DATABASE_URL` / `POSTGRES_URL`; fixed inline with env-file fallback in the dedicated verifier script

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/execucao` classification is aligned with the requested commercial reading
- The new verifier can be reused before future tag changes in the execution area

## Self-Check: PASSED

- .planning/quick/260322-atualizar-o-vinculo-da-tag-rendimento-pa/260322-SUMMARY.md — FOUND
- web/scripts/verify-execucao-tags-rendimento.mjs — FOUND
- web/src/app/api/execucao/route.ts — FOUND
- web/src/app/execucao/ExecucaoClient.tsx — FOUND
- Commit aaa5294 — FOUND
- Commit 37d3366 — FOUND
- Commit fd21fa2 — FOUND
