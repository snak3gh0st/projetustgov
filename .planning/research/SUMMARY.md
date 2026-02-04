# Project Research Summary

**Project:** PROJETUS — Transfer Gov Automation
**Domain:** Web Scraping / ETL Automation for Government Data
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

PROJETUS is a daily ETL pipeline that scrapes Brazilian government data from the Transfer Gov portal, processes 4 Excel/CSV files with complex relationships, and loads them into PostgreSQL for SQL exploration. The research reveals this is a classic production web scraping problem with well-established patterns: authenticated browser automation (Playwright), robust data processing (Polars), and reliable database persistence (PostgreSQL + SQLAlchemy). The recommended stack is modern Python 3.11+ with battle-tested libraries optimized for ETL workloads.

The critical success factor is 100% reliability — "no data loss" is the core value proposition. Research identified 8 critical pitfalls that destroy reliability, with silent data loss from schema changes being the most dangerous (weeks of corrupt data before detection). The architecture must prioritize validation at every stage, implement idempotent operations for safe retries, and alert immediately on failures. The good news: at 11 proposals/day, this is a tiny-scale problem that doesn't need distributed systems, microservices, or complex orchestration — a simple monolithic Python script with proper error handling will suffice.

The biggest risk is over-engineering. Research shows 4 common anti-patterns: premature microservices, real-time streaming (when source updates daily), complex AI extraction (when government sites are stable), and dashboard-first development (when first use is SQL exploration). The winning strategy is to build a robust foundation with validation, retries, alerting, and deduplication in Phase 1, then add operational improvements (lineage tracking, dry-run mode, configuration management) only after production experience reveals actual pain points.

## Key Findings

### Recommended Stack

Modern Python ETL stack optimized for reliability and speed. All versions verified via web search (not training data). Key insight: Polars is 5-10x faster than Pandas for ETL workloads with 30-60% less memory usage, making it ideal for processing complex Excel relationships. Playwright beats Selenium on every metric: 80x faster setup, direct browser protocol, Microsoft-backed with native async support.

**Core technologies:**
- **Python 3.11+**: Industry standard for ETL (51% adoption), mature ecosystem, 10-60% performance improvements over 3.10
- **Playwright 1.58+**: Browser automation for authenticated scraping, auto-downloads browsers, production-ready with async support
- **Polars 2.x**: Data processing 5-10x faster than Pandas, 30-60% less memory, perfect for complex CSV/Excel relationships
- **SQLAlchemy 2.0+**: Industry standard ORM with full ACID guarantees, async-ready, type-hinted, seamless PostgreSQL integration
- **PostgreSQL 15+**: Rock-solid ACID compliance for zero data loss, free, open-source, excellent Python ecosystem
- **Pydantic 2.13+**: Rust-core validation (fastest available), type-safe schemas, catches data anomalies before DB insertion
- **Loguru 0.7+**: Zero-config production logging with automatic JSON output, faster than stdlib logging
- **Tenacity 8.5+**: Exponential backoff retry logic for network failures, critical for production reliability
- **APScheduler 3.11+**: Cron-style scheduling with persistent job store, lightweight alternative to Airflow for single daily job

**What NOT to use:**
- Scrapy (overkill for 4-file download, built for massive crawling)
- Beautiful Soup (cannot handle JavaScript-rendered content)
- Pandas (5-10x slower than Polars, 2-3x more memory)
- Airflow (distributed orchestration overkill for single job/day)

### Expected Features

Research synthesized production best practices from 15+ industry sources. Key finding: 11 "table stakes" features are mandatory for "100% reliable daily extraction" — missing any creates data loss risk. The complexity budget is tight: need to simplify 3 features (defer alerting details, simplify auth, basic deduplication first) to stay under 60 complexity points in Phase 1.

**Must have (table stakes):**
- Authentication & Login — required for protected government portal, session-based with auto re-auth
- Automated File Download — core capability, handle XLS/XLSX/CSV formats with verification
- Data Parsing & Transformation — Excel/CSV to structured format with column mapping and type conversion
- PostgreSQL Storage — persist with relationships for SQL exploration, batch inserts for performance
- Retry Logic with Exponential Backoff — handle 429/500/502/503/504 errors, 3-5 retries with exponential delay
- Error Logging — structured logs with context (timestamp, error type, source) and appropriate levels
- Scheduled Execution — daily 9am automation, reliable and timezone-aware
- Alerting on Failure — email/Slack/Telegram alerts on extraction, parsing, or DB failures with error context
- Data Validation (Schema) — verify column presence, data types, required fields before DB write
- Deduplication Logic — prevent duplicate records via unique constraints and upsert patterns (INSERT...ON CONFLICT)
- Atomic Transactions — all-or-nothing inserts with rollback on error to maintain data integrity

**Should have (after validation, v1.x):**
- Reconciliation Checks — compare source row counts vs DB inserts, alert on mismatch
- Data Lineage Tracking — store source file, extraction timestamp, pipeline version per record
- Configuration Management — externalize column mappings and validation rules to YAML/JSON
- Dry Run Mode — preview extracted data and validate transformations without affecting production
- Historical Audit Trail — store run metadata (start/end, records processed, errors) for debugging

**Defer (v2+):**
- Data Quality Metrics Dashboard — only valuable after users are actively monitoring (3+ months of baseline)
- Anomaly Detection — requires historical patterns, only build after scale/complexity demands it
- Automatic Failure Recovery — checkpoint mechanism is complex, only build if failures become frequent
- Parallel Processing — 4 files/day is tiny, serial processing is fine unless runtime exceeds 30 minutes

**Anti-features (commonly requested but problematic):**
- Real-time Streaming — Transfer Gov updates daily, not continuously; streaming adds complexity with no business value
- Complex UI Dashboard — premature before data model stabilizes; start with structured logs and email alerts
- Multi-Source Support — YAGNI, only one source now; hard-code for Transfer Gov, refactor when second source appears
- AI/ML-Powered Extraction — government portal structure is stable; explicit parsers are more reliable and debuggable

### Architecture Approach

Production web scraping/ETL systems in 2026 follow microservices patterns with clear separation between crawling, parsing, transformation, loading, and orchestration. However, at 11 proposals/day (tiny scale), research strongly recommends starting with a monolithic Python service. Only split into microservices if adding more data sources or hitting performance limits (>30 min runtime).

**Major components:**
1. **Crawler** — Playwright browser automation for login, navigation, and file download to temp/raw/{jobId}/. Handles session management and implements retry logic. Testable with mock pages.
2. **Parser** — Pure functions transform Excel/CSV bytes to typed objects (Proposta[], Apoiador[], Emenda[], Programa[]). No I/O, fully unit testable. Uses Polars for 5-10x speed advantage.
3. **Transformer** — Business logic layer for validation (Pydantic schemas), relationship linking (proposta_id → apoiador_id), deduplication (content hashing), and format normalization. Isolated from I/O.
4. **Loader** — Database interface with connection pooling, idempotent upserts (ON CONFLICT DO UPDATE), atomic transactions. Can switch databases without touching business logic.
5. **Orchestrator** — Coordinates components through stages (crawl → parse → transform → load) with checkpoint-based resumption. Handles retries and cross-cutting concerns. Triggered by APScheduler at 9am daily.
6. **Monitor** — Structured logging (Loguru) and alerting (Telegram). All components emit JSON logs with context. Success/failure notifications.

**Key architectural patterns:**
- **Store-Then-Transform**: Save raw downloaded files before parsing, keep for 7-30 days for reprocessing when parser changes
- **Checkpoint-Based Resumption**: Track progress at each stage, resume from last successful checkpoint on failure
- **Idempotent Loads**: Use upserts with unique keys so running same load multiple times produces same result
- **Content Hash Deduplication**: Generate hash of content (not just ID) to detect true duplicates even with different identifiers

**Anti-patterns to avoid:**
- Parse and discard raw files (can't reprocess when parser breaks or site structure changes)
- Synchronous pipeline without checkpoints (network hiccup forces re-download of everything)
- INSERT without deduplication (re-running creates duplicates, hard to clean up)
- Silent failures (discover pipeline broken days later when users complain)
- Hardcoded configuration (can't deploy to different environments, secrets leak into git)

### Critical Pitfalls

Research identified 8 critical pitfalls from production systems, with 68% of ETL failures taking 4+ hours just to detect and 15-hour average resolution time. Top priority: prevent silent data loss and ensure immediate failure detection. All critical pitfalls must be addressed in Foundation (Phase 1) — retrofitting is expensive and error-prone.

1. **Silent Data Loss from Schema Changes** — Source system changes column name, pipeline continues without errors but maps wrong fields or defaults to NULL. Users discover weeks later. Prevention: pre-ingestion schema validation that fails loudly, schema fingerprinting with alerts on changes, row-level validation (critical fields NULL = fail batch), data quality checks (row counts, sum of values vs historical patterns).

2. **No Alerting = Hours of Undetected Failures** — Scraper breaks (CAPTCHA added, network timeout, server error), pipeline exits with code 0 showing "success" with zero rows extracted. Users complain days later. Prevention: separate process success from data success (return exit 1 if rows = 0), multi-channel alerting (Slack/email/SMS), heartbeat monitoring, monitoring dashboard (last successful run, rows extracted, data quality scores).

3. **Website Structure Changes Break Everything** — Government site redesigns layout, changes CSS classes, moves DOM elements. Hardcoded selectors return nothing. Prevention: resilient selector strategies (multiple fallbacks: class → XPath → text-based), semantic selectors (find by label text not class name), structural validation after extraction, change detection (hash page structure, alert on deviation), version selectors for rollback.

4. **Duplicate Data from Non-Idempotent Processes** — Pipeline runs twice (manual re-run, cron misconfiguration, retry after failure), inserts duplicate records. Database grows with redundant data, analytics count same transaction multiple times. Prevention: use upsert operations (ON CONFLICT DO UPDATE), define natural/business keys as unique constraints, implement idempotency keys per batch, track processed batches in database.

5. **Encoding Hell from Excel/CSV Files** — Government provides files with UTF-8 data but parser assumes ISO-8859-1. Portuguese characters (ç, ã, õ, á) become garbage (Ã§, Ã£). Prevention: always explicitly specify encoding (utf-8), implement encoding detection (chardet library), add fallback chain (UTF-8 → UTF-8-sig → ISO-8859-1 → Windows-1252), validate after parsing for replacement characters (�), store raw files before parsing.

6. **Credentials in Code or Config Files** — Developer hardcodes database password in config.py or .env, commits to Git. Credentials leak publicly or security breach exposes client data. Prevention: use managed secret stores (AWS Secrets Manager, Railway env vars), never commit secrets to Git (.env in .gitignore immediately), rotate credentials automatically (30-90 days), implement least-privilege access, add pre-commit hooks (git-secrets, detect-secrets).

7. **Lack of Retry Logic for Transient Failures** — Network hiccup, temporary site downtime, or database timeout causes extraction to fail. Pipeline exits with error, no retry attempted. Overnight run fails, gaps appear in time-series. Prevention: exponential backoff retry (wait 1s, 2s, 4s, 8s, 16s max 5 attempts), distinguish failure types (retry 429/503/timeout, fail immediately on 401/404), circuit breaker pattern (if failure rate >50% over 10 requests, stop attempting), add jitter to prevent thundering herd.

8. **No Data Validation = Garbage In, Garbage Out** — Scraper extracts malformed data (negative prices, future dates, missing required fields). No validation layer catches this. Garbage flows into PostgreSQL, triggers downstream failures or silently corrupts business metrics. Gartner estimates $12.9M/year organizational losses from bad data. Prevention: define strict schemas (Pydantic models), implement business rule validation (price > 0, date <= today), use database constraints (CHECK, NOT NULL, foreign keys), add pre-insert validation layer.

## Implications for Roadmap

Based on combined research, I recommend a 3-phase structure with emphasis on getting the foundation absolutely right before adding operational improvements. The research is clear: 100% of critical pitfalls must be addressed in Phase 1, as they are architectural concerns that are expensive to retrofit.

### Phase 1: Foundation — Reliable Daily Extraction
**Rationale:** All 11 table stakes features + all 8 critical pitfall preventions must be in place before production. This is not negotiable for "100% reliable daily extraction." Any missing piece creates data loss risk. Research shows 68% of ETL failures take 4+ hours to detect — monitoring is not a "nice to have."

**Delivers:** Working end-to-end pipeline that extracts 4 files from Transfer Gov daily at 9am, processes with validation, loads to PostgreSQL with relationships, and alerts on failures. Data flows reliably from source to database with zero data loss guarantee.

**Addresses (from FEATURES.md):**
- Authentication & Login with session management
- Automated File Download with retry logic
- Data Parsing & Transformation (Excel/CSV to typed objects)
- PostgreSQL Storage with relationships and indices
- Retry Logic with Exponential Backoff (5 attempts, 1-16s wait)
- Error Logging (structured JSON with context)
- Scheduled Execution (APScheduler at 9am daily)
- Basic Alerting (Telegram on failure — simplified to stay under complexity budget)
- Data Validation (Pydantic schemas, required fields, type checking)
- Basic Deduplication (unique constraints on business keys)
- Atomic Transactions (BEGIN/COMMIT/ROLLBACK)

**Avoids (from PITFALLS.md):**
- Silent data loss via schema validation that fails loudly on unexpected structure
- Website structure changes via fallback selectors (CSS → XPath → text-based)
- Duplicate data via unique constraints on business keys (full upsert in Phase 2)
- Encoding corruption via explicit UTF-8 specification with chardet fallback
- Credentials leaking via Railway env vars (or AWS Secrets Manager if Oracle Cloud)
- Retry-less failures via tenacity with exponential backoff
- Garbage data via Pydantic validation before DB write
- Undetected failures via Telegram alerts on extraction/parsing/DB errors

**Uses (from STACK.md):**
- Python 3.11+ as primary language
- Playwright 1.58+ for browser automation
- Polars 2.x for fast Excel/CSV parsing
- SQLAlchemy 2.0+ for ORM layer
- PostgreSQL 15+ for relational storage
- Pydantic 2.13+ for validation
- Loguru 0.7+ for logging
- Tenacity 8.5+ for retries
- APScheduler 3.11+ for scheduling
- openpyxl 3.1.4+ for Excel parsing
- psycopg 3.x for PostgreSQL driver

**Implements (from ARCHITECTURE.md):**
- Crawler component (Playwright auth + download)
- Parser component (Polars Excel/CSV → typed objects)
- Transformer component (Pydantic validation + basic deduplication)
- Loader component (SQLAlchemy upserts + transactions)
- Orchestrator component (stage coordination, no checkpoints yet)
- Monitor component (Loguru structured logs + Telegram alerts)

**Complexity simplifications:**
- Defer advanced alerting (email/Slack) to Phase 2 — start with basic Telegram notifications only
- Simplify authentication — use Playwright's built-in session persistence, not custom session manager
- Basic deduplication — PRIMARY KEY constraints, defer full upsert logic (ON CONFLICT) to Phase 2

**Estimated duration:** 1-2 weeks (research says 2 days per major component: auth, extraction, parsing, database, orchestration)

### Phase 2: Polish — Operational Improvements
**Rationale:** After 1-2 weeks of production experience, real pain points emerge. Research shows this is the right time to add: reconciliation checks (when first data loss incident or audit requirement appears), configuration management (when source structure changes require updating hard-coded logic), data lineage (when users ask "where did this data come from?"). Don't build these speculatively — wait for actual operational need.

**Delivers:** More maintainable and debuggable system. Easier to adapt to source changes. Full confidence in data accuracy via reconciliation. Complete audit trail for compliance.

**Addresses (from FEATURES.md):**
- Advanced Alerting (email/Slack channels, escalation paths)
- Reconciliation Checks (source row count vs DB inserts, alert on mismatch)
- Configuration Management (externalize column mappings to YAML/JSON)
- Data Lineage Tracking (source_file, extracted_at, pipeline_version metadata columns)
- Dry Run Mode (preview extractions without affecting production DB)
- Historical Audit Trail (job_state table: start/end, records processed, errors)
- Smart Retry Strategy (different behavior for network errors vs rate limits vs auth errors)
- Full Upsert Logic (ON CONFLICT DO UPDATE moved from Phase 1 simplification)

**Implements (from ARCHITECTURE.md):**
- State Manager component (job_state table, checkpoint persistence)
- Enhanced Orchestrator (checkpoint-based resumption, failure recovery)
- Reconciliation module (compare expected vs actual row counts)
- Configuration loader (YAML/JSON parsing, hot reload)

**Estimated duration:** 1-2 weeks (incremental improvements based on production feedback)

### Phase 3: Scale — Future Enhancements
**Rationale:** Only build when operational pain justifies complexity investment. Research is clear: DO NOT build these speculatively. Triggers: (1) Data Quality Dashboard when manual SQL queries for metrics become tedious, (2) Anomaly Detection when 3+ months of baseline exists, (3) Automatic Recovery when manual intervention becomes bottleneck, (4) Parallel Processing when runtime exceeds 30 minutes.

**Delivers:** Advanced monitoring, self-healing capabilities, performance optimization.

**Addresses (from FEATURES.md):**
- Data Quality Metrics Dashboard (completeness %, freshness, row counts vs baseline)
- Anomaly Detection (rule-based thresholds, alert on volume drop, schema drift)
- Automatic Failure Recovery (full checkpoint mechanism, resume from last successful step)
- Parallel Processing (concurrent file processing, batch inserts in parallel)
- Version Control Integration (link pipeline runs to code version, rollback capability)
- Multi-Stage Validation (layered checks: file structure → data types → business rules)

**Trigger conditions:**
- Dashboard when: Users actively monitoring data, SQL queries for metrics become tedious
- Anomaly Detection when: 3+ months of historical baseline data exists
- Auto Recovery when: Manual intervention becomes bottleneck, failures are frequent (>5% of runs)
- Parallel Processing when: Runtime exceeds 30 minutes (currently 11 proposals/day won't hit this)

**Estimated duration:** Only as needed, not pre-scheduled

### Phase Ordering Rationale

**Why Foundation comes first:**
- Research shows all 8 critical pitfalls must be addressed before production (they're architectural, not incremental)
- 11 table stakes features are mandatory for "100% reliable" requirement
- Without validation + retry + alerting, system creates data loss risk from day 1
- Crawler → Parser → Transformer → Loader dependency chain requires sequential development
- Can't test orchestration until individual components work

**Why Polish comes second:**
- Builds on working foundation with incremental improvements
- Requires production experience to know which improvements matter (not speculative)
- Features like reconciliation checks and lineage tracking are valuable but not launch-blocking
- Configuration management becomes important after first source structure change
- Full upsert logic (moved from Phase 1 for complexity budget) completes deduplication

**Why Scale is deferred:**
- Current volume (11 proposals/day) doesn't justify these features
- Anomaly detection requires 3+ months of baseline (can't build on day 1)
- Data quality dashboard premature before users actively monitor (research: build when SQL queries tedious)
- Automatic recovery complex (checkpoint mechanism), only build if failures frequent
- Parallel processing unnecessary unless runtime >30 minutes (won't happen at current volume)

**Grouping logic:**
- Foundation: Everything needed for zero data loss guarantee (core value prop)
- Polish: Everything that makes system easier to operate and debug (operational maturity)
- Scale: Everything for advanced monitoring and performance (future optimization)

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 1 (Foundation):** Minimal additional research needed. Stack, architecture, and pitfall prevention are well-documented with established patterns. Only potential gap: Transfer Gov's actual authentication flow (may need to inspect site during implementation to confirm login selectors and session management).

- **Phase 2 (Polish):** No additional research expected. Configuration management, lineage tracking, and reconciliation are standard ETL patterns covered in architecture research. All features have clear implementation paths.

- **Phase 3 (Scale):** Anomaly detection might need research if implemented (ML-based vs rule-based thresholds, time-series analysis libraries). But this phase is triggered by need, not pre-scheduled, so research can happen later.

**Phases with standard patterns (skip research-phase):**

- **All phases:** Architecture research covered all necessary patterns. Store-then-transform, checkpoint-based resumption, idempotent loads, and content hash deduplication are all well-documented. Stack research confirmed all library versions and compatibility. No esoteric domains or niche technologies requiring specialized research.

**Single deep-dive needed:**
- Transfer Gov authentication flow (inspect during Phase 1 implementation): Confirm login form fields, session cookie names, re-authentication triggers. This is site-specific, can't be researched generically. Budget 2-4 hours for this during crawler development.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via web search (not training data). Playwright 1.58.0, Polars 2.x, SQLAlchemy 2.0+, PostgreSQL 15+, Pydantic 2.13+ all confirmed from official docs and PyPI. Compatibility matrix verified (SQLAlchemy 2.0 + psycopg 3.x, Polars + PyArrow 15+). |
| Features | HIGH | Synthesized from 15+ production best practices sources. 11 table stakes features validated across multiple sources (web scraping production guides, ETL automation articles, data quality testing resources). Feature dependencies mapped and complexity budget calculated. |
| Architecture | HIGH | Based on current 2026 production practices from official documentation (Scrapy architecture, Airbyte patterns, ETL frameworks). Component separation, interface contracts, and anti-patterns all verified from multiple sources. Scaling thresholds (0-100 proposals/day = monolith) grounded in real-world performance data. |
| Pitfalls | HIGH | Drawn from production failure reports, industry statistics (68% of ETL failures need 4+ hours to detect, Gartner $12.9M/year bad data losses), and 2026 best practices guides. All 8 critical pitfalls have documented prevention strategies and recovery costs. |

**Overall confidence:** HIGH

Research is comprehensive and grounded in verified 2026 sources. Stack recommendations based on official documentation and PyPI version verification. Feature priorities derived from production best practices across 15+ industry sources. Architecture patterns validated against current production systems. Pitfalls drawn from real failure reports with documented statistics.

### Gaps to Address

**During implementation (not blocking):**
- Transfer Gov's specific authentication flow (inspect during Phase 1): Confirm login form fields, session cookie persistence mechanism, re-authentication triggers. Budget 2-4 hours for site inspection during crawler development.

- Excel/CSV file structure from Transfer Gov (inspect actual files): Research describes general Excel/CSV parsing, but Transfer Gov's specific column names, sheet names, file formats need validation with real downloaded files. Can extract schema on first successful download.

- Relationship keys between 4 files (validate during parsing): Research assumes "IDs/chaves claros entre entidades" per PROJECT.md, but actual foreign key structure needs confirmation from real data. Likely: proposta_id, apoiador_id, emenda_id, programa_id. Verify during transformer development.

**None of these gaps block roadmap creation.** They're implementation details that emerge during development, not strategic decisions. Roadmap structure (3 phases, features per phase) is solid based on research.

## Sources

### Stack Research (STACK.md)
- **Primary (HIGH confidence):** Playwright official docs, SQLAlchemy 2.0 docs, Polars GitHub releases, Pydantic PyPI, PostgreSQL docs — all versions verified
- **Secondary (MEDIUM confidence):** Performance comparisons (Pandas vs Polars 5-10x benchmarks, Playwright vs Selenium 80x faster setup), stack pattern guides (Docker multi-stage builds, ETL best practices)

### Feature Research (FEATURES.md)
- **Primary (HIGH confidence):** State of Web Scraping 2026 (Browserless), ETL error handling statistics (Integrate.io, 68% 4+ hour detection time), data quality guides (Monte Carlo Data, TestingXperts)
- **Secondary (MEDIUM confidence):** Production best practices (ScrapingOps monitoring, Scrapy deployment guides), competitor analysis (Scrapy vs Airbyte patterns)

### Architecture Research (ARCHITECTURE.md)
- **Primary (HIGH confidence):** Scrapy architecture docs (component separation), ETL frameworks 2026 guide (Integrate.io, Matillion), idempotency patterns (Airbyte)
- **Secondary (MEDIUM confidence):** Web scraping infrastructure (GroupBWT, state management patterns), production observability (2026 observability stack guide)

### Pitfalls Research (PITFALLS.md)
- **Primary (HIGH confidence):** ETL error handling statistics (68% failures, 15-hour resolution), silent failure dangers (Medium, Airbyte), Gartner bad data cost ($12.9M/year), idempotency importance (Airbyte, Medium)
- **Secondary (MEDIUM confidence):** Web scraping challenges (9 challenges Octoparse, 6 challenges AIMmultiple, 10 mistakes Firecrawl), encoding issues (CSV import errors Ingestro, Excel encoding fixes)

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
