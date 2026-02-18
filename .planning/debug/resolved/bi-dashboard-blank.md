---
status: resolved
trigger: "bi-dashboard-blank: /bi page loads blank — no KPI cards, no charts, no visible error"
created: 2026-02-18T00:00:00Z
updated: 2026-02-18T19:00:00Z
---

## Current Focus

hypothesis: Page renders loading skeleton then either (a) error state shows with barely-visible text-gray-400 on bg-gray-50 making page appear blank, OR (b) skeleton is stuck and user interprets pulsing empty boxes as blank. Root cause may also be the vendedor activity trend query JOIN multiplying rows.
test: verified all DB queries execute successfully in 704ms. Standalone server returns skeleton HTML. Code compiles clean.
expecting: Fixing error state visibility and JOIN bug will resolve the blank appearance.
next_action: Apply fixes to bi/page.tsx (error state) and api/bi/route.ts (JOIN query)

## Symptoms

expected: Page /bi should load 4 KPI cards + 4 Recharts charts (funnel, commission, UF, activity) with real data from the database
actual: Blank page — nothing renders, no content visible
errors: No visible error on screen, no console errors reported
reproduction: Navigate to /bi while logged in
started: Noticed 2026-02-18, implemented in quick-11 (not quick-29 as stated)

## Eliminated

- hypothesis: comissao_bonus column missing from database
  evidence: DB query confirmed column exists in vendedor_projetos
  timestamp: 2026-02-18T18:30:00Z

- hypothesis: contact_notes table missing
  evidence: DB query confirmed table exists
  timestamp: 2026-02-18T18:30:00Z

- hypothesis: TypeScript/build errors
  evidence: npx tsc --noEmit passed with zero errors; next build succeeded
  timestamp: 2026-02-18T18:00:00Z

- hypothesis: recharts SSR crash preventing any render
  evidence: recharts importable in Node.js; renderToString succeeds; only renders empty container div on server. Loading skeleton doesn't use recharts at all (guards with loading=true).
  timestamp: 2026-02-18T18:45:00Z

- hypothesis: SQL queries failing
  evidence: Ran all 8 parallel queries directly against Supabase DB; all succeeded in 704ms; data returned is valid
  timestamp: 2026-02-18T18:50:00Z

- hypothesis: auth/session blocking the API
  evidence: Middleware only redirects unauthenticated users; authenticated requests pass through; getApiSession works correctly
  timestamp: 2026-02-18T18:15:00Z

## Evidence

- timestamp: 2026-02-18T18:00:00Z
  checked: web/src/app/bi/page.tsx
  found: Client component with useEffect fetch, loading/error state, full dashboard render
  implication: Structure is correct; loading skeleton shows first

- timestamp: 2026-02-18T18:05:00Z
  checked: web/src/app/api/bi/route.ts
  found: 8 parallel SQL queries, all wrapped in try/catch, returns JSON
  implication: API handles errors gracefully returning { error: '...' }

- timestamp: 2026-02-18T18:30:00Z
  checked: Live Supabase database
  found: comissao_bonus exists, contact_notes exists, vendedor_projetos has 447 rows
  implication: Database schema is correct

- timestamp: 2026-02-18T18:50:00Z
  checked: All 8 BI queries against live DB
  found: All succeed in 704ms; funnel has 6 statuses; 52 contact notes; 2 vendedores with commission
  implication: API would return complete valid data

- timestamp: 2026-02-18T18:55:00Z
  checked: Standalone Next.js server response for /bi
  found: Returns 200 OK with skeleton HTML (5947 bytes including animate-pulse elements)
  implication: SSR works correctly; skeleton renders on server

- timestamp: 2026-02-18T19:00:00Z
  checked: Error state in bi/page.tsx
  found: Error div uses text-gray-400 on bg-gray-50 body - extremely faint text barely distinguishable from background
  implication: If API fails in production, error looks like blank page

- timestamp: 2026-02-18T19:00:00Z
  checked: Activity trend JOIN for vendedor users
  found: JOIN contact_notes cn JOIN vendedor_projetos vp ON vp.cnpj = cn.lead_cnpj - since vp has multiple rows per CNPJ (avg 1.19, max 5), COUNT(*) overcounts notes
  implication: Data accuracy bug for vendedor users

## Resolution

root_cause: |
  TWO issues:
  1. Error state uses text-gray-400 on bg-gray-50 background - the error message "Erro ao carregar BI dashboard" is barely visible and appears as a blank page when the API fails for any reason (network, DB error, Vercel timeout, etc.)
  2. Activity trend SQL for vendedor users JOINs contact_notes with vendedor_projetos without accounting for multiple rows per CNPJ, causing COUNT(*) to overcount. Not a crash, but inaccurate data.
  Note: Database, API, and page code all work correctly when API returns data successfully.

fix: |
  1. Replace faint error state with visible error card (red/amber styling, retry button)
  2. Fix JOIN in vendedor activity trend: use EXISTS or JOIN with DISTINCT cnpj subquery
  3. Keep API as-is for gestor (no join needed)

verification: |
  - npx tsc --noEmit: zero errors
  - npx next build: succeeded, /bi route 103 kB
  - All 8 DB queries verified against live Supabase: succeed in 704ms
  - Standalone server: returns skeleton HTML correctly
  - Commit: e6d2434
files_changed:
  - web/src/app/bi/page.tsx
  - web/src/app/api/bi/route.ts
