# Pitfalls Research: Web Scraping/ETL Systems

**Domain:** Web Scraping & ETL (Government websites, Excel/CSV parsing, PostgreSQL)
**Researched:** 2026-02-04
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Silent Data Loss from Schema Changes

**What goes wrong:**
Source system changes a column name or structure, but the ETL pipeline continues running without errors. The pipeline silently maps wrong columns, defaults to NULL values, or drops data without raising alarms. Business users discover the issue weeks later when dashboards show incorrect trends.

**Why it happens:**
Most scraping/ETL code uses brittle selectors or column name matching without validation. When source changes (e.g., government site renames "Valor" to "ValorTotal"), the code either fails silently or maps the wrong field. Without schema validation, corrupt data flows into the database appearing "successful."

**How to avoid:**
- Implement pre-ingestion schema validation that fails loudly on unexpected structure
- Use multiple selector fallbacks (CSS class, XPath, text-based) with explicit failure when all fail
- Add row-level validation: if critical fields are NULL, fail the entire batch
- Create data quality checks: compare row counts, sum of values, presence of required fields against historical patterns
- Implement schema fingerprinting: hash the source structure and alert on changes

**Warning signs:**
- Sudden appearance of NULL values in previously populated fields
- Row counts drop but pipeline reports "success"
- Aggregate metrics (sum, average) shift dramatically without business explanation
- Users report "missing data" for recent time periods
- No errors logged despite obvious data issues

**Phase to address:**
**Foundation (Phase 1)** - Build validation layer before any data ingestion. This is architectural; retrofitting is expensive and error-prone.

**Detection strategy:**
- Monitor NULL percentage per column (alert if >5% when historically <1%)
- Track row count per extraction (alert if deviation >20% from rolling average)
- Log schema structure on each run, diff against baseline
- Implement "canary queries" that check for known data patterns

---

### Pitfall 2: No Alerting = Hours of Undetected Failures

**What goes wrong:**
Scraper breaks (site added CAPTCHA, network timeout, server error), pipeline runs "successfully" with zero rows extracted, and no one notices until users complain. By discovery time, you've lost days of data and client trust. 68% of ETL failures need 4+ hours just to detect, with 15-hour average resolution time.

**Why it happens:**
Developers focus on the "happy path" - when scraping works, data flows in. They assume cron/scheduler success means data success. Pipeline exits with code 0 even when extraction yielded nothing. No one implements success criteria beyond "didn't crash."

**How to avoid:**
- Separate process success from data success: return exit code 1 if extracted rows = 0
- Implement multi-channel alerting: Slack/email/SMS when extraction fails, returns empty, or deviates from baseline
- Create heartbeat monitoring: if pipeline hasn't reported success in X hours, alert
- Build a monitoring dashboard showing: last successful run, rows extracted, failures, data quality scores
- Use observability tools (Prometheus + Grafana, New Relic, DataDog) - not just logs
- Implement dead letter queues for failed extractions with automatic retry attempts

**Warning signs:**
- You discover failures by checking logs manually
- Users report missing data before your team notices
- No clear answer to "when did this last run successfully?"
- Failed runs require SSH into server to diagnose
- Team relies on "checking the database" to verify pipeline health

**Phase to address:**
**Foundation (Phase 1)** - Monitoring is not optional for unattended systems. Must be built-in from day 1, not added "when we have time."

**Detection strategy:**
- Daily pipeline health check: rows extracted yesterday > 0 AND > 50% of average
- Alert escalation: Slack → Email → SMS if not acknowledged in 30 min
- Weekly report: success rate, average extraction size, failure patterns
- Synthetic monitoring: test scraper against known-good URL daily

---

### Pitfall 3: Website Structure Changes Break Everything

**What goes wrong:**
Government site redesigns its layout, changes CSS classes, or moves elements in the DOM. Your hardcoded selectors (`div.price`, `#table-row-3`) return nothing. Scraper either fails loudly (good) or silently returns empty (catastrophic). McGill University research (2025) shows traditional scrapers break when page layouts change, while AI methods maintained 98.4% accuracy through changes.

**Why it happens:**
Developers use fragile, single-point-of-failure selectors: exact CSS classes, nth-child selectors, hardcoded IDs. Sites change these constantly without notice. No validation layer confirms extracted data matches expected patterns. No monitoring detects structural changes before extraction fails.

**How to avoid:**
- Use resilient selector strategies: multiple fallback selectors (class → XPath → text-based)
- Implement semantic selectors when possible: find by label text ("Preço:") rather than class name
- Add structural validation: after extraction, verify data format (e.g., price matches `R$ \d+,\d{2}`)
- Create change detection: hash page structure per run, alert on significant deviation
- Build self-healing: when primary selector fails, try fallbacks and log which worked
- Consider AI-powered extraction for high-value, frequently-changing sources (e.g., Kadoa, Apify)
- Version your selectors: keep history of working patterns to diagnose/rollback

**Warning signs:**
- Extraction suddenly returns zero results for previously stable source
- Data validation failures spike (empty fields, wrong format)
- Manual inspection shows data present on site but not in database
- Error logs show "element not found" or timeout errors
- Users report "data stopped updating" for specific sources

**Phase to address:**
**Foundation (Phase 1)** - Selector resilience is architectural. Fragile selectors accumulate as technical debt that's painful to fix later.

**Detection strategy:**
- Schema fingerprint per source: alert when structure hash changes
- Extraction validation: fail if >10% of expected fields are empty
- Weekly visual regression: screenshot key pages, diff against baseline
- Automated recovery: test fallback selectors nightly against known sources

---

### Pitfall 4: Duplicate Data from Non-Idempotent Processes

**What goes wrong:**
Pipeline runs twice (manual re-run, cron misconfiguration, retry after transient failure) and inserts duplicate records. Database grows with redundant data, analytics count the same transaction multiple times, reports show inflated numbers. Without unique constraints, PostgreSQL happily accepts duplicates.

**Why it happens:**
ETL processes are written as append-only: `INSERT INTO ... VALUES`. No deduplication logic, no idempotency keys, no upsert patterns. Developers assume "pipeline runs once per day" so duplicates won't happen. But retries, re-runs, and failures break this assumption.

**How to avoid:**
- Use upsert operations (PostgreSQL `ON CONFLICT ... DO UPDATE`) instead of blind inserts
- Define natural keys or business keys (e.g., `transaction_id + date`) as unique constraints
- Implement idempotency keys: generate unique identifier per extraction batch, track processed batches in database
- Add deduplication logic: before insert, check if record already exists by business key
- Use timestamped staging tables: extract to `raw_data_YYYYMMDD`, validate, then merge to production
- Implement exactly-once semantics: combination of idempotency keys + database constraints
- Add batch tracking table: record start/end time, row count, status per pipeline run

**Warning signs:**
- Database row counts grow faster than expected
- Sum aggregations are higher than business reality
- Duplicate records appear with same business key but different insertion timestamps
- Manual deduplication queries needed regularly
- Users report "inflated numbers" in reports

**Phase to address:**
**Foundation (Phase 1)** - Data integrity is foundational. Retrofitting unique constraints on millions of duplicate rows is a nightmare.

**Detection strategy:**
- Daily duplicate check: `SELECT business_key, COUNT(*) FROM table GROUP BY business_key HAVING COUNT(*) > 1`
- Monitor table growth rate: alert if daily growth exceeds 150% of average
- Audit trail: track pipeline run ID, extraction timestamp per row
- Synthetic test: run pipeline twice against test data, verify no duplicates

---

### Pitfall 5: Encoding Hell from Excel/CSV Files

**What goes wrong:**
Government provides Excel/CSV with UTF-8 data, but your parser assumes ISO-8859-1. Portuguese characters (ç, ã, õ, á) become garbage (Ã§, Ã£). Or Excel mangles the CSV on export, mixing encodings. Data loads into PostgreSQL corrupted, searches fail, reports show gibberish. Users lose trust in data quality.

**Why it happens:**
CSV has no standard encoding declaration - it's a guess. Excel exports vary by locale and version. Brazilian government sites may use UTF-8, ISO-8859-1, or Windows-1252. Python's default encoding differs by platform. Pandas `read_csv()` without explicit encoding parameter guesses wrong. Once in database, corruption persists.

**How to avoid:**
- Always explicitly specify encoding: `pd.read_csv(file, encoding='utf-8')` or try UTF-8-sig for BOM
- Implement encoding detection: use `chardet` library to auto-detect before parsing
- Add fallback chain: try UTF-8 → UTF-8-sig → ISO-8859-1 → Windows-1252
- Validate after parsing: check for replacement characters (�) or suspicious byte sequences
- Store raw files before parsing: preserve original for debugging/reprocessing
- Use PostgreSQL's `COPY` with explicit encoding, not INSERT with string interpolation
- Test with real government data samples during development, not sanitized test data

**Warning signs:**
- Portuguese characters display as � or multi-byte garbage (Ã§)
- Database searches for "São Paulo" return nothing (stored as "SÃ£o Paulo")
- Excel export warnings about "data may be lost"
- Inconsistent encoding across different government sources
- Manual encoding fixes needed for every data load

**Phase to address:**
**Foundation (Phase 1)** - Character encoding must be handled before first data load. Fixing corrupted data in database is nearly impossible.

**Detection strategy:**
- Post-parse validation: scan for � characters, fail if found
- Pattern matching: check for known Portuguese words with correct accents
- Encoding metadata: log detected encoding per file, alert on mismatches
- Manual QA: human review sample records for character corruption

---

### Pitfall 6: Credentials in Code or Config Files

**What goes wrong:**
Developer hardcodes database password in `config.py` or `.env` file, commits to Git, pushes to repository. Credentials leak publicly or to unauthorized team members. Worse, credentials in logs, error messages, or screenshots. Security breach exposes client data, or attacker uses credentials to modify/delete database.

**Why it happens:**
Environment variables seem "good enough" for development. No clear guidance on production credential management. Developers don't realize `.env` files get committed, or logs capture SQL connection strings. Urgency ("just get it working") overrides security. No automated secrets scanning in CI/CD.

**How to avoid:**
- Use managed secret stores: AWS Secrets Manager, Azure Key Vault, Google Secret Manager, or HashiCorp Vault
- Never commit secrets to Git: add `.env`, `credentials.json`, `config.local.*` to `.gitignore` immediately
- Use environment variables for local dev, secret manager for production
- Rotate credentials automatically (30-90 days) - managed services do this
- Implement least-privilege access: database user can only INSERT/UPDATE specific tables, not DROP or DELETE
- Audit access: log who/when/what accessed credentials
- Add pre-commit hooks: use tools like `git-secrets` or `detect-secrets` to scan for leaked credentials
- Document credential management: clear README explaining how to set up secrets locally and in production

**Warning signs:**
- Credentials in any file tracked by Git
- Database connection strings in error logs or stack traces
- `.env` file contains production passwords
- Team shares credentials via Slack or email
- No process for credential rotation
- Same password used across dev/staging/production

**Phase to address:**
**Foundation (Phase 1)** - Security cannot be retrofitted. Once credentials leak, damage is done. Set up secret management before first production deployment.

**Detection strategy:**
- Automated scanning: run `detect-secrets` in CI/CD, fail if secrets found
- Git history audit: scan entire commit history for leaked credentials (use `gitleaks`)
- Access logs: monitor who accessed secret manager, alert on unusual patterns
- Credential rotation testing: verify pipeline works after credential change

---

### Pitfall 7: Lack of Retry Logic for Transient Failures

**What goes wrong:**
Network hiccup, temporary site downtime, or database connection timeout causes extraction to fail. Pipeline exits with error, no retry attempted. Overnight run fails, no data collected, gaps appear in time-series analysis. For R$5k/month client, one failed run = lost revenue and trust.

**Why it happens:**
Developers test in perfect conditions (local network, stable sites). Don't anticipate real-world failures: DNS timeouts, rate limiting, temporary 503 errors, connection pool exhaustion. No distinction between transient (retry-able) and permanent (alert-immediately) failures. Simple scripts lack retry logic frameworks.

**How to avoid:**
- Implement exponential backoff retry: wait 1s, 2s, 4s, 8s, 16s (max 5 attempts) for transient errors
- Distinguish failure types: retry on 429/503/timeout, fail immediately on 401/404
- Use circuit breaker pattern: if failure rate >50% over 10 requests, stop attempting (don't DDoS)
- Add jitter to retries: random delay prevents thundering herd
- Set maximum retry attempts: prevent infinite loops
- Use libraries with built-in retry: `requests.adapters.HTTPAdapter` with retry strategy, `tenacity` decorator
- Implement partial success: if 90% of extractions succeed, process those, alert on 10% failures
- Create retry queue: failed items go to queue for later retry with different strategy

**Warning signs:**
- Pipeline fails completely on single transient error
- Manual re-runs frequently needed
- Success rate <95% despite stable sources
- Failures cluster around specific times (rate limiting window)
- Error logs show timeout/connection errors without retry attempts

**Phase to address:**
**Foundation (Phase 1)** - Retry logic is part of robust foundation. Production systems without retries are brittle toys.

**Detection strategy:**
- Track success rate: alert if <95% over rolling 7 days
- Monitor retry patterns: if retry exhaustion rate >5%, investigate root cause
- Distinguish transient vs. permanent: ratio should guide infrastructure improvements
- Test failure scenarios: simulate timeouts, verify retry logic works

---

### Pitfall 8: No Data Validation = Garbage In, Garbage Out

**What goes wrong:**
Scraper extracts malformed data: negative prices, future dates, missing required fields, wrong data types. No validation layer catches this. Garbage flows into PostgreSQL, triggers downstream failures (analytics break, reports crash), or worse - silently corrupts business metrics. Gartner estimates $12.9M/year organizational losses from bad data.

**Why it happens:**
Developers assume source data is clean. Focus on extraction, not validation. Database accepts any string as VARCHAR, so type violations don't fail. No schema enforcement. No business rule validation (e.g., price must be positive). Quick MVP skips "nice to have" validation.

**How to avoid:**
- Define strict schemas: use Pydantic models or JSON Schema to validate extracted data structure and types
- Implement business rule validation: price > 0, date <= today, required fields not null/empty
- Use database constraints: CHECK constraints, NOT NULL, foreign keys enforce integrity
- Add pre-insert validation layer: parse, validate, fail loudly before database write
- Implement data quality metrics: track % of records failing validation per run
- Use staging-to-production pattern: validate in staging, only promote clean data
- Create data quality tests: pytest fixtures that verify validation catches known bad data
- Log validation failures with examples: helps diagnose source issues

**Warning signs:**
- Database contains impossible values (negative prices, future dates)
- Downstream analytics fail with "division by zero" or type errors
- Manual data cleaning needed regularly
- Business users question data accuracy
- No visibility into what % of extracted data is valid

**Phase to address:**
**Foundation (Phase 1)** - Validation is the gatekeeper for data quality. Must be built before data flows into production.

**Detection strategy:**
- Daily validation report: % passing, common failure modes, examples
- Monitor rejection rate: if >10%, investigate source quality issues
- Schema drift detection: validate against expected schema, alert on new fields/missing fields
- Business rule audits: periodically review rules, add new ones as domain knowledge grows

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded selectors (single CSS path) | Fast development, simple code | Breaks on every site change, high maintenance | Never - always use fallback selectors |
| Skip retry logic | Less code complexity | Brittle pipeline, low success rate | Never for production - acceptable for POC only |
| Blind INSERT instead of UPSERT | Simpler SQL, faster writes | Duplicate data, data integrity issues | Never - unique constraints are mandatory |
| .env file for production secrets | Easy deployment | Security vulnerability, credential leaks | Never for production - only local development |
| No schema validation | Faster extraction pipeline | Silent data corruption, garbage data | Never - validation is table stakes |
| Append-only logs without rotation | No log management code needed | Disk fills up, server crashes | Never - implement log rotation from day 1 |
| Single-threaded extraction | Simple linear code | Slow extraction, wastes time | Acceptable if total runtime <30 min |
| String concatenation for SQL | Quick dynamic queries | SQL injection vulnerability | Never - always use parameterized queries |
| Skip encoding specification | Works on developer's machine | Encoding corruption on different locales | Never - always specify encoding explicitly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Government websites | Assume stable URLs/structure | Use URL health checks, version selectors, monitor for redirects |
| Excel/CSV parsing | Use default encoding (platform-dependent) | Explicitly set encoding (UTF-8-sig), implement detection fallback |
| PostgreSQL writes | Build SQL via string concatenation | Use parameterized queries, ORM (SQLAlchemy), or `psycopg2` parameters |
| CAPTCHA handling | Ignore until it blocks you | Implement human-like delays (1-3s), rotate user agents, use residential proxies |
| Rate limiting | Hammer site with requests until blocked | Implement request throttling (1-2 req/sec), exponential backoff on 429 |
| Network timeouts | Use default timeout (infinite) | Set aggressive timeouts (connect=5s, read=30s), retry on timeout |
| Pandas large files | `read_csv()` entire file into memory | Use `chunksize` parameter for streaming, or `dask` for >1GB files |
| Date parsing | Assume ISO format (YYYY-MM-DD) | Specify `dayfirst=True` for DD/MM/YYYY (Brazil), use `dateutil.parser` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Scraping synchronously | Long runtime (1 hour for 100 pages) | Use async (aiohttp, asyncio) or threading for I/O-bound tasks | >50 pages, runtime >10 min |
| Loading full CSV into memory | Process crashes with MemoryError | Use Pandas `chunksize` or streaming CSV parser | Files >1GB or memory <4GB |
| N+1 database queries | Slow inserts (1 sec per row) | Use batch inserts (INSERT INTO ... VALUES (...), (...), ...) or COPY | >1000 rows per batch |
| No database indexing | Queries slow over time, duplicate checks take minutes | Create indexes on foreign keys, unique constraints, query columns | Table >10k rows |
| Fetching full page for small data | Slow extraction, high bandwidth | Use API if available, or fetch only required sections (if site supports) | Scraping >100 pages/day |
| Logging everything to file | Disk fills up, I/O bottleneck | Use log rotation, log levels (DEBUG local only), centralized logging | Production systems |
| No connection pooling | Connection overhead, rate limiting | Use connection pool (SQLAlchemy pool_size), reuse sessions | >100 requests/hour |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Credentials in code/config files | Credential leak, unauthorized access | Use secret managers (AWS Secrets Manager, Azure Key Vault), never commit secrets |
| SQL injection via string concat | Database compromise, data loss | Use parameterized queries, ORM, never interpolate user/source data into SQL |
| Logging sensitive data | PII exposure, compliance violations | Sanitize logs, never log passwords/tokens/PII, use structured logging |
| No access control on database | Unauthorized modification/deletion | Use least-privilege database users: read-only for queries, insert-only for ETL |
| Running scraper as root/admin | System compromise if code exploited | Use unprivileged user, containerize (Docker), sandbox execution environment |
| No HTTPS verification | Man-in-the-middle attacks | Verify SSL certificates (`verify=True` in requests), don't disable SSL warnings |
| Storing raw passwords | Credential theft if database breached | Hash passwords (never needed for web scraping), store only in secret manager |
| No audit trail | Can't trace unauthorized access | Log all database writes with timestamp, user, batch ID; enable PostgreSQL logging |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces:

- [ ] **Scraper works:** Often missing validation that extracted data is non-empty and matches expected schema - **Verify:** Add assertions for row count >0, required fields present, data types correct

- [ ] **Pipeline "succeeds":** Often missing distinction between process success (exit 0) and data success (rows extracted) - **Verify:** Check exit codes reflect data outcomes, not just "didn't crash"

- [ ] **Extraction tested:** Often missing testing against real production data with encoding issues, malformed rows, structure changes - **Verify:** Test with actual government data downloads, not sanitized samples

- [ ] **Database writes work:** Often missing duplicate detection, referential integrity checks, constraint handling - **Verify:** Attempt duplicate insert, verify unique constraint fires; test foreign key violations

- [ ] **Monitoring "set up":** Often missing alerting on failures, validation failures, or data quality issues - **Verify:** Trigger failure condition, confirm alert fires and reaches team

- [ ] **Credentials "secured":** Often missing rotation strategy, access auditing, or stored in secret manager but accessed insecurely - **Verify:** Credentials not in Git history, automated rotation tested

- [ ] **Error handling implemented:** Often missing retry logic, circuit breakers, or distinguishing transient vs. permanent failures - **Verify:** Simulate network timeout, verify retry logic; simulate 404, verify immediate failure

- [ ] **Logs configured:** Often missing log rotation, structured logging, or appropriate log levels - **Verify:** Let system run for days, check disk usage; verify log rotation configured

- [ ] **Idempotency implemented:** Often missing upsert logic, idempotency keys, or safe re-run capability - **Verify:** Run pipeline twice with same data, verify no duplicates

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover:

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Silent data loss | HIGH (weeks undetected) | 1. Identify when corruption started (schema fingerprints, audit logs) 2. Re-scrape historical data if source allows 3. Notify users of data quality issue for affected time range 4. Implement validation to prevent recurrence |
| Website structure change | MEDIUM (hours to fix) | 1. Check if fallback selectors exist, activate 2. Update primary selectors for new structure 3. Test against current site 4. Deploy fix 5. Backfill missing data 6. Add monitoring for this failure mode |
| Duplicate data | MEDIUM (one-time cleanup) | 1. Identify duplicate records by business key 2. Keep most recent or most complete record 3. Delete duplicates in transaction 4. Add unique constraints 5. Fix ETL to use UPSERT 6. Test re-run safety |
| Encoding corruption | HIGH (hard to fix once stored) | 1. If caught early: fix encoding, re-parse, re-load 2. If widespread: build character mapping repair function 3. Reprocess from raw files with correct encoding 4. Last resort: manual cleanup in database 5. Add encoding validation |
| Credential leak | CRITICAL (immediate action) | 1. Rotate compromised credentials immediately 2. Audit access logs for unauthorized use 3. Scan Git history, if leaked remove with BFG Repo-Cleaner 4. Notify security team 5. Implement secret scanning |
| Failed extraction (no retry) | LOW (just re-run) | 1. Identify failure cause (transient vs. permanent) 2. If transient: re-run pipeline 3. If permanent: fix root cause first 4. Implement retry logic to prevent future occurrences |
| Missing monitoring | MEDIUM (must build before next failure) | 1. Implement basic alerting (failure alerts) 2. Add data quality metrics 3. Create monitoring dashboard 4. Set up escalation paths 5. Test alerting with synthetic failures |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls:

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Silent data loss | Foundation (Phase 1) | Run pipeline, inject schema change, verify loud failure |
| No alerting | Foundation (Phase 1) | Trigger failure, confirm alert received within 5 minutes |
| Website structure changes | Foundation (Phase 1) | Test fallback selectors, verify resilience to DOM changes |
| Duplicate data | Foundation (Phase 1) | Run pipeline twice, verify no duplicates via database query |
| Encoding issues | Foundation (Phase 1) | Parse real government files, verify Portuguese characters correct |
| Credentials in code | Foundation (Phase 1) | Scan Git history, verify no secrets; test secret rotation |
| No retry logic | Foundation (Phase 1) | Simulate network timeout, verify automatic retry |
| No data validation | Foundation (Phase 1) | Inject invalid data, verify rejection before database write |
| Performance bottlenecks | Polish (Phase 3) | Measure runtime, optimize if >30 min for daily extraction |
| Advanced monitoring | Polish (Phase 3) | Add data quality dashboards, anomaly detection, trend analysis |

---

## Sources

**Web Scraping:**
- [DOs and DON'Ts of Web Scraping 2026: Best Practices | Medium](https://medium.com/@datajournal/dos-and-donts-of-web-scraping-e4f9b2a49431)
- [9 Web Scraping Challenges and How to Solve Them | Octoparse](https://www.octoparse.com/blog/9-web-scraping-challenges)
- [6 Web Scraping Challenges & Practical Solutions in 2026](https://research.aimultiple.com/web-scraping-challenges/)
- [Stop Getting Blocked: 10 Common Web-Scraping Mistakes & Easy Fixes](https://www.firecrawl.dev/blog/web-scraping-mistakes-and-fixes)
- [How to Fix Inaccurate Web Scraping Data: 2026 Best Practices](https://brightdata.com/blog/web-data/fix-inaccurate-web-scraping-data)
- [State of Web Scraping 2026: Trends, Challenges & What's Next](https://www.browserless.io/blog/state-of-web-scraping-2026)
- [Web Scraping Best Practices and Tools 2026 - ZenRows](https://www.zenrows.com/blog/web-scraping-best-practices)
- [How to Build an E-Commerce Scraper That Survives a Website Redesign | Medium](https://medium.com/@hasdata/how-to-build-an-e-commerce-scraper-that-survives-a-website-redesign-86216e96cbd9)
- [How AI Is Changing Web Scraping in 2026 · Kadoa](https://www.kadoa.com/blog/how-ai-is-changing-web-scraping-2026)

**ETL & Data Quality:**
- [5 Critical ETL Pipeline Design Pitfalls to Avoid in 2026](https://airbyte.com/data-engineering-resources/etl-pipeline-pitfalls-to-avoid)
- [ETL Error Handling and Monitoring Metrics — 25 Statistics Every Data Leader Should Know in 2026 | Integrate.io](https://www.integrate.io/blog/etl-error-handling-and-monitoring-metrics/)
- [Data Validation in ETL - 2026 Guide | Integrate.io](https://www.integrate.io/blog/data-validation-etl/)
- [Why Your ETL Pipeline Works in Dev but Fails in Production | Medium](https://medium.com/@gankur277/why-your-etl-pipeline-works-in-dev-but-fails-in-production-62abfda06d46)
- [Silent Failures in Data Pipelines: Why They're So Dangerous | Medium](https://medium.com/@chu.ngwoke/silent-failures-in-data-pipelines-why-theyre-so-dangerous-7c3c2aff8238)
- [Understanding Idempotency: A Key to Reliable and Scalable Data Pipelines | Airbyte](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [How to make your data pipeline idempotent | Medium](https://medium.com/@iamanjlikaur/ensuring-idempotency-in-data-ingestion-pipelines-33301cf917fb)

**File Parsing:**
- [5 CSV File Import Errors (and How to Fix Them Quickly)](https://ingestro.com/blog/5-csv-file-import-errors-and-how-to-fix-them-quickly)
- [Fix CSV File Encoding Issues in Excel | Zhenye Dong's Blog](https://dongzhenye.com/en/article/solved-fix-csv-file-encoding-issues-excel)
- [Fixing CSV Files with Data Parsing Errors Using a LLM | Medium](https://medium.com/data-science-collective/fixing-csv-files-with-data-parsing-errors-using-a-llm-012470c31fbb)

**Security & Credentials:**
- [Mastering ETL Security: Challenges and Solutions | Hevo](https://hevodata.com/learn/factors-to-ensure-etl-security/)
- [Secure credential management for ETL workloads using Azure Key Vault and Data Factory | Microsoft Azure Blog](https://azure.microsoft.com/en-us/blog/secure-credential-management-for-etl-workloads-using-azure-data-factory-and-azure-key-vault/)
- [Top 11 Secure Storage Best Practices in 2026 | NetApp](https://www.netapp.com/learn/top-11-secure-storage-best-practices-2026/)

**Database & Integrity:**
- [Why Referential Data Integrity Is So Important (with Examples)](https://www.montecarlodata.com/blog-how-to-maintain-referential-data-integrity/)
- [Understanding PostgreSQL Data Integrity](https://www.dbvis.com/thetable/understanding-postgresql-data-integrity/)
- [Referential Integrity Constraint: Key to Reliable Databases](https://www.acceldata.io/blog/why-referential-integrity-constraints-are-vital-for-data-accuracy)

**Monitoring & Observability:**
- [Building a Production Ready Observability Stack: The Complete 2026 Guide | Medium](https://medium.com/@krishnafattepurkar/building-a-production-ready-observability-stack-the-complete-2026-guide-9ec6e7e06da2)
- [15 Best Observability Tools in DevOps for 2026](https://spacelift.io/blog/observability-tools)

---

*Pitfalls research for: Transfer Gov Automation (Web Scraping/ETL System)*
*Researched: 2026-02-04*
