---
status: resolved
trigger: "BI dashboard at /bi is still not accessible and giving a syntax error"
created: 2026-02-18T22:00:00Z
updated: 2026-02-18T22:20:00Z
---

## Current Focus

hypothesis: RESOLVED - Query 5 (Pipeline Funnel) ORDER BY referenced raw vp.status_contato after GROUP BY, which PostgreSQL forbids. Fixed by wrapping in subquery so ORDER BY references the computed 'status' output column.
test: Ran fixed query against live DB - returns 6 rows correctly ordered. TypeScript passes. Next.js build succeeds.
expecting: BI dashboard at /bi now loads and displays all KPI cards and charts.
next_action: DONE - committed fix

## Symptoms

expected: BI dashboard at /bi loads and displays analytics data (KPI cards + charts)
actual: BI is not accessible and gives a syntax error
errors: PostgreSQL error: "column vp.status_contato must appear in the GROUP BY clause or be used in an aggregate function"
reproduction: navigate to /bi in the deployed app - the Promise.all fails on Q5, API returns 500, page shows SyntaxError (HTML from Vercel error page failing to JSON.parse) or "Failed to fetch BI data"
timeline: Was partially fixed in a previous session (S227 fixed "column vp.uf does not exist"), but this different SQL error in Q5 persists

## Eliminated

- hypothesis: TypeScript/build errors
  evidence: npx tsc --noEmit passes clean; npx next build succeeds with /bi at 103kB
  timestamp: 2026-02-18T22:00:00Z

- hypothesis: comissao_bonus column missing
  evidence: Q4 executed successfully returning commission_earned=1562, commission_bonus=150
  timestamp: 2026-02-18T22:05:00Z

- hypothesis: uf column missing
  evidence: Q7 executed successfully returning 15 rows
  timestamp: 2026-02-18T22:05:00Z

- hypothesis: contact_notes table missing
  evidence: Q8 executed successfully returning 61 notes
  timestamp: 2026-02-18T22:05:00Z

- hypothesis: auth/network/connection issue
  evidence: All other 7 queries succeed; only Q5 fails
  timestamp: 2026-02-18T22:05:00Z

## Evidence

- timestamp: 2026-02-18T22:00:00Z
  checked: web/src/app/api/bi/route.ts - all 8 SQL queries
  found: Code compiles clean, TypeScript passes, build succeeds
  implication: Issue is SQL logic, not syntax in code

- timestamp: 2026-02-18T22:05:00Z
  checked: All 8 queries run directly against live Supabase DB
  found: Q1, Q2, Q3, Q4, Q6, Q7, Q8 all succeed. Q5 (Pipeline Funnel) fails with "column vp.status_contato must appear in the GROUP BY clause or be used in an aggregate function"
  implication: Query 5 ORDER BY clause references vp.status_contato after GROUP BY 1 which is the CASE-aliased status column. PostgreSQL cannot reference the raw ungrouped column in ORDER BY.

- timestamp: 2026-02-18T22:08:00Z
  checked: Q5 ORDER BY clause structure
  found: GROUP BY 1 groups by the computed 'status' alias (CASE WHEN ... THEN 'Nao Contatado' ELSE vp.status_contato). ORDER BY then has a new CASE that references vp.status_contato directly - PostgreSQL sees this as a non-aggregated column reference in a grouped query context.
  implication: Fix must replace vp.status_contato references in ORDER BY with the grouped 'status' output column (using column ordinal or alias)

## Resolution

root_cause: |
  Query 5 (Pipeline Funnel) in web/src/app/api/bi/route.ts uses GROUP BY 1 (groups by the CASE-computed 'status' alias) but the ORDER BY has a second CASE expression that references vp.status_contato directly. PostgreSQL 14+ strictly enforces that non-aggregated columns must appear in GROUP BY. Since vp.status_contato is grouped away into the computed 'status' column (multiple raw values map to "Nao Contatado"), referencing it in ORDER BY is ambiguous and PostgreSQL throws the error. This causes the entire Promise.all to reject, the API returns 500, and the BI dashboard fails.

fix: |
  Wrapped Q5 inner SELECT+GROUP BY in a subquery aliased 'funnel'. The outer SELECT * FROM funnel ORDER BY CASE status WHEN 'Nao Contatado' THEN 1 ... uses the computed 'status' column from the derived table, which PostgreSQL accepts. The original ORDER BY tried to reference vp.status_contato directly after GROUP BY, which the database rejects since the raw column is no longer accessible post-grouping.

verification: |
  - Fixed query tested directly against live Supabase DB: returns 6 rows correctly ordered (Nao Contatado=146, Retorno=199, Proposta=36, Fechado=3, Aguardando Closer=2, Telefone Invalido=2)
  - npx tsc --noEmit: zero errors
  - npx next build: succeeded, /bi route 103 kB
  - All other 7 queries already confirmed working in previous test run
files_changed:
  - web/src/app/api/bi/route.ts
