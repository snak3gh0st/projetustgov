---
phase: quick-32
plan: 01
subsystem: api/leads
tags: [sql, leads, lead_contacts, coalesce, contacts]
dependency_graph:
  requires: [lead_contacts table, vendedor_projetos table]
  provides: [telefone/email in GET /api/leads response]
  affects: [web/src/app/leads/page.tsx hasContact check]
tech_stack:
  added: []
  patterns: [correlated subquery with COALESCE fallback]
key_files:
  modified:
    - web/src/app/api/leads/route.ts
decisions:
  - "Use COALESCE subquery alias shadowing vp.* rather than frontend changes — minimal diff, no type changes needed"
  - "ORDER BY lc.principal DESC, lc.created_at ASC to prefer principal=true rows"
metrics:
  duration: "< 5 minutes"
  completed: "2026-02-20"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-32 Plan 01: Fix Missing Contacts (Leads Fetched from BrasilAPI) Summary

COALESCE subqueries added to GET /api/leads to return lead_contacts telefone/email as primary source, falling back to vp.telefone/vp.email, fixing "Sem contato" display for ~97% of leads.

## What Was Done

### Task 1: Add lead_contacts COALESCE subqueries to leads SELECT

Modified `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/leads/route.ts` to add two correlated COALESCE subqueries immediately after the existing `principal_telefone_status` subquery, before the `FROM vendedor_projetos vp` clause:

```sql
COALESCE(
  (
    SELECT lc.telefone
    FROM lead_contacts lc
    WHERE lc.lead_cnpj = vp.cnpj
    ORDER BY lc.principal DESC, lc.created_at ASC
    LIMIT 1
  ),
  vp.telefone
) AS telefone,
COALESCE(
  (
    SELECT lc.email
    FROM lead_contacts lc
    WHERE lc.lead_cnpj = vp.cnpj
    ORDER BY lc.principal DESC, lc.created_at ASC
    LIMIT 1
  ),
  vp.email
) AS email
```

These aliases shadow the `vp.telefone` and `vp.email` columns returned by `vp.*` via PostgreSQL's last-column-wins behavior. No frontend changes were required — `lead.telefone || lead.email` in the leads page hasContact check (line 339) now evaluates to true for leads that have entries in `lead_contacts`.

**Commit:** `289d76c`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- File modified: `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/leads/route.ts` — confirmed present and contains `COALESCE.*lead_contacts.*vp.telefone` pattern.
- Commit `289d76c` exists in git log.
