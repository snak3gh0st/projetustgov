---
phase: 04-client-qualification
plan: 01
subsystem: database
tags: [sqlalchemy, etl, cnpj, proponente, dimension-table, ibge-concla]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: ETL pipeline with SQLAlchemy models and upsert operations
  - phase: 02-operational-maturity
    provides: Polars-based parsing with column normalization
provides:
  - Proponente dimension table with CNPJ as natural key
  - OSC classification using IBGE CONCLA natureza_juridica codes
  - Proponente extraction integrated into ETL pipeline
  - Aggregated metrics (total_propostas, total_emendas, valor_total_emendas)
affects: [05-data-dashboard, client-qualification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dimension table pattern for entity normalization"
    - "Two-phase ETL: extract entities then compute aggregations"
    - "CNPJ normalization to 14-digit zero-padded format"
    - "IBGE CONCLA natureza juridica classification for OSC filtering"

key-files:
  created:
    - .planning/phases/04-client-qualification/05-01-SUMMARY.md
  modified:
    - src/loader/db_models.py
    - src/loader/upsert.py
    - src/parser/schemas.py
    - src/orchestrator/pipeline.py

key-decisions:
  - "Use 3XX range heuristic for OSC classification (simple and effective per RESEARCH.md)"
  - "Extract proponentes from propostas CSV rather than separate siconv_proponentes.csv (deferred additional file)"
  - "Store CNPJ as 14-digit zero-padded string for consistent matching"
  - "Compute aggregations after all entities loaded (two-phase pattern)"

patterns-established:
  - "Dimension table with computed metrics pattern"
  - "Application-level FK from fact table (propostas.proponente_cnpj) to dimension (proponentes.cnpj)"
  - "CNPJ normalization with regex strip and zero-padding"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 5 Plan 1: Client Qualification Foundation Summary

**Proponente dimension table with CNPJ deduplication, OSC classification via IBGE CONCLA codes, and pre-computed proposal/emenda aggregations**

## Performance

- **Duration:** 3 min (200 seconds)
- **Started:** 2026-02-06T22:05:36Z
- **Completed:** 2026-02-06T22:08:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Proponente SQLAlchemy model with CNPJ as unique natural key and is_osc classification flag
- ETL pipeline extracts unique proponentes from propostas CSV with CNPJ deduplication
- Aggregated metrics (total_propostas, total_emendas, valor_total_emendas) computed after entity loading
- Application-level FK from propostas.proponente_cnpj to proponentes.cnpj enables proponent-based queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Proponente model and update schemas** - `08f3cc2` (feat)
2. **Task 2: Integrate proponente extraction into ETL pipeline** - `7d0bd57` (feat)

## Files Created/Modified
- `src/loader/db_models.py` - Added Proponente model with CNPJ unique constraint, is_osc flag, aggregation columns; added proponente_cnpj column to Proposta model
- `src/loader/upsert.py` - Added extract_proponentes_from_propostas, normalize_cnpj, is_osc, compute_proponente_aggregations functions; integrated proponentes loading into load_extraction_data
- `src/parser/schemas.py` - Added column aliases for proponente extraction (proponente_cnpj, natureza_juridica_proponente, cep_proponente, etc.)
- `src/orchestrator/pipeline.py` - Integrated proponente extraction after propostas validation; added proponente_cnpj to proposta records

## Decisions Made

**1. Use 3XX range heuristic for OSC classification**
- Rationale: RESEARCH.md identifies 3XX IBGE CONCLA codes as non-profits; simple startswith('3') check is effective and performant
- Alternative considered: Maintain explicit OSC_CODES list (deferred to Phase 6 if more granular filtering needed)

**2. Extract from propostas CSV rather than siconv_proponentes.csv**
- Rationale: Propostas CSV already contains all required proponente fields; avoids adding new file to download pipeline
- Future enhancement: Add siconv_proponentes.csv if richer metadata needed

**3. Two-phase ETL pattern (extract then aggregate)**
- Rationale: Aggregations depend on multiple tables (propostas + emendas); separating phases ensures all entities loaded before computing metrics
- Implementation: compute_proponente_aggregations runs after all entity tables loaded

**4. Store CNPJ as 14-digit zero-padded string**
- Rationale: Consistent format enables reliable matching; handles both formatted (XX.XXX.XXX/XXXX-XX) and unformatted inputs
- Pattern: normalize_cnpj strips non-digits, zero-pads to 14 chars, rejects all-zeros

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without blockers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for:**
- Dashboard proponente entity page (05-02)
- Client qualification filtering by OSC vs government (future phase)
- Proponente-based analytics and ranking

**Schema changes:**
- Database migration required to add `proponentes` table and `propostas.proponente_cnpj` column
- Migration is idempotent (SQLAlchemy upsert handles re-running pipeline)

**Data availability:**
- Proponentes table will be populated on next pipeline run
- Aggregations will compute automatically after entity loading

---
*Phase: 04-client-qualification*
*Completed: 2026-02-06*

## Self-Check: PASSED
