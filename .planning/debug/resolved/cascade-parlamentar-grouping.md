---
status: resolved
trigger: "cascade-parlamentar-grouping"
created: 2026-02-17T00:00:00Z
updated: 2026-02-17T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - The root cause is in repo-sync.ts. When a (cnpj, cod_programa) has multiple emendas from different parlamentares, repo-sync concatenates them into ONE DB row ("Parlamentar A | Parlamentar B") instead of creating separate rows per parlamentar. The unique constraint is on (cnpj, codigo_programa), so only one row exists per program per CNPJ. The frontend's emenda_count is cnpjLeads.length (number of DB rows per CNPJ), so it correctly shows 1 for a single-row CNPJ - no cascade expand button appears. Multiple parlamentares are hidden inside a single concatenated field.
test: Fix requires: (1) change the unique constraint to allow multiple rows per (cnpj, codigo_programa) differentiated by parlamentar/nr_emenda, OR (2) split concatenated parlamentares into separate rows at sync time
expecting: After fix, each (cnpj, codigo_programa, parlamentar) combination gets its own row, frontend cascade shows them as separate sub-rows
next_action: Implement fix in repo-sync.ts to create separate rows per (cnpj, codigo_programa, parlamentar) and update the DB unique constraint

## Symptoms

expected: When cod_programa is the same but parlamentar is different, the cascade should show separate groups per parlamentar (not collapse them into one group)
actual: Programs with the same cod_programa are being grouped/collapsed together regardless of parlamentar, hiding the fact that different parlamentares are involved
errors: No error messages - it's a logic/UI grouping bug
reproduction: Look at leads table where a cod_programa has multiple parlamentares assigned - they incorrectly show as a single cascade group
started: Quick Task 21 implemented cascade by parlamentar (commit dcbec6a) - may have regressed or wasn't fully correct

## Eliminated

- hypothesis: "Frontend groupBy key uses only cod_programa"
  evidence: Frontend groups by cnpj (not cod_programa), and emenda_count is cnpjLeads.length (count of DB rows per CNPJ)
  timestamp: 2026-02-17

- hypothesis: "Quick Task 21 introduced a regression in the grouping key"
  evidence: QT21 only changed display (showing parlamentar name in amber), not the grouping logic. The root is in repo-sync.ts data ingestion
  timestamp: 2026-02-17

## Evidence

- timestamp: 2026-02-17
  checked: web/src/app/leads/page.tsx lines 99-113
  found: displayLeads groups by lead.cnpj; emenda_count = cnpjLeads.length (count of DB rows for same CNPJ); hasMultipleEmendas = emenda_count > 1
  implication: Only shows expand button when CNPJ has multiple DB rows (different codigo_programa values)

- timestamp: 2026-02-17
  checked: web/src/lib/repo-sync.ts lines 428-452
  found: For each (cod_programa, cnpj) key, ALL emendas from different parlamentares are concatenated: parlamentares = Array.from(parlamentarSet).join(' | '). ONE DB row inserted per (cnpj, codigo_programa)
  implication: Multiple parlamentares on same program become ONE row with "Parl A | Parl B" - cascade never shows them as separate entries

- timestamp: 2026-02-17
  checked: web/src/app/api/setup-crm/route.ts lines 107-120
  found: Unique constraint idx_vp_cnpj_codigo_programa on (cnpj, codigo_programa) - enforces one row per program per CNPJ
  implication: Fix requires changing the unique constraint to allow multiple rows per (cnpj, codigo_programa) when parlamentar differs

- timestamp: 2026-02-17
  checked: web/src/app/api/leads/route.ts lines 63-67
  found: API emenda_count subquery uses COUNT(DISTINCT vp2.nr_emenda) per CNPJ - but nr_emenda is concatenated text "EM1 | EM2", so COUNT returns 1 for concatenated strings
  implication: Even the API's emenda_count would be wrong for concatenated emendas

## Resolution

root_cause: |
  In repo-sync.ts (STEP 4), when building leads from the emendas CSV, all emendas for the same
  (cnpj, codigo_programa) pair were aggregated into ONE database row with concatenated
  parlamentar = "Parl A | Parl B" and nr_emenda = "EM1 | EM2". The unique constraint was on
  (cnpj, codigo_programa), enforcing one row per program per CNPJ.

  The frontend cascade groups by cnpj and shows expand button only when cnpjLeads.length > 1
  (i.e., multiple DB rows for the same CNPJ). A CNPJ with one program but multiple parlamentares
  had only ONE DB row, so no expand button appeared and the different parlamentares were hidden.

fix: |
  Three files changed:
  1. repo-sync.ts: Changed STEP 4 to create ONE row per emenda (not one per program per CNPJ).
     Each emenda gets its own row with individual parlamentar, nr_emenda, and valor_emenda.
     Added STEP 5b to delete old concatenated rows (after reading assignments to preserve them).
     Updated assignment lookup to use cnpj|nr_emenda key with CNPJ-level fallback.

  2. setup-crm/route.ts: Dropped old unique index (cnpj, codigo_programa). Created new
     expression unique index (cnpj, codigo_programa, COALESCE(nr_emenda, '')) named
     idx_vp_cnpj_prog_emenda. Updated deduplication query for new granularity.

  3. leads/route.ts: Changed emenda_count from COUNT(DISTINCT nr_emenda) to COUNT(*) since
     nr_emenda is now a simple per-row value (not concatenated).

verification: |
  - TypeScript compilation passes (tsc --noEmit)
  - Frontend cascade logic in page.tsx requires no changes: it already groups by cnpj and
    shows sub-rows for each DB row. With per-emenda rows, multiple parlamentares on the same
    program will now appear as separate sub-rows in the cascade.
  - Assignment preservation: cnpjAssignments fallback map ensures vendedor assignments survive
    the migration (old concatenated rows deleted, new rows re-inserted with same vendedor).

files_changed:
  - web/src/lib/repo-sync.ts
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/leads/route.ts
