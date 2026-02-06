# Phase 3: Production Excellence - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Advanced capabilities for self-healing, performance optimization, and data quality monitoring. Each capability is trigger-based — built only when operational pain justifies the complexity. Dashboard for data quality visibility, anomaly detection for early problem identification, checkpoint/resume for failure recovery, and parallel processing for performance scaling.

</domain>

<decisions>
## Implementation Decisions

### Data quality dashboard
- Web page served by existing FastAPI app — accessible via browser
- Essential metrics only: row counts per table, last extraction time, success/fail status
- Shows last 30 days of history for trend spotting
- Auto-refresh behavior: Claude's discretion

### Anomaly detection
- Full detection scope: volume deviations + schema changes + suspicious value patterns (all nulls, unexpected duplicates)
- Alerts delivered both via push (Telegram/email) and shown on dashboard
- Baseline approach: Claude's discretion (rolling average vs fixed snapshot)
- Severity and pipeline blocking behavior: Claude's discretion

### Failure recovery
- Checkpoint granularity: Claude's discretion (per-stage vs per-file)
- Retry strategy: Claude's discretion (count and backoff approach)
- Cache vs re-download on resume: Claude's discretion
- Resume mode: both automatic (retry at next scheduled time from checkpoint) and manual (CLI command to resume anytime)

### Performance scaling
- Parallelization strategy: Claude's discretion (parallel files vs parallel chunks)
- Soft timeout with alert — pipeline keeps running but alerts if duration exceeds threshold
- Progress reporting approach: Claude's discretion
- Parallelization activation mode: Claude's discretion (always-on vs threshold-based)

### Claude's Discretion
- Dashboard auto-refresh interval
- Anomaly baseline method (rolling average vs fixed snapshot)
- Anomaly severity levels and which block the pipeline
- Checkpoint granularity (per-stage vs per-file)
- Retry count and backoff strategy
- Cache reuse vs re-download on resume
- Parallelization strategy and activation mode
- Progress reporting method (logs vs dashboard live view)

</decisions>

<specifics>
## Specific Ideas

- Phase is trigger-based: dashboard when SQL queries for metrics become tedious, anomaly detection when 3+ months baseline exists, auto-recovery when >5% runs fail, parallelization when runtime exceeds 30 minutes
- Dashboard should integrate with existing FastAPI health check endpoint architecture
- Anomaly alerts should use the same Telegram + email channels from Phase 2

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-production-excellence*
*Context gathered: 2026-02-05*
