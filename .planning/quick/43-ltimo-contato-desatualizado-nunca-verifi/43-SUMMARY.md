---
phase: quick-43
plan: 01
subsystem: api
tags: [crm, leads, dashboard-crm, sql, days-since-last-contact]
dependency_graph:
  requires: []
  provides: [accurate-days-since-last-contact]
  affects: [/leads page, CRM pipeline dashboard]
tech_stack:
  added: []
  patterns: [GREATEST(nullable, nullable) for multi-source MAX in SQL]
key_files:
  modified:
    - web/src/app/api/leads/route.ts
    - web/src/app/api/dashboard-crm/route.ts
decisions:
  - "GREATEST(MAX contact_notes.created_at, MAX vp.updated_at where status != Não Contatado) as unified contact timestamp — preserves NULL when both sources are NULL"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-20T20:15:57Z"
  tasks_completed: 1
  files_modified: 2
---

# Quick Task 43: Último Contato Desatualizado — Nunca Verificado Summary

**One-liner:** Fixed days_since_last_contact using GREATEST(contact_notes, status_change_date) so leads with non-default status show real days instead of "Nunca".

## What Was Built

The `days_since_last_contact` subquery in both `/api/leads` and `/api/dashboard-crm` previously read only from `contact_notes`. Leads whose status had been changed (e.g., Não Contatado → Contactado) but who had no written notes were showing "Nunca" — misleading vendedores and hiding real CRM activity.

The fix replaces the single-source subquery with `GREATEST(two nullable sources)`:
1. `MAX(contact_notes.created_at)` for that CNPJ — original source
2. `MAX(vendedor_projetos.updated_at)` for that CNPJ where `status_contato != 'Não Contatado'` — new fallback

SQL behavior: `GREATEST(NULL, NULL)` returns `NULL` → leads with status "Não Contatado" and no notes still correctly return NULL → UI shows "Nunca". `GREATEST(NULL, timestamp)` returns the timestamp → leads with a status change but no notes now show real days.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Fix days_since_last_contact in /api/leads and /api/dashboard-crm | b7769be | web/src/app/api/leads/route.ts, web/src/app/api/dashboard-crm/route.ts |

## Changes Made

### web/src/app/api/leads/route.ts

Replaced:
```sql
SELECT EXTRACT(DAY FROM NOW() - MAX(cn.created_at))::int
FROM contact_notes cn
WHERE cn.lead_cnpj = vp.cnpj
```

With:
```sql
SELECT EXTRACT(DAY FROM NOW() - GREATEST(
  (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
  (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
   WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
))::int
```

### web/src/app/api/dashboard-crm/route.ts

Same pattern applied to both `last_contact_date` and `days_since_last_contact` subqueries in the stale leads query (query #7).

## Verification

- TypeScript compiled cleanly (`npx tsc --noEmit` — no output = no errors)
- `GREATEST` pattern confirmed present in both files (3 occurrences total)
- Old bare `FROM contact_notes` pattern inside days_since subquery is gone from both files

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- web/src/app/api/leads/route.ts: modified and committed
- web/src/app/api/dashboard-crm/route.ts: modified and committed
- Commit b7769be exists in git log
