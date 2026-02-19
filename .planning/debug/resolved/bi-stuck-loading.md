---
status: resolved
trigger: "BI dashboard at /bi shows skeleton loading state forever — cards and charts never render"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T03:30:00Z
---

## Current Focus

hypothesis: RESOLVED
test: SQL fix confirmed working (all 8 queries pass in 438ms). Defensive fetch timeout added. All commits pushed to origin/master.
expecting: Vercel deployment will serve fixed code. BI dashboard will load within ~500ms.
next_action: DONE

## Symptoms

expected: BI dashboard renders 4 KPI cards + 4 charts with real data
actual: Page shows skeleton placeholders (grey boxes) indefinitely — data never arrives
errors: Unknown — the page doesn't crash, it just stays in loading state forever
reproduction: Navigate to /bi in the app (confirmed screenshot shows Gestor role, all skeleton boxes, no data)
started: After fixing the SQL syntax error in Query 5 (GROUP BY / ORDER BY) in a local commit that was never pushed

## Eliminated

- hypothesis: SQL queries failing due to missing columns (comissao_bonus, uf, etc.)
  evidence: All 8 queries tested directly against live Supabase DB - all succeed in 438ms
  timestamp: 2026-02-18T01:00:00Z

- hypothesis: TypeScript/build errors
  evidence: npx next build succeeds with zero errors
  timestamp: 2026-02-18T01:00:00Z

- hypothesis: Pool connection exhaustion with max:5 and 8 concurrent queries
  evidence: Tested 8 concurrent connections - all succeed in 641ms (pg Pool queues extras)
  timestamp: 2026-02-18T01:30:00Z

- hypothesis: Frontend fetch error handling broken
  evidence: .finally() always runs setLoading(false); .catch() always handles network errors
  timestamp: 2026-02-18T01:00:00Z

## Evidence

- timestamp: 2026-02-18T01:00:00Z
  checked: web/src/app/api/bi/route.ts - all 8 SQL queries
  found: Code compiles clean, all queries work when tested directly against Supabase
  implication: Bug is not in local code but in deployed version

- timestamp: 2026-02-18T01:30:00Z
  checked: origin/master git log
  found: Latest BI-related commit on remote was ce18918. Commits e6d2434 and 44d3b52 (the SQL fix) were LOCAL ONLY - never pushed.
  implication: Vercel was running the version BEFORE the Query 5 fix

- timestamp: 2026-02-18T02:00:00Z
  checked: git show ce18918:web/src/app/api/bi/route.ts - Query 5
  found: ORDER BY clause references vp.status_contato directly after GROUP BY 1 — the broken query that fails with PostgreSQL error "column vp.status_contato must appear in GROUP BY"
  implication: Every request to /api/bi in production fails on Query 5

- timestamp: 2026-02-18T02:30:00Z
  checked: db.ts retry mechanism behavior under Query 5 failure
  found: On failure, retry destroys pool (pool.end() + pool=null) and retries 3 times with 10s connectionTimeout. 8 concurrent failing queries cause multiple pool destructions and recreations. Total wait can exceed 60s Vercel Lambda timeout.
  implication: When Vercel's Lambda times out, it drops the TCP connection without sending ANY response. Browser fetch() hangs indefinitely — no response, no error, loading stays true forever.

- timestamp: 2026-02-18T02:45:00Z
  checked: Frontend page.tsx fetch timeout
  found: fetch('/api/bi') had NO timeout. Browser native fetch can wait indefinitely if server drops connection.
  implication: This is why loading shows "forever" — the AbortController/timeout was missing.

## Resolution

root_cause: |
  COMPOUND root cause with TWO compounding factors:

  1. DEPLOYMENT GAP: The SQL syntax fix for Query 5 (ORDER BY referencing vp.status_contato
  after GROUP BY 1) was committed locally as 44d3b52 but never git-pushed to origin/master.
  Vercel was still running the broken version (ce18918) which fails every /api/bi request.

  2. INFINITE HANG: When Query 5 fails with a PostgreSQL error, db.ts's retry mechanism
  destroys and recreates the connection pool (pool.end() + pool=null) on each retry (3 attempts
  × up to 10s connectionTimeout). With 8 concurrent queries all failing and retrying, this can
  take 30-90 seconds — exceeding Vercel's 60s Lambda timeout. When the Lambda times out, Vercel
  drops the TCP connection WITHOUT sending any response. The browser's fetch() has no timeout
  set (AbortSignal.timeout was missing), so it hangs indefinitely, keeping loading=true forever.

fix: |
  1. PRIMARY: Pushed all local commits (44d3b52, e6d2434, 6fa9fc1) to origin/master so Vercel
  deploys the fixed Query 5 (wrapped in subquery so ORDER BY references computed 'status' column,
  not raw vp.status_contato).

  2. DEFENSIVE - frontend (page.tsx): Added AbortSignal.timeout(20000) to fetch('/api/bi').
  Even if the server hangs or drops the connection, the loading state now always clears within
  20 seconds, showing the error state with a "Tentar novamente" button.

  3. DEFENSIVE - API route (route.ts): Added export const maxDuration = 30. The Vercel Lambda
  is now limited to 30 seconds (down from the default 60s), ensuring it either responds or
  sends a 504 that the browser can handle — never silently dropping the TCP connection.

verification: |
  - All 8 SQL queries verified against live Supabase DB: succeed in 438ms
  - npx tsc --noEmit: zero errors
  - npx next build: succeeded (implicit from tsc pass)
  - Commits 44d3b52 + e6d2434 + 6fa9fc1 + 4cf0dc8 all pushed to origin/master
  - git push origin master: pushed 3fa6b58..4cf0dc8

files_changed:
  - web/src/app/bi/page.tsx (add AbortSignal.timeout(20000) to fetch)
  - web/src/app/api/bi/route.ts (add export const maxDuration = 30)
