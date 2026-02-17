# Codebase Concerns

**Analysis Date:** 2026-02-17

## Tech Debt

**Large component files with mixed responsibilities:**
- Issue: Multiple frontend pages exceed 500+ lines with state management, business logic, and rendering mixed together
- Files: `web/src/app/leads/page.tsx` (546 lines), `web/src/app/page.tsx` (529 lines), `web/src/app/distribuir/page.tsx` (576 lines), `web/src/components/LeadSlideOver.tsx` (431 lines)
- Impact: Hard to test, reuse, and maintain. Changes to one concern risk breaking others.
- Fix approach: Extract state management to custom hooks, separate business logic from rendering, create smaller focused components.

**Monolithic API endpoint for repository sync:**
- Issue: `web/src/lib/repo-sync.ts` is 831 lines handling ZIP download, CSV parsing, data enrichment, database upsert, and BrasilAPI calls in one function
- Files: `web/src/lib/repo-sync.ts`
- Impact: Difficult to test individual steps, hard to debug failures, timeout risks on large syncs, poor separation of concerns
- Fix approach: Break into modules: `ZipDownloader`, `CSVParser`, `DataEnricher`, `DatabaseUpserter`, `BrasilAPIClient`. Each handles one concern.

**Inconsistent error handling across client code:**
- Issue: Client-side fetch calls use mixed patterns: some use `.catch(() => {})` to silently ignore errors, some log to console, some show alerts. No centralized error handling strategy.
- Files: `web/src/app/leads/page.tsx` (line 61, 69), `web/src/app/lead/[cnpj]/page.tsx` (line 51, 61), `web/src/components/LeadContacts.tsx` (line 32, 60)
- Impact: Errors go unlogged and unhandled, users see no feedback, debugging is difficult
- Fix approach: Create centralized `lib/fetchApi.ts` that wraps fetch with logging, timeout, and retry logic. Use context provider for error notifications to user.

**Duplicate database pool initialization:**
- Issue: Multiple API routes independently create `getPool()` functions with identical code instead of using the centralized `lib/db.ts`
- Files: `web/src/app/api/import-spreadsheet/route.ts` (lines 8-17), `web/src/app/api/setup-crm/route.ts` (lines 9-18)
- Impact: Pool configuration not consistent, connection limits not enforced, harder to update pooling strategy
- Fix approach: All routes should import `getPool()` from `lib/db.ts` directly.

## Known Bugs

**Lead contacts not fully populated during initial sync:**
- Symptoms: Some leads have `telefone` and `email` in `vendedor_projetos` but these aren't mirrored to `lead_contacts` table during daily repo sync
- Files: `web/src/lib/repo-sync.ts` (lines 717-819), contact population only runs if timeout allows
- Trigger: Daily cron runs repo sync; if enrichment step takes too long, contact population skips and never happens on retry
- Workaround: Manual call to `/api/enrich-contacts` endpoint after sync completes
- Root cause: STEP 9 (contact population) checks timeout INSIDE the loop instead of before starting, can partial-populate and exit silently

**Stale phone data from BrasilAPI not validated:**
- Symptoms: Leads show valid phone numbers but they may be inactive/disconnected
- Files: `web/src/lib/repo-sync.ts` (lines 636-707), stores BrasilAPI responses without validation
- Trigger: When BrasilAPI is used as enrichment source, no validation flags are set on `lead_contacts.telefone_status`
- Workaround: Manual contact verification by vendedor
- Root cause: `formatPhone()` in `lib/repo-sync.ts` only formats, doesn't validate

**Duplicate handling in spreadsheet import not comprehensive:**
- Symptoms: Same CNPJ can be imported multiple times if `parlamentar` or `link_externo` differs slightly (whitespace, case)
- Files: `web/src/app/api/import-spreadsheet/route.ts` (lines 346-349)
- Trigger: Import spreadsheet with normalized headers, exact string match on `parlamentar` and `link_externo`
- Workaround: Manual dedup before import, trim whitespace in source data
- Root cause: Dedup key doesn't normalize parlamentar/link_externo before comparison

## Security Considerations

**Hardcoded passwords in setup endpoint:**
- Risk: Default passwords visible in source code and execution logs, easily compromised if code is leaked
- Files: `web/src/app/api/setup-crm/route.ts` (lines 340-348)
- Current mitigation: Endpoint requires gestor role, logs not stored in repository
- Recommendations:
  1. Move passwords to environment variables (DATABASE_SEED_USERS env var as JSON)
  2. Auto-rotate default passwords after first login
  3. Ensure endpoint cannot be called after schema is initialized (set a flag in DB)
  4. Never log full password_hash values

**CRON_SECRET used as bearer token without expiration:**
- Risk: If CRON_SECRET is leaked (e.g., logs, PR descriptions), attacker can trigger expensive sync operations repeatedly
- Files: `web/src/app/api/cron/sync-leads/route.ts` (line 16)
- Current mitigation: Secret is environment variable (not in code), Vercel manages it
- Recommendations:
  1. Add rate limiting: max 1 sync per minute, max 10 per day per IP
  2. Add request signing with timestamp (prevent replay)
  3. Log all cron invocations with source IP and timing
  4. Consider HMAC-based verification instead of simple bearer token

**No input validation on CNPJ search parameter:**
- Risk: SQL injection if CNPJ search is not properly parameterized (though it appears to be with parameterized queries)
- Files: `web/src/app/api/leads/route.ts` (line 44) - appears safe with `$${paramIndex}`
- Current mitigation: Parameterized queries used throughout
- Recommendations: Add explicit CNPJ format validation (14 digits) before DB query to fail fast

**Session checking relies on getApiSession() without timeout:**
- Risk: If getApiSession() hangs/times out, unauthorized users might get through while endpoint waits indefinitely
- Files: All API routes calling `getApiSession()` from `lib/dal.ts`
- Current mitigation: Next.js request timeout (30s default)
- Recommendations:
  1. Implement explicit 5s timeout on session checks
  2. Return 401 immediately on timeout rather than waiting
  3. Add instrumentation to detect slow session calls

**Client-side role checking can be bypassed:**
- Risk: React components check `session.user.role` before rendering; attacker can modify browser state to access UI for restricted roles
- Files: `web/src/app/upload/page.tsx` (line 39), `web/src/app/distribuir/page.tsx` (line 77)
- Current mitigation: API endpoints verify role server-side (proper defense)
- Recommendations: Remove client-side role checks for security features (keep only for UX), ensure every API endpoint re-checks authorization

## Performance Bottlenecks

**N+1 query pattern in lead list endpoint:**
- Problem: For each lead, the query calculates 3 subqueries: emenda_count, total_valor_emendas, days_since_last_contact. On 500 leads, this runs 1500+ individual aggregations
- Files: `web/src/app/api/leads/route.ts` (lines 62-84)
- Cause: Subqueries in SELECT clause instead of window functions or joins with aggregates
- Improvement path:
  1. Use LEFT JOIN with GROUP BY to calculate totals once
  2. Cache days_since_last_contact in materialized column (updated by sync)
  3. Pre-calculate emenda_count in trigger or separate materialized view

**Large pagination limits cause memory spike:**
- Problem: Default limit is 10,000 rows, queries without pagination return all records
- Files: `web/src/app/api/leads/route.ts` (line 18), `web/src/app/distribuir/page.tsx` (lines 37, 50)
- Cause: No default pagination, frontend fetches 5000-10000 rows for client-side filtering
- Improvement path:
  1. Set hard max limit to 1000 rows
  2. Make pagination mandatory: require offset+limit or cursor
  3. Move filtering to server-side (status, vendedor, UF filters)

**Expensive CSV parsing and ZIP extraction in memory:**
- Problem: Entire ZIP files and CSVs loaded into memory before processing
- Files: `web/src/lib/repo-sync.ts` (lines 188-237)
- Cause: Uses `Buffer.from()` and full file read instead of streaming
- Improvement path: Already streaming CSV with readline — good. But ZIP download to memory is necessary (no streaming ZIP parser). Pre-allocate max 500MB limit.

**Dashboard queries don't use indexes effectively:**
- Problem: Queries with many JOINs and subqueries in dashboard endpoints may scan large tables
- Files: `web/src/app/api/dashboard-enhanced/route.ts`, `web/src/app/api/dashboard-crm/route.ts`
- Cause: Complex aggregations hard to optimize without analyzing EXPLAIN PLAN
- Improvement path:
  1. Run EXPLAIN ANALYZE on each dashboard query
  2. Add composite indexes: (vendedor_id, status_contato), (status_contato, updated_at)
  3. Consider materialized view for daily/weekly aggregates

**Contact enrichment from BrasilAPI hits rate limits:**
- Problem: Daily sync enriches up to 20 CNPJs via BrasilAPI; no backoff strategy if rate limited
- Files: `web/src/lib/repo-sync.ts` (lines 636-707)
- Cause: Sequential API calls without exponential backoff, 10s timeout per call
- Improvement path:
  1. Implement exponential backoff (start 1s, cap 30s)
  2. Batch requests if BrasilAPI supports
  3. Cache API responses by CNPJ with TTL (1 month)

## Fragile Areas

**Regex-based header matching in spreadsheet import:**
- Files: `web/src/app/api/import-spreadsheet/route.ts` (lines 70-78)
- Why fragile: Header detection uses string includes/index checks that are brittle to spacing or translation variants
- Safe modification: Add unit tests for header variants; create explicit header list for each format
- Test coverage: No tests for header detection logic

**Commission calculation logic hardcoded in multiple places:**
- Files: `web/src/app/api/setup-crm/route.ts` (lines 157-169), formula referenced in comments in `web/src/lib/repo-sync.ts`
- Why fragile: If commission rates change (e.g., Closer becomes 5% instead of 4%), must update in multiple places
- Safe modification: Create `lib/commission.ts` with single source of truth for all rates, import everywhere
- Test coverage: No unit tests for commission calculations

**Phone number formatting assumes Brazilian format:**
- Files: `web/src/lib/repo-sync.ts` (lines 70-83), `web/src/app/api/import-spreadsheet/route.ts` (lines 35-44)
- Why fragile: Hardcoded DDD range checks and format rules; fails on international numbers or invalid formats
- Safe modification: Add explicit validation that rejects non-Brazilian numbers, log rejections
- Test coverage: No unit tests for phone formatting edge cases

**Database schema migration order dependency:**
- Files: `web/src/app/api/setup-crm/route.ts` - creates/alters multiple tables in sequence
- Why fragile: If a migration fails partway (e.g., CREATE fails but doesn't roll back), next run may fail on duplicate column errors
- Safe modification: Wrap entire setup in transaction, add idempotency checks before each operation
- Test coverage: No end-to-end tests for setup flow

## Scaling Limits

**PostgreSQL connection pool exhaustion:**
- Current capacity: 5 max connections (set in `lib/db.ts`)
- Limit: With 60+ concurrent API routes, connection pool fills during traffic spikes
- Scaling path:
  1. Increase pool.max to 10-15 on standard Vercel tier
  2. Implement connection pooling service (e.g., PgBouncer) if traffic continues to grow
  3. Add queue for connection requests instead of erroring

**Repository sync timeout on large data syncs:**
- Current capacity: 300s (5 min) max duration per Vercel Pro limit
- Limit: If CNPJ count grows beyond ~400, enrichment steps timeout and contact population never runs
- Scaling path:
  1. Implement incremental sync: track last_synced timestamp, only process new records
  2. Split enrichment into separate cron job (BrasilAPI in one job, repo download in another)
  3. Implement queue-based processing instead of synchronous cron

**Single database connection for big spreadsheet imports:**
- Current capacity: Route allocates single pool connection; large imports lock up others
- Limit: Batch sizes hard-coded; if spreadsheet has >1000 unique CNPJs, upsert takes full duration
- Scaling path:
  1. Use batch inserts (current code does single upsert per row — change to batch of 100)
  2. Implement async job queue for imports (submit and poll status)
  3. Pre-validate spreadsheet in frontend before sending to backend

**Dashboard queries may timeout on many leads:**
- Current capacity: Dashboard queries don't have explicit timeout
- Limit: With 10,000+ leads, aggregations with multiple JOINs and subqueries can exceed 30s
- Scaling path:
  1. Add timeout to dashboard queries (10s limit)
  2. Implement dashboard cache (update hourly, not on every request)
  3. Add database indexes for common grouping columns

## Dependencies at Risk

**next-auth beta version:**
- Risk: Using `next-auth@5.0.0-beta.30` (beta) in production; API may change, security patches may be delayed
- Files: `web/package.json` (line 17)
- Impact: Potential breaking changes on update, security vulnerabilities may not be patched immediately
- Migration plan: Monitor next-auth releases closely; upgrade to stable v5 when released. Test auth flow thoroughly on each update.

**XLSX library for file parsing:**
- Risk: `xlsx@0.18.5` is a large, complex library used for one task; potential for bugs in parsing edge cases
- Files: `web/src/app/api/import-spreadsheet/route.ts`, `web/src/app/upload-clientes/page.tsx`
- Impact: If XLSX has vulnerability or parsing bug, affects data import reliability
- Migration plan: Consider lightweight alternative (`papaparse` for CSV only if format is limited) or add strict validation after parsing

**pg driver version mismatch:**
- Risk: Using `pg@8.13.0` and `@types/pg@8.11.0`; version skew can cause type mismatches
- Files: `web/package.json` (lines 18, 29)
- Impact: Type safety issues, potential runtime errors
- Migration plan: Keep types and driver versions in sync; use `npm audit` regularly

## Missing Critical Features

**No audit log for sensitive operations:**
- Problem: No record of who modified vendedor assignments, commissions, or client status changes
- Blocks: Compliance requirements, debugging unexpected state changes, detecting unauthorized modifications
- Workaround: None; admins rely on database dumps
- Priority: High — implement before storing financial/assignment data at scale

**No transactional guarantees in multi-step operations:**
- Problem: Vendedor assignment and lead update operations don't wrap database changes in transactions; partial failures leave inconsistent state
- Blocks: Ability to safely rollback failed operations, guarantee data consistency
- Workaround: Manual SQL corrections in database
- Priority: High — implement transactions for all multi-query operations

**No soft-delete or audit trail:**
- Problem: Once data is deleted/updated, no way to recover original state or see history of changes
- Blocks: Compliance audits, rollback of mistakes, data recovery
- Workaround: Restore from database backups (manual, slow)
- Priority: Medium — implement at-least soft-delete with created_by/updated_by timestamps

**No rate limiting on public endpoints:**
- Problem: `/api/health` and other endpoints have no rate limiting
- Blocks: Protection against abuse/DoS
- Workaround: None currently
- Priority: Medium — implement simple rate limiting (e.g., 100 req/min per IP)

## Test Coverage Gaps

**No unit tests for business logic:**
- What's not tested: Phone formatting, CNPJ cleaning, commission calculations, date parsing
- Files: `web/src/lib/repo-sync.ts`, `web/src/lib/format.ts`, `web/src/app/api/import-spreadsheet/route.ts`
- Risk: Edge cases (invalid formats, null values, boundary conditions) break silently
- Priority: High — add tests for critical data transformation functions

**No integration tests for API endpoints:**
- What's not tested: Full request/response flows, error handling, authorization
- Files: All `web/src/app/api/**` routes
- Risk: API contract changes break frontend without detection, security flaws in auth checks
- Priority: High — implement basic integration tests for core endpoints (leads, assignment, sync)

**No E2E tests for critical user flows:**
- What's not tested: Vendedor login → assignment → lead modification → commission display
- Risk: UI regressions and API integration issues reach production
- Priority: Medium — implement Playwright tests for critical paths (exists in project but not comprehensive)

**No tests for database schema migrations:**
- What's not tested: Setup endpoint, table creation order, constraint enforcement
- Files: `web/src/app/api/setup-crm/route.ts`
- Risk: New environment setup fails silently, schema constraints not enforced
- Priority: Medium — create test database and verify setup script from scratch

**No load testing:**
- What's not tested: Behavior under 100+ concurrent users, database pool behavior, API response times
- Risk: Performance issues discovered only in production, no baseline for scaling decisions
- Priority: Low — implement before scaling beyond current user count

---

*Concerns audit: 2026-02-17*
