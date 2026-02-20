---
phase: quick
plan: "38"
subsystem: leads-api
tags: [closer, visibility, sql-filter, db-cleanup]
dependency_graph:
  requires: [quick-37]
  provides: [closer-visibility-scoped-to-aguardando-closer]
  affects: [GET /api/leads, PATCH /api/leads/[cnpj]]
tech_stack:
  added: []
  patterns: [sql-conditional-filter, unconditional-null-clear]
key_files:
  modified:
    - web/src/app/api/leads/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts
decisions:
  - GET query uses AND vp.status_contato = 'Aguardando Closer' guard on closer_id match to prevent stale visibility
  - PATCH clear logic uses closer_id IS NOT NULL (not comissao_locked) to unconditionally wipe closer_id on status change
  - DB cleanup cleared 5 stale rows directly via pg client
metrics:
  duration: "5 minutes"
  completed: "2026-02-20"
  tasks: 3
  files: 2
---

# Quick Plan 38: Paulo vê somente Aguardando Closer Summary

**One-liner:** Scoped closer_id visibility in GET /api/leads to status = 'Aguardando Closer' only, unconditional closer_id clear on status change, and DB cleanup of 5 stale rows.

## What Was Done

### Task 1 - Fix GET /api/leads query

**File:** `web/src/app/api/leads/route.ts` (line 31)

Changed the vendedor/gestor_vendedor condition from:
```sql
(vp.vendedor_id = $1 OR vp.closer_id = $1)
```
To:
```sql
(vp.vendedor_id = $1 OR (vp.closer_id = $1 AND vp.status_contato = 'Aguardando Closer'))
```

This prevents Paulo from seeing leads that have a stale `closer_id` pointing to him but have already moved to a different status (e.g. Wellington's lead in "Proposta").

### Task 2 - Fix PATCH closer_id cleanup

**File:** `web/src/app/api/leads/[cnpj]/route.ts` (lines 215-221)

Changed the else-if block that runs when status changes away from Fechado/Aguardando Closer. Previously:
```sql
closer_id = CASE WHEN status_contato = 'Aguardando Closer' THEN NULL ELSE closer_id END
WHERE id = $1 AND (comissao_locked = true OR status_contato = 'Aguardando Closer')
```

Now unconditionally clears closer_id:
```sql
closer_id = NULL
WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL)
```

The old logic had a timing issue: `status_contato` was already updated before the clear ran, so the CASE condition never matched `'Aguardando Closer'`. The new logic clears `closer_id` whenever `closer_id IS NOT NULL`, regardless of what the previous status was.

### Task 3 - DB cleanup

Ran direct SQL via node pg client to clear 5 stale rows:

```sql
UPDATE vendedor_projetos
SET closer_id = NULL,
    closer_comissao_percentual = NULL,
    closer_comissao_valor = NULL
WHERE closer_id IS NOT NULL
  AND status_contato != 'Aguardando Closer'
  AND comissao_locked = false;
```

Result: **5 rows updated** (stale closer_id values removed from leads in statuses like Proposta, Contactado, etc.)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 0962a42 | fix(leads): scope closer_id visibility to Aguardando Closer status only | route.ts x2 |

## Self-Check: PASSED

- web/src/app/api/leads/route.ts - modified (condition updated on line 31)
- web/src/app/api/leads/[cnpj]/route.ts - modified (clear logic updated on lines 215-221)
- commit 0962a42 - confirmed
- DB: 5 stale rows cleaned
