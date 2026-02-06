# Roadmap: PROJETUS Transfer Gov Automation

## Overview

PROJETUS delivers 100% reliable automated extraction of Transfer Gov data through three focused phases. Phase 1 establishes the complete ETL pipeline with all critical pitfall preventions (zero data loss guarantee). Phase 2 adds operational maturity with advanced monitoring and configuration management. Phase 3 provides optional production excellence features triggered by operational need. The journey prioritizes urgency (ASAP delivery) and reliability (no silent failures) over premature optimization.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Complete ETL pipeline with zero data loss guarantee
- [ ] **Phase 2: Operational Maturity** - Advanced monitoring, reconciliation, configuration management
- [ ] **Phase 3: Production Excellence** - Optional enhancements triggered by operational need
- [ ] **Phase 4: Data Dashboard** - Streamlit dashboard for visualizing extracted Transfer Gov data

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

**Plans**: TBD (to be determined during plan-phase)

Plans:
- [ ] TBD during planning

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

**Plans**: 4 plans created

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

**Plans**: TBD (only planned when triggered)

Plans:
- [ ] TBD when operational need emerges

### Phase 4: Data Dashboard
**Goal**: Build a Streamlit dashboard that visualizes all extracted Transfer Gov data — propostas, programas, apoiadores, and emendas — with row counts, extraction history, data freshness, and drill-down views. Provides operational visibility without writing SQL queries.

**Depends on**: Phase 1 (needs data in PostgreSQL)

**Success Criteria** (what must be TRUE):
  1. Dashboard displays row counts per entity table (programas, propostas, apoiadores, emendas)
  2. Extraction history shows last 30 days of pipeline runs with status (success/partial/failed)
  3. Data tables are browsable with search, sort, and filter capabilities
  4. Dashboard shows data freshness (last extraction date and time)
  5. Propostas can be explored with related programas, apoiadores, and emendas
  6. Dashboard is deployable on Railway alongside the existing API service
  7. Portuguese characters render correctly throughout the dashboard

**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Dashboard foundation: Streamlit app structure, DB queries, shared components, home overview page
- [ ] 04-02-PLAN.md — Entity pages: Propostas, Programas, Apoiadores, Emendas with cross-filtering and CSV export
- [ ] 04-03-PLAN.md — Extraction history page and Railway deployment configuration
- [ ] 04-04-PLAN.md — Human verification of complete dashboard

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-02-05 |
| 2. Operational Maturity | 4/4 | Complete | 2026-02-05 |
| 3. Production Excellence | 0/TBD | Not started | - |
| 4. Data Dashboard | 0/4 | Planning complete | - |

---
*Roadmap created: 2026-02-04*
*Depth: quick (3 phases)*
*Coverage: 29/29 v1 requirements mapped*
