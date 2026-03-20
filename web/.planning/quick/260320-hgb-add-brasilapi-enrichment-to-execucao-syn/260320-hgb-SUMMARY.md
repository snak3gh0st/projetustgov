---
phase: quick
plan: 260320-hgb
subsystem: execucao-sync, leads
tags: [brasilapi, enrichment, execucao, leads, filter, ui]
dependency_graph:
  requires: []
  provides: [BrasilAPI enrichment in execucao-sync, em_execucao filter in leads API, Em Execucao tab in leads page]
  affects: [execucao-sync pipeline, leads list page]
tech_stack:
  added: []
  patterns: [BrasilAPI fetch with AbortSignal.timeout, EXISTS subquery filter, segmented control tab UI]
key_files:
  created: []
  modified:
    - web/src/lib/execucao-sync.ts
    - web/src/app/api/leads/route.ts
    - web/src/app/leads/page.tsx
decisions:
  - "Use LIMIT 100 per sync run to stay within Vercel 300s timeout budget"
  - "Skip enrichment if elapsed > 200s, break per-CNPJ loop if elapsed > 260s"
  - "Only INSERT into lead_contacts — never UPDATE or DELETE existing rows"
  - "em_execucao filter uses EXISTS subquery (no extra params) making it safe to append to any existing WHERE clause"
  - "Segmented control placed above search input using gray-100/white pill pattern matching existing design system"
metrics:
  duration: ~76s
  completed: "2026-03-20"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260320-hgb: Add BrasilAPI Enrichment to Execucao Sync

**One-liner:** BrasilAPI CNPJ contact enrichment step added to execucao-sync pipeline (STEP C3) plus "Em Execucao" segmented tab filter on leads page backed by EXISTS subquery on projetos_execucao.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add BrasilAPI enrichment step to execucao-sync.ts | `994348d` | src/lib/execucao-sync.ts |
| 2 | Add em_execucao filter to /api/leads and tab UI on leads page | `c4103fd` | src/app/api/leads/route.ts, src/app/leads/page.tsx |

## What Was Built

### Task 1 — STEP C3 in execucao-sync.ts

Added a new enrichment step between STEP C2 (purge stale rows) and STEP D (cron_sync_log):

- `delay()` helper added for rate limiting
- `enriched_contacts: number` field added to `ExecucaoSyncStats` (default 0)
- `formatPhone` imported from `@/lib/repo-sync`
- **STEP C3** queries `projetos_execucao` CNPJs with no `lead_contacts` (LIMIT 100)
- Skips enrichment entirely if elapsed > 200s; breaks per-CNPJ loop if elapsed > 260s
- Calls `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` with 10s AbortSignal timeout
- Breaks loop on 403/429 (rate limit); skips on other non-ok responses
- Inserts `phone1 + email` as `principal=true` contact; inserts `phone2` as separate `principal=false` row if digits differ from phone1
- 300ms delay between calls per rate limit compliance
- Only INSERTs into `lead_contacts` — no UPDATE/DELETE anywhere

### Task 2 — em_execucao filter + tab UI

**API (`/api/leads`):**
- Extracts `em_execucao` query param
- When `em_execucao=true`, appends `EXISTS (SELECT 1 FROM projetos_execucao pe WHERE pe.cnpj = vp.cnpj)` to WHERE conditions
- No additional SQL params needed (pure subquery)
- Additive with all existing filters: status, vendedor, search, client type

**Leads page UI:**
- `emExecucaoFilter: boolean` state variable (default `false`)
- `fetchLeads` passes `em_execucao=true` when filter is active; added to `useCallback` dependency array
- Segmented control (Todos | Em Execucao) rendered above search input using `bg-gray-100 rounded-lg p-1` container with `bg-white shadow-sm` active pill — matches existing design system

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors for all three modified files
- STEP C3 positioned correctly between C2 and D, inside the `client` try block
- em_execucao filter uses EXISTS subquery on projetos_execucao
- Leads page renders segmented control that toggles em_execucao param in fetch URL
- No existing tables modified, no existing data mutated

## Self-Check: PASSED

- `src/lib/execucao-sync.ts` — modified, STEP C3 present
- `src/app/api/leads/route.ts` — modified, emExecucao condition present
- `src/app/leads/page.tsx` — modified, segmented control and state present
- Commit `994348d` — found
- Commit `c4103fd` — found
- `npx tsc --noEmit` — PASSED
