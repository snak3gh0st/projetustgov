---
phase: 14-data-audit-foundation
plan: 02
subsystem: database
tags: [postgres, supabase, ddl, schema, numeric, upsert]

# Dependency graph
requires:
  - phase: 14-data-audit-foundation
    provides: Research on projetos_execucao DDL design, UPSERT policy, and NUMERIC(18,2) requirement
provides:
  - projetos_execucao table in Supabase with 26 columns, NUMERIC(18,2) financials, UNIQUE(nr_convenio) constraint
  - Three indexes: ix_projetos_execucao_cnpj, ix_projetos_execucao_situacao, ix_projetos_execucao_data_fim (partial)
  - UPSERT conflict key policy documented in script header and schema.sql
  - schema.sql updated as canonical schema reference (section 14)
affects: [15-etl-sync, 16-alert-logic, 17-ui-execucao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CommonJS pg Pool script pattern with .env.local manual parsing for diagnostic/DDL scripts
    - NUMERIC(18,2) for all financial columns in new tables (replaces old FLOAT pattern)
    - UPSERT conflict key policy documented as code comment block at script top
    - Partial index on nullable date column (WHERE data_fim_vigencia IS NOT NULL)

key-files:
  created:
    - web/scripts/create-projetos-execucao.js
  modified:
    - web/schema.sql

key-decisions:
  - "UNIQUE constraint on nr_convenio alone (not cnpj) — one CNPJ has multiple convenios; cnpj alone as conflict key causes duplicate-row bug (mirrors commit 9e20d04 production incident)"
  - "NUMERIC(18,2) for all financial columns — FLOAT stores rounding errors permanently, NUMERIC prevents them at the schema level"
  - "Partial index on data_fim_vigencia WHERE NOT NULL — reduces index size while covering the primary query pattern for expiring projects"
  - "Column mapping documented: projetos_execucao.nr_convenio = siconv CSV NR_CONVENIO = convenios.transfer_gov_id (same value, different name)"

patterns-established:
  - "UPSERT policy comment block: document conflict key, never-overwrite fields, truncation policy, and column mapping at script top before DDL"
  - "DDL script pattern: transaction wrap, per-statement progress log, verification queries after COMMIT"

requirements-completed: [DATA-03]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 14 Plan 02: projetos_execucao Table Creation Summary

**projetos_execucao table created in Supabase with 26 columns, NUMERIC(18,2) financial columns, UNIQUE(nr_convenio) constraint, and 3 indexes — Phase 15 UPSERT conflict key and never-overwrite policy documented in code**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-18T00:00:00Z
- **Completed:** 2026-03-18T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- projetos_execucao table created in Supabase: 26 columns with VARCHAR identity fields, NUMERIC(18,2) financial columns, BOOLEAN alert flags, TIMESTAMPTZ sync metadata
- UNIQUE constraint `uq_projetos_execucao_nr_convenio` locks in the Phase 15 UPSERT conflict key (ON CONFLICT (nr_convenio) DO UPDATE) and prevents the duplicate-row bug pattern from production incident 9e20d04
- Three indexes created: cnpj (full), situacao (full), data_fim_vigencia (partial where NOT NULL)
- UPSERT policy comment block committed to source: conflict key, never-overwrite rules, truncation policy, column mapping between nr_convenio and convenios.transfer_gov_id
- schema.sql updated as canonical project schema reference with projetos_execucao as section 14

## Task Commits

Each task was committed atomically:

1. **Task 1: Create and run DDL script for projetos_execucao table** - `fb3646d` (feat)
2. **Task 2: Append projetos_execucao DDL to schema.sql** - `3128fa6` (feat)

## Files Created/Modified

- `web/scripts/create-projetos-execucao.js` - One-shot DDL script: CREATE TABLE, CREATE INDEX (3), UPSERT policy comment block, verification queries for columns/constraints/indexes. 181 lines.
- `web/schema.sql` - Appended section 14 (projetos_execucao) with full DDL, indexes, and UPSERT policy comments. No existing tables modified.

## Decisions Made

- Used `NUMERIC(18,2)` for all 5 financial state columns (valor_global, valor_repasse, valor_desembolsado, saldo_conta, valor_empenhado) plus `NUMERIC(6,2)` for pct_execucao — old schema uses FLOAT incorrectly; this table starts correctly.
- `UNIQUE (nr_convenio)` as the only conflict key — cnpj alone cannot be used because one entity can have multiple convenios. This directly prevents the pattern that caused the STEP 7c production bug.
- Partial index on `data_fim_vigencia WHERE NOT NULL` — matches the primary expiry query pattern while excluding rows with no end date from the index.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The script ran on first attempt and created the table, constraint, and all 3 indexes successfully. Verification queries confirmed 6 NUMERIC columns (5 financial + pct_execucao), the UNIQUE constraint name, and all 4 index names (primary key + 3 created indexes).

## User Setup Required

None - no external service configuration required. The table was created directly in Supabase using the pg Pool connection from .env.local.

## Next Phase Readiness

- projetos_execucao table is ready in Supabase for Phase 15 ETL sync code
- Phase 15 must use ON CONFLICT (nr_convenio) DO UPDATE as the UPSERT conflict key (documented in script and schema.sql)
- Phase 15 must use LEFT JOIN propostas (not INNER JOIN) — this decision depends on Phase 14 Plan 01 diagnostic results (NULL proposta_id count)
- Alert business rule for alerta_desembolso and verificar_saldo columns must be confirmed with client before Phase 16 (see STATE.md blockers)

---
*Phase: 14-data-audit-foundation*
*Completed: 2026-03-18*
