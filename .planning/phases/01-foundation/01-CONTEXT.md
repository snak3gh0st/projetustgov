# Phase 1: Foundation - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete ETL pipeline that extracts 4 files from Transfer Gov daily at 9:15 AM, processes with comprehensive validation, loads to PostgreSQL with enforced relationships, and alerts on failures. Zero data loss guarantee through atomic transactions and multi-layer validation.

</domain>

<decisions>
## Implementation Decisions

### Extraction behavior
- Schedule: 9:15 AM daily (not 9:00 AM - gives Transfer Gov 15min buffer)
- Corrupted/empty file handling: Skip that file, process others (partial extraction acceptable)
- Raw file storage: Claude's discretion (audit capability vs storage trade-offs)
- File storage location: Claude's discretion (logical structure for date-based organization)

### Validation strategy
- Validate all: required columns exist, data types match, no empty files, relationship keys present
- Validation failure behavior: Load valid rows, skip invalid ones (partial load preferred over all-or-nothing)
- Encoding handling: Claude's discretion (auto-detect UTF-8/ISO-8859-1/Windows-1252 with robustness)
- Unexpected new columns: Claude's discretion (balance forward compatibility vs schema drift detection)

### Data relationships
- Orphaned records (missing foreign keys): Claude's discretion (balance data preservation vs referential integrity)
- Database constraints: Foreign keys, unique constraints on IDs, check constraints on data ranges (NOT NULL excluded - allows flexibility for missing data)
- Duplicate handling: Upsert logic - update existing records with new values if same data extracted twice
- Audit trail: Full audit columns (created_at, updated_at, extraction_date) for complete traceability

### Claude's Discretion
- Retry strategy if Transfer Gov is down
- Raw file retention policy (storage duration)
- Directory structure for downloaded files
- Encoding auto-detection fallback chain
- Schema evolution handling (new columns from source)
- Orphaned record resolution strategy

</decisions>

<specifics>
## Specific Ideas

- 9:15 AM extraction time (not 9:00 AM) - gives Transfer Gov system time to stabilize after potential overnight updates
- Partial extraction is acceptable - if one file fails, process the others rather than failing entirely
- Upsert behavior critical - system should handle re-runs gracefully, updating existing data rather than failing on duplicates
- Full audit trail required - need to track when records were created/updated and which extraction produced them

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-04*
