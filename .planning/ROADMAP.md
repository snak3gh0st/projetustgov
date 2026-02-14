# Roadmap: PROJETUS Transfer Gov Automation

## Overview

PROJETUS delivers 100% reliable automated extraction of Transfer Gov data through focused milestone delivery. **Milestone v1.0** (Phases 1-5) established the complete ETL pipeline, operational monitoring, client qualification, and data dashboard. **Milestone v2.0** (Phases 6-9) transformed the Streamlit dashboard into a premium Sigma-branded sales tool. **Milestone v3.0** (Phases 10-13) builds a full CRM de Vendas on Next.js — auth per vendedor, lead assignment, pipeline kanban, contact tracking, and commission control.

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

- [x] **Phase 6: Visual Foundation & Component System** - Sigma-branded dark theme, glassmorphic cards, CSS injection, typography
- [x] **Phase 7: Data Visualization & Charts** - Interactive Plotly charts with Sigma branding for trends, geographic, value distribution
- [x] **Phase 8: Lead Profile & Enhanced Navigation** - Dedicated lead deep-dive page, global search, visual ranking, streamlined navigation
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

**Status**: Complete (2026-02-09)

Plans:
- [x] 06-01-PLAN.md — CSS foundation: config.toml dark theme, external CSS files (fonts, theme, components), CSS loader in entry point
- [x] 06-02-PLAN.md — Component wrappers (cards, KPI, badges) + Home page integration + visual verification

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

**Status**: Complete (2026-02-10)

Plans:
- [x] 07-01-PLAN.md — Plotly theme wrapper, chart functions (choropleth, distribution, trend, sparkline), data queries, GeoJSON setup
- [x] 07-02-PLAN.md — Chart integration into Home and Qualificacao pages + visual verification

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

**Status**: Complete (2026-02-10)

Plans:
- [x] 08-01-PLAN.md — Search queries, lead profile queries, tier classification utility
- [x] 08-02-PLAN.md — Lead profile page with tabs, KPIs, contact info, quick actions
- [x] 08-03-PLAN.md — Global search bar, sidebar branding, breadcrumb component
- [x] 08-04-PLAN.md — Qualificacao ranking cards, entity page premium styling
- [x] 08-05-PLAN.md — Visual verification of complete Phase 8

### Phase 9: Polish & Production Readiness
**Goal**: Apply final polish layer across all pages — mobile responsiveness, loading states, empty states, animations, and consistent styling. Ensures premium experience on all devices and edge cases.

**Depends on**: Phase 8 (applies polish to complete feature set)

**Requirements**: POL-01, POL-02, POL-03, POL-04, POL-05, POL-06

**Status**: Superseded (Streamlit replaced by Next.js migration)

Plans:
- [ ] 09-01-PLAN.md — N/A (superseded by Next.js)

### Milestone v3.0 — CRM de Vendas

### Phase 10: Auth & CRM Foundation
**Goal**: Establish authentication system with role-based access (gestor vs vendedor), create CRM database tables, and protect all existing API routes. Gestor sees all leads, vendedor sees only assigned leads.

**Depends on**: Existing Next.js app (pages: /, /leads, /lead/[cnpj])

**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, PLAT-01, PLAT-02, PLAT-03

**Success Criteria** (what must be TRUE):
  1. Vendedor can log in with email and password
  2. Gestor can create and edit vendedor accounts
  3. JWT-based session persists across browser refreshes
  4. Vendedor sees only leads assigned to them (gestor sees all)
  5. All API routes require authentication (return 401 if no valid token)
  6. CRM tables created: users, lead_assignments, contact_notes, commissions
  7. Existing pages (Pipeline, Leads, Lead Profile) work behind auth
  8. Login page with Sigma branding matches existing dark theme

**Status**: Complete (2026-02-12)

Plans:
- [x] 10-01-PLAN.md — Install deps, CRM database tables, Auth.js config with credentials + JWT
- [x] 10-02-PLAN.md — Login page with Sigma branding, middleware route protection
- [x] 10-03-PLAN.md — DAL with role-based filtering, protect API routes, gestor vendedor management

### Phase 11: Lead Management & Contact Tracking
**Goal**: Enable gestor to assign leads to vendedores, track contact history per lead, and manage contact status. Vendedores can register notes, update contact info, and see timeline of interactions.

**Depends on**: Phase 10 (requires auth + CRM tables)

**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04, CONT-01, CONT-02, CONT-03, CONT-04

**Success Criteria** (what must be TRUE):
  1. Gestor can assign a lead to a specific vendedor from the lead list or profile
  2. System detects and alerts when same lead would be assigned to two vendedores
  3. Lead shows visible "CLIENTE EXISTENTE" flag when already in client base
  4. Lead shows direct link to programa de trabalho on TransferênciaGov
  5. Vendedor can register contact note (date, type, observation)
  6. Contact history visible as timeline on lead profile
  7. Contact status tracking: "Não contactado", "Aguardando retorno", "Em conversa", "Fechado"
  8. Vendedor can edit contact data (phone, email) on lead profile

**Status**: Complete (2026-02-12)

Plans:
- [x] 11-01-PLAN.md — Schema updates: existing_clients table, contact_notes activation, 5th status "Não Contatado"
- [x] 11-02-PLAN.md — Lead assignment UI and API with duplicate detection
- [x] 11-03-PLAN.md — Priority indicators, parlamentar repositioning, existing client flags
- [x] 11-04-PLAN.md — Contact notes timeline component and visualizador role
- [x] 11-05-PLAN.md — Contact edit UI gap closure (phone/email inline editing)

### Phase 12: Pipeline Kanban
**Goal**: Build visual kanban board for sales pipeline with drag-and-drop between 4 status columns. Vendedor drags leads through stages; gestor can filter by vendedor, UF, or tier.

**Depends on**: Phase 11 (requires lead assignments + contact status)

**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04

**Success Criteria** (what must be TRUE):
  1. Visual kanban board with 4 columns: Novo → Contactado → Em negociação → Fechado
  2. Vendedor can drag leads between columns to update status
  3. Each kanban card shows: nome, CNPJ, valor emenda, tier, vendedor assigned
  4. Pipeline filterable by vendedor, UF, and valor tier
  5. Kanban updates persist immediately to database
  6. Responsive layout works on desktop and tablet

**Status**: Not started

Plans:
- [ ] TBD (plan with `/gsd:plan-phase 12`)

### Phase 13: Comissões
**Goal**: Implement commission tracking and calculation per vendedor. When lead is marked "Fechado", commission is calculated based on configurable percentage. Gestor sees global report, vendedor sees their own dashboard.

**Depends on**: Phase 12 (requires pipeline with "Fechado" status)

**Requirements**: COM-01, COM-02, COM-03, COM-04

**Success Criteria** (what must be TRUE):
  1. Vendedor automatically linked to lead commission when status changes to "Fechado"
  2. Commission percentage configurable by gestor (default + per-lead exceptions)
  3. Commission report filterable by vendedor and date period
  4. Vendedor dashboard shows their leads, pipeline stats, and accumulated commissions
  5. Commission calculated over contract/emenda value

**Status**: Complete (2026-02-14)

Plans:
- [x] 13-01-PLAN.md — Commission configuration backend (DB tables, config API, lock on Fechado)
- [x] 13-02-PLAN.md — Commission report with filters and enhanced vendedor dashboard

## Progress

**Execution Order:**
- **Milestone v1.0**: Phases 1 → 2 → 4 → 5 (complete), Phase 3 (optional, triggered by need)
- **Milestone v2.0**: Phases 6 → 7 → 8 (complete), Phase 9 (superseded by Next.js)
- **Milestone v3.0**: Phases 10 → 11 → 12 → 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| **Milestone v1.0** | | | |
| 1. Foundation | 5/5 | Complete | 2026-02-05 |
| 2. Operational Maturity | 4/4 | Complete | 2026-02-05 |
| 4. Client Qualification | 3/3 | Complete | 2026-02-08 |
| 5. Data Dashboard | 4/4 | Complete | 2026-02-08 |
| 3. Production Excellence | 0/TBD | Optional | - |
| **Milestone v2.0** | | | |
| 6. Visual Foundation & Component System | 2/2 | Complete | 2026-02-09 |
| 7. Data Visualization & Charts | 3/3 | Complete | 2026-02-10 |
| 8. Lead Profile & Enhanced Navigation | 5/5 | Complete | 2026-02-10 |
| 9. Polish & Production Readiness | - | Superseded | - |
| **Milestone v3.0** | | | |
| 10. Auth & CRM Foundation | 3/3 | Complete | 2026-02-12 |
| 11. Lead Management & Contact Tracking | 5/5 | Complete | 2026-02-12 |
| 12. Pipeline Kanban | 0/TBD | Not started | - |
| 13. Comissões | 2/2 | Complete | 2026-02-14 |

---
*Roadmap created: 2026-02-04*
*Milestone v1.0 depth: quick (5 phases)*
*Milestone v1.0 coverage: 29/29 v1 requirements mapped*

*Milestone v2.0 added: 2026-02-09*
*Milestone v2.0 depth: quick (4 phases)*
*Milestone v2.0 coverage: 27/27 v2.0 requirements mapped*

*Milestone v3.0 added: 2026-02-11*
*Milestone v3.0 depth: quick (4 phases)*
*Milestone v3.0 coverage: 21/21 v3.0 requirements mapped*
