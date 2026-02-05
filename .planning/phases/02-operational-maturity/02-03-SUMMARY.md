---
phase: "02-operational-maturity"
plan: "03"
subsystem: "monitor"
tags: ["reconciliation", "lineage", "sqlalchemy", "audit", "data-quality"]
completed: "2026-02-05"
duration: "5 min"
---

# Phase 2 Plan 3: Reconciliation and Lineage Summary

## Objective

Implemented reconciliation checks and data lineage tracking for audit trail and zero data loss verification.

**One-liner:** SQLAlchemy-based reconciliation and lineage tracking for data provenance

## Dependency Graph

| Aspect | Details |
|--------|---------|
| **Requires** | Phase 1 foundation (SQLAlchemy models, database.py, loader modules) |
| **Provides** | Reconciliation verification and data lineage tracking modules |
| **Affects** | Future monitoring features (MON-07 pipeline health dashboard, MON-08 data quality reports) |

## Tech Stack Changes

### Added Libraries
- No new libraries added (polars was already in dependencies)

### Patterns Established
- Reconciliation pattern: Source file row count vs DB lineage count comparison
- Lineage pattern: Record-level provenance tracking with SHA256 hash integrity

## Key Files Created/Modified

### Created
| File | Purpose |
|------|---------|
| `src/monitor/reconciliation.py` | reconcile_file(), run_reconciliation(), get_reconciliation_summary() |
| `src/monitor/lineage.py` | record_lineage(), query_lineage(), get_pipeline_version() |

### Modified
| File | Change |
|------|--------|
| `src/loader/db_models.py` | Added DataLineage SQLAlchemy model |
| `src/config.py` | Added alert_on_mismatch configuration setting |

## Decisions Made

### 1. SQLAlchemy over Prisma for DataLineage
**Decision:** Use SQLAlchemy for DataLineage model to maintain consistency with Phase 1 architecture.

**Rationale:**
- Phase 1 already uses SQLAlchemy for all database operations
- Avoids introducing Prisma as a second ORM
- Consistent transaction management and session handling
- Single dependency path for database operations

### 2. Polars for Row Counting
**Decision:** Use Polars for efficient row counting in reconciliation.

**Rationale:**
- Already in project dependencies for data processing
- Significantly faster than pandas for Parquet files
- Lower memory footprint for count operations
- Native Parquet support

## Implementation Details

### DataLineage Model
```python
class DataLineage(Base):
    __tablename__ = "data_lineage"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(index=True)  # proposta, apoiador, etc.
    entity_id: Mapped[str] = mapped_column(index=True)
    source_file: Mapped[str] = mapped_column(index=True)
    extraction_date: Mapped[datetime]
    pipeline_version: Mapped[Optional[str]]
    record_hash: Mapped[Optional[str]]  # SHA256 for integrity
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Reconciliation Workflow
1. Count rows in source Parquet file using Polars
2. Query DataLineage table for records from that source_file
3. Compare counts - alert if mismatch detected
4. Generate human-readable summary

### Lineage Recording
1. Extract entity_id from record (transfer_gov_id or id)
2. Compute SHA256 hash of record content
3. Store with source_file, extraction_date, pipeline_version
4. Bulk insert for efficiency

## Deviations from Plan

**None** - Plan executed exactly as written with SQLAlchemy implementation.

## Verification Results

| Check | Status |
|-------|--------|
| `python -m src.loader.db_models` imports DataLineage | ✅ Pass |
| `python -c "from src.monitor.reconciliation import ..."` | ✅ Pass |
| `python -c "from src.monitor.lineage import ..."` | ✅ Pass |
| Reconciliation module creates ReconciliationResult dataclass | ✅ Pass |
| Lineage module exports record_lineage and query_lineage | ✅ Pass |

## Authentication Gates

**None** - This plan did not require external authentication.

## Next Phase Readiness

### Ready for:
- MON-07: Pipeline health dashboard (can use reconciliation results)
- MON-08: Data quality reports (can use lineage and reconciliation)
- MON-09: Data freshness alerts (can extend lineage tracking)

### Considerations:
- DataLineage table needs migration to existing database
- Reconciliation requires raw Parquet files to exist in data/raw
- Alert on mismatch depends on Telegram bot configuration (already in config)

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 3/3 |
| Files created | 2 |
| Files modified | 2 |
| Lines added | ~500 |
| Duration | ~5 minutes |

## Commits

- `8beebaa` feat(02-03): add DataLineage model to SQLAlchemy db_models
- `5531c47` feat(02-03): create reconciliation module
- `340c513` feat(02-03): create lineage tracking module
