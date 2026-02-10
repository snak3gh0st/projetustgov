# Roadmap: PROJETUS Transfer Gov Automation

## Overview

PROJETUS delivers 100% reliable automated extraction of Transfer Gov data through focused milestone delivery. **Milestone v1.0** (Phases 1-5) established the complete ETL pipeline, operational monitoring, client qualification, and data dashboard. **Milestone v2.0** (Phases 6-9) transforms the Streamlit dashboard from functional to premium — a Sigma-branded sales tool optimized for lead research workflow with dark theme, glassmorphic design, interactive charts, and streamlined navigation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### Milestone v1.0 — Complete

- [x] **Phase 1: Foundation** - Complete ETL pipeline with zero data loss guarantee
- [x] **Phase 2: Operational Maturity** - Advanced monitoring, reconciliation, configuration management
- [x] **Phase 4: Client Qualification** - Intuitive interface for clients to find and contact the most valuable proponents
- [x] **Phase 5: Data Dashboard** - Streamlit dashboard for visualizing extracted Transfer Gov data
- [ ] **Phase 3: Production Excellence** - Optional enhancements triggered by operational need

### Milestone v2.0 — Dashboard Premium Redesign

- [ ] **Phase 6: Visual Foundation & Component System** - Sigma-branded dark theme, glassmorphic cards, CSS injection, typography
- [ ] **Phase 7: Data Visualization & Charts** - Interactive Plotly charts with Sigma branding for trends, geographic, value distribution
- [ ] **Phase 8: Lead Profile & Enhanced Navigation** - Dedicated lead deep-dive page, global search, visual ranking, streamlined navigation
- [ ] **Phase 9: Polish & Production Readiness** - Mobile responsive, loading states, animations, consistent styling across all pages

## Phase Details

### Phase 1: Foundation
**Goal**: Deliver working end-to-end pipeline that extracts 4 files from Transfer Gov daily at 9am, processes with validation, loads to PostgreSQL with relationships, and alerts on failures. Zero data loss guarantee through comprehensive validation and atomic transactions.

**Depends on**: Nothing (first phase)

**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04, EXTR-05, EXTR-06, ETL-01, ETL-02, ETL-03, ETL-04, ETL-05, ETL-06, DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, DB-07, SCHED-01, MON-01, MON-02, MON-05, MON-07

**Success Criteria** (what must be TRUE):
  1. System downloads 4 files (propostas, apoiadores, emendas, programas) from Transfer Gov without manual intervention
  2. Downloaded files are stored raw before processing (enables reprocessing if parser fails)
  3. Parser detects encoding automatically and converts to UTF-8 (Portuguese characters render correctly)
  4. Data validation fails loudly if schema changes (no silent data corruption)
  5. PostgreSQL contains all extracted data with correct relationships (propostas ↔ apoiadores ↔ emendas)
  6. System runs automatically at 9am daily via scheduler
  7. Telegram alert sent after each execution (success with row counts, or error with stack trace)
  8. Health check endpoint returns status of last execution (external monitoring can verify system is alive)
  9. Re-running extraction does not duplicate data (idempotent operations via unique constraints)
  10. If validation fails at any stage, entire transaction rolls back (atomic operations, no partial data)

**Status**: Complete (2026-02-05)

Plans:
- [x] 01-01-PLAN.md — Playwright crawler + Transfer Gov navigation
- [x] 01-02-PLAN.md — File download and storage
- [x] 01-03-PLAN.md — ETL parser (encoding, validation, transformation)
- [x] 01-04-PLAN.md — PostgreSQL schema, relationships, upserts
- [x] 01-05-PLAN.md — Scheduler, monitoring, health check

### Phase 2: Operational Maturity
**Goal**: Add advanced monitoring, reconciliation checks, configuration management, and data lineage tracking. System becomes easier to debug, adapt to source changes, and audit for compliance. Delivers full confidence in data accuracy and maintainability.

**Depends on**: Phase 1

**Requirements**: MON-03, MON-04, MON-06

**Success Criteria** (what must be TRUE):
  1. Email alerts sent as backup if Telegram fails (multi-channel alerting ensures notifications always reach users)
  2. Alert triggered if volume varies >10% vs previous day (detects incomplete extractions early)
  3. Alert triggered if scheduler didn't run at expected time (detects system outages immediately)
  4. Reconciliation check compares source row count vs DB inserts (verifies zero data loss)
  5. Data lineage tracks source file, extraction timestamp, and pipeline version per record (audit trail for compliance)
  6. Configuration externalized to YAML files (column mappings and validation rules not hardcoded)
  7. Dry-run mode previews extraction without writing to database (safe testing of parser changes)
  8. Full upsert logic implemented with ON CONFLICT DO UPDATE (handles changing data gracefully)

**Status**: Complete (2026-02-05)

Plans:
- [x] 02-01-PLAN.md — Configuration Externalization (YAML + Pydantic)
- [x] 02-02-PLAN.md — Enhanced Alerting (Telegram + Email + Volume + Scheduler)
- [x] 02-03-PLAN.md — Reconciliation & Lineage (DB model + tracking)
- [x] 02-04-PLAN.md — Dry-Run Mode & Health Check API

### Phase 3: Production Excellence
**Goal**: Add advanced capabilities for self-healing, performance optimization, and data quality monitoring. Only build when operational pain justifies complexity investment. This phase is triggered by need, not pre-scheduled.

**Depends on**: Phase 2

**Requirements**: SCHED-02, SCHED-03

**Success Criteria** (what must be TRUE):
  1. Data quality dashboard shows completeness percentage, freshness, and row counts vs baseline (visual monitoring replaces tedious SQL queries)
  2. Anomaly detection alerts on unexpected patterns (volume drops, schema drift, suspicious data)
  3. Checkpoint tracking allows resumption from last successful step if execution fails mid-run (automatic recovery without manual intervention)
  4. Idempotency fully guaranteed across all operations (running twice produces identical result)
  5. Parallel processing implemented if runtime exceeds 30 minutes (performance optimization for scale)

**Trigger conditions:**
- Dashboard: When users actively monitor data and SQL queries for metrics become tedious
- Anomaly Detection: When 3+ months of historical baseline data exists
- Auto Recovery: When manual intervention becomes bottleneck (>5% of runs fail)
- Parallel Processing: When runtime exceeds 30 minutes (unlikely at 11 proposals/day)

**Status**: Not started (triggered by operational need)

Plans:
- [ ] TBD when operational need emerges

### Phase 4: Client Qualification
**Goal**: Create an intuitive interface that makes it easy for clients to discover and contact the most valuable proponents (those with fewer projects and new to the system). The interface should highlight proponent value metrics and streamline the qualification workflow.

**Depends on**: Phase 1 (needs data in PostgreSQL)

**Success Criteria** (what must be TRUE):
  1. Proponents are ranked by value metrics (fewer active projects = higher value, new/virgin proponents = highest value)
  2. Client can easily search and filter proponents by value criteria
  3. Contact information is prominently displayed for each proponent
  4. Interface is intuitive enough for non-technical clients to use without training
  5. Value metrics are clearly explained (why fewer projects = more valuable)
  6. Client can save/export their qualified proponent list
  7. Interface performs well with the current data volume
  8. Technology choice (Streamlit vs alternatives) is validated for client UX needs

**Status**: Complete (2026-02-08)

Plans:
- [x] 04-01-PLAN.md — Proponente data model + ETL extraction (dimension table, CNPJ dedup, OSC classification, aggregations)
- [x] 04-02-PLAN.md — Qualification dashboard page (ranked table, filters, KPIs, CSV export)
- [x] 04-03-PLAN.md — Human verification of complete qualification feature

### Phase 5: Data Dashboard
**Goal**: Build a Streamlit dashboard that visualizes all extracted Transfer Gov data — propostas, programas, apoiadores, and emendas — with row counts, extraction history, data freshness, and drill-down views. Provides operational visibility without writing SQL queries.

**Depends on**: Phase 4 (can build on qualification interface foundation)

**Success Criteria** (what must be TRUE):
  1. Dashboard displays row counts per entity table (programas, propostas, apoiadores, emendas)
  2. Extraction history shows last 30 days of pipeline runs with status (success/partial/failed)
  3. Data tables are browsable with search, sort, and filter capabilities
  4. Dashboard shows data freshness (last extraction date and time)
  5. Propostas can be explored with related programas, apoiadores, and emendas
  6. Dashboard is deployable on Railway alongside the existing API service
  7. Portuguese characters render correctly throughout the dashboard

**Status**: Complete (2026-02-08)

Plans:
- [x] 05-01-PLAN.md — Dashboard foundation: Streamlit app structure, DB queries, shared components, home overview page
- [x] 05-02-PLAN.md — Entity pages: Propostas, Programas, Apoiadores, Emendas with cross-filtering and CSV export
- [x] 05-03-PLAN.md — Extraction history page and Railway deployment configuration
- [x] 05-04-PLAN.md — Human verification of complete dashboard

### Phase 6: Visual Foundation & Component System
**Goal**: Establish Sigma-branded dark theme foundation with CSS injection infrastructure and reusable glassmorphic components. Creates premium visual identity and component system used by all subsequent phases.

**Depends on**: Phase 5 (builds on existing Streamlit dashboard)

**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06

**Success Criteria** (what must be TRUE):
  1. Dark theme applied globally with Sigma brand colors (background #050B1F, text #E8F4FD, accent #00D4FF)
  2. Custom CSS loaded from external file at app entry point (no inline CSS strings scattered across pages)
  3. Space Grotesk and Inter fonts loaded from Google Fonts and applied to headings and body text
  4. Glassmorphic card component created with semi-transparent background, backdrop-filter blur, and neon border
  5. Premium KPI cards display large numbers with labels, delta indicators, and subtle glow on hover
  6. Consistent color system established for value badges (green/blue/amber/gray), status indicators, and severity levels
  7. Component wrappers tested on existing Home page (metrics replaced with glassmorphic cards)

**Plans:** 2 plans

Plans:
- [ ] 06-01-PLAN.md — CSS foundation: config.toml dark theme, external CSS files (fonts, theme, components), CSS loader in entry point
- [ ] 06-02-PLAN.md — Component wrappers (cards, KPI, badges) + Home page integration + visual verification

### Phase 7: Data Visualization & Charts
**Goal**: Integrate interactive Plotly charts with Sigma brand theming for geographic distribution, value analysis, and trend visualization. Establishes themed chart wrapper used across dashboard.

**Depends on**: Phase 6 (requires dark theme colors and card components)

**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04, CHART-05

**Success Criteria** (what must be TRUE):
  1. Plotly dark theme wrapper created with Sigma brand colors and transparent backgrounds
  2. Geographic heatmap shows proponents by estado with value-based color coding
  3. Value distribution chart displays histogram of proponent value tiers across dataset
  4. Trend chart visualizes propostas/emendas over time with monthly/yearly view toggle
  5. KPI sparklines render mini trend lines inside metric cards showing recent evolution
  6. All charts use consistent Sigma branding (colors, fonts, backgrounds match dark theme)
  7. Charts integrated into Home and Qualificação pages with glassmorphic card wrappers

**Plans**: TBD (to be determined during plan-phase)

Plans:
- [ ] TBD during planning

### Phase 8: Lead Profile & Enhanced Navigation
**Goal**: Build dedicated lead profile page for deep-dive proponent research and implement global search with enhanced navigation. Delivers core sales workflow optimization.

**Depends on**: Phase 7 (uses glassmorphic cards and charts for lead profile)

**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05, LEAD-06, NAV-01, NAV-02, NAV-03, NAV-04

**Success Criteria** (what must be TRUE):
  1. Dedicated lead profile page shows single proponent with all data organized in tabs (emendas, propostas, convênios, histórico)
  2. Global search bar visible on every page accepts CNPJ or nome and navigates to lead profile
  3. Lead profile prominently displays contact info (email, telefone, endereço)
  4. Lead profile shows value assessment summary (tier, total emendas value, propostas count, convênios)
  5. Lead profile displays related ministérios and programas associations
  6. Quick actions available from profile (export lead data, copy CNPJ, navigate to related entities)
  7. Qualificação page enhanced with visual ranking cards instead of raw table and clear value tier indicators
  8. Sidebar navigation styled with Sigma branding (logo, styled nav items)
  9. Breadcrumb or context indicator shows which lead/entity is currently selected
  10. All entity pages (Propostas, Programas, Apoiadores, Emendas) updated with consistent premium styling

**Plans**: TBD (to be determined during plan-phase)

**Research Flag**: Phase planning should research global cross-entity search architecture (search index structure, SQL query optimization, relevance ranking).

Plans:
- [ ] TBD during planning

### Phase 9: Polish & Production Readiness
**Goal**: Apply final polish layer across all pages — mobile responsiveness, loading states, empty states, animations, and consistent styling. Ensures premium experience on all devices and edge cases.

**Depends on**: Phase 8 (applies polish to complete feature set)

**Requirements**: POL-01, POL-02, POL-03, POL-04, POL-05, POL-06

**Success Criteria** (what must be TRUE):
  1. Mobile responsive layout implemented with metric cards stacking, tables scrolling horizontally, search remaining accessible
  2. Loading states show skeleton cards or spinners while data loads (no blank screens during queries)
  3. Empty states display friendly messages when no data matches filters (not blank tables)
  4. Subtle CSS animations added for card hover effects, smooth transitions, fade-in on page load
  5. All 6+ pages use consistent premium styling (no page looks like default Streamlit)
  6. Status badges styled as pill badges for proposta situação, value tier, and data freshness
  7. Performance validated on mobile devices (glassmorphic effects don't cause lag)

**Plans**: TBD (to be determined during plan-phase)

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
- **Milestone v1.0**: Phases 1 → 2 → 4 → 5 (complete), Phase 3 (optional, triggered by need)
- **Milestone v2.0**: Phases 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| **Milestone v1.0** | | | |
| 1. Foundation | 5/5 | Complete | 2026-02-05 |
| 2. Operational Maturity | 4/4 | Complete | 2026-02-05 |
| 4. Client Qualification | 3/3 | Complete | 2026-02-08 |
| 5. Data Dashboard | 4/4 | Complete | 2026-02-08 |
| 3. Production Excellence | 0/TBD | Optional | - |
| **Milestone v2.0** | | | |
| 6. Visual Foundation & Component System | 0/2 | Planned | - |
| 7. Data Visualization & Charts | 0/TBD | Planning | - |
| 8. Lead Profile & Enhanced Navigation | 0/TBD | Planning | - |
| 9. Polish & Production Readiness | 0/TBD | Planning | - |

---
*Roadmap created: 2026-02-04*
*Milestone v1.0 depth: quick (5 phases)*
*Milestone v1.0 coverage: 29/29 v1 requirements mapped*

*Milestone v2.0 added: 2026-02-09*
*Milestone v2.0 depth: quick (4 phases)*
*Milestone v2.0 coverage: 27/27 v2.0 requirements mapped*
