---
mode: quick
task: "Fix cascade grouping to separate rows per parlamentar/emenda + gestor auth for cron sync"
date: 2026-02-17
status: complete
---

# Quick Task 31: Fix Cascade Parlamentar Grouping

## Problem

The cascade effect (efeito cascata) in the leads table grouped by `cod_programa` only. Programs with 2+ different parlamentares were collapsed into ONE database row with pipe-concatenated values like `"Parlamentar A | Parlamentar B"`. The unique constraint `(cnpj, codigo_programa)` enforced one row per program per CNPJ — hiding parlamentar distinctions.

Quick Task 21 (commit dcbec6a) only improved display in sub-rows but never changed the data model.

## Root Cause

In `repo-sync.ts` STEP 4, all emendas sharing the same `(cnpj, codigo_programa)` were collapsed into one row. The frontend cascade groups by CNPJ and shows expand only when `cnpjLeads.length > 1` — so same-program/different-parlamentar leads were invisible.

## Tasks

### Task 1: Change data model to one row per emenda
- **files:** `web/src/lib/repo-sync.ts`
- **action:** Changed STEP 4 from one-row-per-program to one-row-per-emenda. Each emenda gets individual parlamentar, nr_emenda, valor_emenda. Added STEP 5b to delete old concatenated rows while preserving vendedor assignments via CNPJ-level fallback map.
- **verify:** TypeScript compiles, UPSERT uses new conflict key
- **done:** Commit fc4932c

### Task 2: Update database index
- **files:** `web/src/app/api/setup-crm/route.ts`
- **action:** Drop old `idx_vp_cnpj_codigo_programa` unique index, create new expression index `idx_vp_cnpj_prog_emenda` on `(cnpj, codigo_programa, COALESCE(nr_emenda, ''))` allowing multiple parlamentar rows per program.
- **verify:** Index creation runs on /api/setup-crm call
- **done:** Commit fc4932c

### Task 3: Fix emenda count query
- **files:** `web/src/app/api/leads/route.ts`
- **action:** Changed `emenda_count` from `COUNT(DISTINCT nr_emenda)` to `COUNT(*)` since nr_emenda is now per-row.
- **verify:** Leads API returns correct emenda counts
- **done:** Commit fc4932c

### Task 4: Add gestor auth to cron/sync-leads
- **files:** `web/src/app/api/cron/sync-leads/route.ts`
- **action:** Allow gestor session as fallback auth (alongside CRON_SECRET) for manual trigger via browser.
- **verify:** Gestor can navigate to /api/cron/sync-leads and trigger sync
- **done:** Commit 82cf535
