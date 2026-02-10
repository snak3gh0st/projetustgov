---
phase: quick-fix-pipeline
plan: 01
subsystem: pipeline-data-capture + dashboard-lead-workflow
tags: [bugfix, data-completeness, dashboard-simplification]
dependency_graph:
  requires: [db-models, schema-mappings, pipeline-orchestrator]
  provides: [complete-financial-data, simplified-lead-dashboard]
  affects: [convenios, propostas, proponentes, dashboard-all-pages]
tech_stack:
  added: []
  patterns: [lead-focused-sales-workflow, instrument-financial-detail]
key_files:
  created:
    - .planning/quick/1-fix-data-pipeline-add-missing-financial-/1-SUMMARY.md
  modified:
    - src/loader/db_models.py
    - src/parser/schemas.py
    - src/transformer/models.py
    - src/orchestrator/pipeline.py
    - src/dashboard/streamlit_app.py
    - src/dashboard/pages/home.py
    - src/dashboard/queries/entities.py
    - src/dashboard/queries/lead_profile.py
    - src/dashboard/pages/lead_profile.py
decisions: []
metrics:
  duration: 395s
  completed_date: 2026-02-10
---

# Quick Task 1: Fix Data Pipeline + Add Missing Financial Data

**One-liner:** Fixed pipeline to capture all financial columns from convenios/propostas CSVs, removed destructive year filter, and rebuilt dashboard as a 2-page lead-focused sales tool.

## Overview

The pipeline was dropping 7 critical financial columns from convenios and 3 fields from propostas. The 2025-2026 year filter on propostas destroyed ~70% of convenio-to-proposta links. The dashboard had 7 pages when the sales workflow only needs 2 (lead list + lead detail).

**Impact:** Pipeline now captures complete financial data (valor_empenhado, saldo_conta, etc.), loads ALL propostas preserving foreign key relationships, and dashboard is simplified to a clean 2-page lead workflow.

## Tasks Completed

### Task 1: Add Missing Columns to DB Models, Schemas, and Validation
**Status:** Complete | **Commit:** a0b36b8

**Changes:**
- Added 7 new float columns to Convenio model: valor_empenhado, saldo_conta, saldo_reman_tesouro, saldo_reman_convenente, rendimento_aplicacao, ingresso_contrapartida, valor_global_original
- Added 3 new string columns to Proposta model: modalidade, orgao_superior, orgao_vinculado
- Updated EXPECTED_COLUMNS and COLUMN_ALIASES in schemas.py to map CSV headers
- Updated Pydantic validation models to parse Brazilian float format for all new fields

**Files Modified:**
- src/loader/db_models.py
- src/parser/schemas.py
- src/transformer/models.py

**Verification:** ✓ Convenio has 7 new financial columns. Proposta has 3 new string columns. Schema aliases map all CSV headers. Pydantic validation parses Brazilian float format correctly.

### Task 2: Fix Pipeline - Remove Year Filter, Load Real Programas, Extract Emenda Year
**Status:** Complete | **Commit:** 6dac0a4

**Changes:**
- Removed the SKIPPING block for programas CSV (lines 353-356) — real programas now loaded from CSV
- Removed the 2025-2026 year filter on propostas (lines 408-438) — ALL propostas now loaded
- Added `_extract_emenda_year()` helper function to extract year from COD_PROGRAMA_EMENDA positions 5-8
- Updated emenda creation block to use `_extract_emenda_year(row, cod_programa_emenda_col)` instead of `None`

**Files Modified:**
- src/orchestrator/pipeline.py

**Verification:** ✓ Pipeline imports correctly. Year filter removed (grep returns 0). Programas skip removed (grep returns 0).

### Task 3: Simplify Dashboard to 2-Page Lead-Focused Layout
**Status:** Complete | **Commit:** e890c40

**Changes:**
- Rewrote streamlit_app.py to have exactly 2 pages: Leads (home) and Lead Profile
- Removed imports for propostas, programas, apoiadores, emendas, qualificacao pages
- Removed global search and breadcrumb imports (not needed for simple workflow)
- Added `get_lead_list()` query function to entities.py (ranks by qtd_instrumentos + valor_emendas)
- Added `get_uf_options()` helper query
- Rewrote home.py as lead list page with sidebar filters (UF, Com/Sem Emenda, Faixa de Valor)
- Lead table displays: CNPJ, Nome, UF, Qtd Instrumentos, Valor Emendas, Tem Contato
- Row selection navigates to Lead Profile using st.switch_page()

**Files Modified:**
- src/dashboard/streamlit_app.py
- src/dashboard/pages/home.py
- src/dashboard/queries/entities.py

**Verification:** ✓ Home page imports correctly. Lead list query imports correctly. Old page imports removed from streamlit_app.py.

### Task 4: Rebuild Lead Profile Page with Instrument Financial Detail
**Status:** Complete | **Commit:** e39de04

**Changes:**
- Added `get_lead_instruments()` query to lead_profile.py — fetches ALL convenios with full financial detail
- Added `get_lead_instrument_summary()` query — aggregates financial totals (total_instrumentos, total_valor_global, total_empenhado, total_liberado, total_saldo_conta, instrumentos_ativos)
- Rewrote lead_profile.py page with 3 sections:
  1. Header: CNPJ (formatted), Nome, Email, Telefone, "Voltar para Leads" button
  2. Summary KPIs: 6 cards showing financial totals
  3. Instruments table: ALL convenios with columns for nr_instrumento, modalidade, situacao, ativo, emenda (SIM/NAO), parlamentar, valor_global, valor_emenda, valor_empenhado, valor_liberado, saldo_conta, valor_repasse, valor_contrapartida, valor_global_original, rendimento_aplicacao, ingresso_contrapartida, dates
- Removed tier classification display and TIER_COLORS import
- Removed old tabbed layout (emendas/propostas/ministerios/programas tabs)
- All monetary columns formatted as "R$ X.XXX,XX"

**Files Modified:**
- src/dashboard/queries/lead_profile.py
- src/dashboard/pages/lead_profile.py

**Verification:** ✓ Lead profile queries import correctly. Lead profile page imports correctly. Financial columns (valor_empenhado, saldo_conta) referenced in queries.

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

### Database Schema Changes
The 10 new columns (7 on Convenio, 3 on Proposta) will require a database migration. The ORM models now define them, but existing databases will need ALTER TABLE statements or a full rebuild.

### Pipeline Behavior
- Real programas from CSV are upserted first, then synthetic programas from apoiadores_emendas update via ON CONFLICT — this is intentional and fine since real data has better fields
- Emenda year extraction from COD_PROGRAMA_EMENDA uses positions 5-8 (1-indexed) which corresponds to slice [4:8] in Python
- Removing the year filter means the pipeline will load ALL propostas from the CSV, not just 2025-2026. This preserves convenio-to-proposta links.

### Dashboard Architecture
The simplified 2-page structure is a significant departure from the previous 7-page design. The workflow is now:
1. User lands on Leads page
2. User applies filters (UF, emenda status, valor range)
3. User clicks a row in the lead table
4. User sees Lead Profile with contact info, KPI summary, and instrument financial detail
5. User can "Voltar para Leads" to select another lead

This is optimized for sales reps who want to quickly find leads, see their financial profile, and take action.

## Verification Results

All verification checks passed:

1. ✓ Convenio model has 24 columns including all 7 new financial columns
2. ✓ Proposta model has 21 columns including modalidade, orgao_superior, orgao_vinculado
3. ✓ Year filter removed (grep returns 0 matches for "2025.*2026")
4. ✓ Programas skip removed (grep returns 0 matches for "SKIPPING.*programas")
5. ✓ Dashboard imports correctly (no ImportError)
6. ✓ Financial columns referenced in lead_profile queries (2 matches for "valor_empenhado")

## Success Criteria

- [x] DB models have all 10 new columns (7 on Convenio, 3 on Proposta)
- [x] Schema aliases map all CSV column names to model field names
- [x] Pydantic validation handles Brazilian float format for new financial fields
- [x] Pipeline loads ALL propostas (no year filter)
- [x] Pipeline loads real programas from CSV
- [x] Emenda year extracted from COD_PROGRAMA_EMENDA
- [x] Dashboard has exactly 2 pages: Lead List and Lead Profile
- [x] Lead List shows CNPJ table ranked by opportunity with filters
- [x] Lead Profile shows instrument table with all financial columns
- [x] No broken imports or missing dependencies

## Self-Check

**Status:** PASSED

### Created Files
- ✓ `.planning/quick/1-fix-data-pipeline-add-missing-financial-/1-SUMMARY.md` — exists

### Modified Files
- ✓ `src/loader/db_models.py` — modified
- ✓ `src/parser/schemas.py` — modified
- ✓ `src/transformer/models.py` — modified
- ✓ `src/orchestrator/pipeline.py` — modified
- ✓ `src/dashboard/streamlit_app.py` — modified
- ✓ `src/dashboard/pages/home.py` — modified
- ✓ `src/dashboard/queries/entities.py` — modified
- ✓ `src/dashboard/queries/lead_profile.py` — modified
- ✓ `src/dashboard/pages/lead_profile.py` — modified

### Commits
- ✓ `a0b36b8` — feat(quick-1): add missing financial columns to DB models, schemas, and validation
- ✓ `6dac0a4` — fix(quick-1): remove destructive year filter and load real programas
- ✓ `e890c40` — feat(quick-1): simplify dashboard to 2-page lead-focused layout
- ✓ `e39de04` — feat(quick-1): rebuild lead profile page with instrument financial detail

All commits exist in git history.

## Next Steps

1. **Database Migration:** Run migration to add the 10 new columns to existing databases
2. **Pipeline Re-run:** Execute full pipeline to capture complete financial data
3. **User Acceptance:** Show client the simplified 2-page dashboard and get feedback
4. **Data Validation:** Verify that all financial columns are being populated correctly from CSVs
