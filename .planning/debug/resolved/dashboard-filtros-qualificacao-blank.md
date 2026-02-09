---
status: resolved
trigger: "Dashboard Streamlit has two problems: (1) Filtros on Propostas page don't work, (2) Qualificacao page shows blank/no data."
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T16:53:00Z
---

## Current Focus

hypothesis: CONFIRMED - data_publicacao is NULL for all propostas, causing year-based filters to return 0 rows
test: Query database to check data_publicacao values
expecting: All NULL
next_action: Fix applied and verified

## Symptoms

expected: Propostas page should show 6,140 propostas with working filters. Qualificacao page should show 27,214 proponentes ranked by value.
actual: Filtros on Propostas page don't function properly. Qualificacao page is completely blank.
errors: No error messages - queries silently return 0 rows due to NULL data_publicacao
reproduction: Open the Streamlit dashboard and navigate to Propostas or Qualificacao pages
started: After pipeline reload that loaded 2025-2026 data

## Eliminated

## Evidence

- timestamp: 2026-02-06T16:50:00Z
  checked: SELECT data_publicacao, count(*) FROM propostas GROUP BY data_publicacao
  found: data_publicacao is NULL for all 6,140 propostas
  implication: All year-based filters using extract('year', data_publicacao) return 0 rows

- timestamp: 2026-02-06T16:51:00Z
  checked: Raw CSV column headers
  found: CSV has DIA_PROPOSTA, DIA_PROP, ANO_PROP but no mapping to data_publicacao in COLUMN_ALIASES
  implication: Pipeline never populates data_publicacao because column alias is missing

- timestamp: 2026-02-06T16:52:00Z
  checked: proponentes queries with join removed
  found: 27,214 proponentes returned, 17,691 OSCs, 27 estados
  implication: Fix works - removing unnecessary join+year filter resolves blank page

## Resolution

root_cause: data_publicacao column is NULL for all 6,140 propostas because the parser's COLUMN_ALIASES in schemas.py has no mapping from the source CSV columns (DIA_PROPOSTA, DIA_PROP) to data_publicacao. All dashboard queries filtering on extract('year', data_publicacao) return 0 rows.
fix: (1) Removed unnecessary join+year filter from proponentes queries (pipeline already filters to 2025-2026 OSC data). (2) Changed propostas year filter to use extraction_date instead of data_publicacao. (3) Added missing column aliases for date fields in schemas.py for future pipeline runs.
verification: Tested all 3 query functions - get_proponentes returns 10+ rows, get_proponente_stats returns 27,214 total, get_propostas returns 6,140 with filters working.
files_changed:
  - src/dashboard/queries/proponentes.py
  - src/dashboard/queries/entities.py
  - src/parser/schemas.py
