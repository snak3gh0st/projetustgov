---
phase: quick-56
plan: 01
subsystem: commission
tags: [commission, closer, split, bugfix]
dependency-graph:
  requires: []
  provides: [closer-split-tipo-vendedor-fix]
  affects: [commission-calculation, leads-patch-api]
tech-stack:
  added: []
  patterns: [closer-id-db-check-before-recalc]
key-files:
  created:
    - web/scripts/fix-closer-commission-data.mjs
  modified:
    - web/src/app/api/leads/[cnpj]/route.ts
decisions:
  - Query DB for closer_id before tipo_vendedor recalc (server-side only field)
  - Split commission is fixed at SDR 1%+R$50 / Closer 3% (same as Fechado branch)
metrics:
  duration: 3m
  completed: 2026-02-24
---

# Quick Task 56: Fix Closer/SDR Commission Split on tipo_vendedor Change

**One-liner:** tipo_vendedor recalc on Fechado leads now checks closer_id and re-applies SDR 1%+R$50 / Closer 3% split instead of standard rates.

## What Changed

### Task 1: Fix tipo_vendedor recalc to respect closer_id split commission
**Commit:** 619c5a9

The PATCH route's `tipo_vendedor` recalculation branch (line 222) previously ignored `closer_id` entirely. When a gestor changed tipo_vendedor on a Fechado lead that had a closer, the code applied standard commission rates (SDR 1% / Closer 4% / Exclusivo 3%) instead of the split commission.

**Fix:** Added a DB query for `closer_id` and `status_contato` before the existing CTE recalc. When `closer_id IS NOT NULL AND status_contato = 'Fechado'`, the split commission is re-applied (SDR 1%+R$50 bonus, Closer 3%). Otherwise falls through to existing standard logic unchanged.

**Files:** `web/src/app/api/leads/[cnpj]/route.ts`

### Task 2: Create data verification script
**Commit:** 23af25e

Created `fix-closer-commission-data.mjs` that audits all Fechado leads with `closer_id` and verifies split commission values are correct. Supports `--fix` flag for corrections.

**Audit result:** 4 Fechado leads with closer_id found, all 4 have correct values (no fixes needed).

**Files:** `web/scripts/fix-closer-commission-data.mjs`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed column name in verification script**
- **Found during:** Task 2
- **Issue:** Script used `u_sdr.name` but the users table column is `nome`
- **Fix:** Changed to `u_sdr.nome AS sdr_name`
- **Files modified:** web/scripts/fix-closer-commission-data.mjs

**2. [Rule 3 - Blocking] Fixed .env file path in verification script**
- **Found during:** Task 2
- **Issue:** Script looked for `.env` but project uses `.env.local`
- **Fix:** Script now checks `.env.local`, `.env`, `.env.production` in order
- **Files modified:** web/scripts/fix-closer-commission-data.mjs

## Verification

- TypeScript compiles cleanly (no errors)
- Data script runs in dry-run mode: 4 leads audited, all correct
- Code review confirms closer_id guard is in place before standard recalc
