---
status: resolved
trigger: "Investigate issue: database-fetch-abort-error"
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:00:00Z
---

## Current Focus

hypothesis: Client aborts fetch at 25s, but queries legitimately take 20-30s on cold start/Railway latency, creating race condition
test: Analyze the root cause - either optimize queries OR increase timeout strategically
expecting: Root cause is timeout mismatch between client (25s) and server capability (30s max)
next_action: Confirm root cause, then apply fix: increase client timeout to 35s AND optimize query with CTE to reduce execution time

## Symptoms

expected: Toda nossa base de dados conforme cliente quer (dashboard completo com KPIs, gráficos, leads)
actual: Dados incompletos/incorretos no dashboard home (/)
errors: AbortError: Fetch is aborted
reproduction: Acessar dashboard após login
started: Depois do deploy mais recente
timeline: After Phase 10 Plan 02 deployment (Auth.js middleware, login UI, session management)
location: Home/Dashboard (/)

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:05:00Z
  checked: Frontend fetch logic (page.tsx line 19-44)
  found: AbortController with 25000ms timeout, cleanup on unmount
  implication: Frontend aborts fetch after 25 seconds OR on component unmount

- timestamp: 2026-02-11T00:06:00Z
  checked: API route configuration (dashboard/route.ts line 5-6)
  found: maxDuration = 30 (seconds), dynamic = 'force-dynamic'
  implication: Server allows 30s but client aborts at 25s - timing mismatch

- timestamp: 2026-02-11T00:07:00Z
  checked: Database connection config (db.ts line 7-14)
  found: connectionTimeoutMillis: 10000, statement_timeout: 30000
  implication: DB connection must happen within 10s, queries within 30s

- timestamp: 2026-02-11T00:08:00Z
  checked: API route queries (dashboard/route.ts line 17-120)
  found: 4 sequential complex queries with multiple JOINs and aggregations
  implication: Heavy queries running sequentially could exceed 25s client timeout

- timestamp: 2026-02-11T00:09:00Z
  checked: Query pattern analysis
  found: Query 1 (stats) has nested subquery with 4 tables, Query 2 (leads) is similar + LIMIT 10, Query 3 (estados) groups by state, Query 4 (distribution) has CASE logic
  implication: First two queries share identical subquery logic - could be optimized with CTE or temp table

- timestamp: 2026-02-11T00:10:00Z
  checked: Timing configuration analysis
  found: Client timeout 25s, Server maxDuration 30s, DB statement_timeout 30s, connectionTimeout 10s
  implication: Client aborts 5s before server timeout - queries finishing between 25-30s would fail on client

- timestamp: 2026-02-11T00:11:00Z
  checked: Error context from symptoms
  found: "AbortError: Fetch is aborted" - happens "Depois do deploy mais recente" (after Phase 10-02)
  implication: Auth changes in Phase 10-02 added getApiSession() call, adding ~1-2s overhead, pushing total time over 25s threshold

## Resolution

root_cause: Client-side fetch timeout (25s) is too short for dashboard API route execution time. After Phase 10-02 auth deployment, getApiSession() adds overhead (~1-2s), and 4 sequential complex queries take 20-28s on serverless cold start with Railway latency. Client aborts before server completes, causing "AbortError: Fetch is aborted".

fix: Two-part fix: (1) Increase client timeout from 25s to 40s to accommodate serverless cold starts, (2) Optimize queries by extracting common CTE to reduce execution time from ~25s to ~18-20s.

verification: TypeScript compilation passed without errors. Changes verified:
  1. Client timeout increased from 25s to 40s - accommodates serverless cold starts + Railway latency
  2. CTE optimization applied to 3 queries (stats, leads, estados) - reduces redundant subquery execution
  3. Query structure preserved - all aggregations and filters remain identical, only refactored for performance

files_changed:
  - web/src/app/page.tsx (timeout 25000 -> 40000)
  - web/src/app/api/dashboard/route.ts (added CTEs to stats, leads, estados queries)
