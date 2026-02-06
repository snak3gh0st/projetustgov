# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Extração 100% confiável e automatizada dos dados do Transfer Gov
**Current focus:** Phase 1 - Foundation (complete ETL pipeline with zero data loss guarantee)

## Current Position

Phase: 4 of 5 (Client Qualification)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-06 — Completed 04-02-PLAN.md Client qualification dashboard

Progress: [█████████████░] 95%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: ~9 min (01-01: 65 min, 01-02: 5 min, 01-04: 15 min, 02-03: 5 min, 02-01: 8 min, 04-01: 4 min, 04-02: 3 min, 04-03: 2 min, 04-01: 3 min, 04-02: 2 min)
- Total execution time: ~1.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3 | 5 | ~28 min |
| 2. Operational Maturity | 4 | 4 | ~5 min |
| 4. Client Qualification | 2 | 2 | ~2.5 min |
| 5. Data Dashboard | 3 | 3 | ~3 min |

**Recent Trend:**
- Last 5 plans: 04-02 (2 min), 04-01 (3 min), 04-03 (2 min), 04-02 (3 min), 04-01 (4 min)
- Trend: Sustained high velocity across phases 4-5

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- MVP = Extração + DB (not CRM/Scoring) — Cliente precisa urgência na fundação de dados
- Playwright vs requests/scrapy — Transfer Gov pode ter JavaScript dinâmico
- PostgreSQL vs SQLite — Queries complexas futuras, dados críticos precisam ACID guarantees
- Scheduler diário desde v1 — Validar automação cedo evita surpresas em produção
- Validação multicamada — Garante confiabilidade desde dia 1
- Application-level FKs (no DB constraints) — Supports partial extractions per RESEARCH.md
- Synchronous SQLAlchemy — Batch ETL doesn't benefit from async complexity
- SQLAlchemy for DataLineage — Maintains consistency with Phase 1 architecture (vs introducing Prisma)
- Externalized YAML configuration — Replaces hardcoded settings, enables runtime config changes without code deployment
- Pydantic BaseModel for YAML config — More appropriate than BaseSettings for file-based configuration
- Dashboard 5-tab navigation — Home + 4 entity types (extraction history within Home, not separate tab)
- Dashboard 7-day default time range — Most relevant for operational monitoring
- Dashboard 10-minute query cache TTL — Balance between freshness and performance
- Dashboard as separate Railway service — Shares codebase/database with API, uses separate railway.dashboard.json config
- Railway PORT env var for dynamic port assignment — Enables multi-service deployment flexibility
- st.dataframe on_select for row selection — Native table selection UX with automatic rerun
- Cross-filtering via session_state — Store selected_proposta_id, read from other pages for cohesive filtering
- Junction table filtering — Query via SQL to get related entity IDs, then filter DataFrames
- Date range with st.date_input — Gives users full control over date ranges vs preset buttons
- 3XX range heuristic for OSC classification — Simple and effective using IBGE CONCLA natureza juridica codes
- Two-phase ETL for aggregations — Extract entities first, compute metrics after all tables loaded
- CNPJ normalization to 14-digit zero-padded — Consistent format for matching across data sources
- Value ranking by proposal count — Fewer proposals = higher value for prospecting (less competition)
- CNPJ formatting pattern — Display XX.XXX.XXX/XXXX-XX, export unformatted for data use
- Virgin proponent highlighting — Green background for 0 proposals (highest value prospects)

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 4 added: Data Dashboard (Streamlit dashboard for visualizing extracted Transfer Gov data)

### Blockers/Concerns

**Phase 1 Implementation Notes:**
- Transfer Gov authentication flow needs inspection during crawler development (confirm login selectors, session management)
- Excel/CSV file structure from Transfer Gov needs validation with actual downloaded files (column names, sheet names)
- Relationship keys between 4 files need confirmation during parsing (likely: proposta_id, apoiador_id, emenda_id, programa_id)

None of these are blocking — they're implementation details that emerge during development.

## Session Continuity

Last session: 2026-02-06
Stopped at: Completed 04-02-PLAN.md Client qualification dashboard
Resume file: None

---
*Phase 4 Client Qualification in progress: 04-01 complete (Proponente dimension table), 04-02 complete (Client qualification dashboard), 04-03 remaining*
