---
phase: quick-260414-jby
plan: 01
subsystem: auth/exports
tags: [security, rbac, csv-export, contacts]
requirements:
  completed: [QUICK-260414-JBY-01]
dependency_graph:
  requires: [dal.ts::getApiSession]
  provides: [dal.ts::canExportContacts]
  affects:
    - web/src/app/api/execucao/export/route.ts
    - web/src/app/api/leads/export-pendentes/route.ts
    - web/src/app/leads/LeadsClient.tsx
    - web/src/app/execucao/ExecucaoClient.tsx
    - web/src/components/NewsBanner.tsx
tech_stack:
  added: []
  patterns: [centralized-rbac-helper, defense-in-depth-ui-and-api]
key_files:
  created: []
  modified:
    - web/src/lib/dal.ts
    - web/src/app/api/execucao/export/route.ts
    - web/src/app/api/leads/export-pendentes/route.ts
    - web/src/app/leads/LeadsClient.tsx
    - web/src/app/execucao/ExecucaoClient.tsx
    - web/src/components/NewsBanner.tsx
decisions:
  - Use dedicated canExportContacts helper instead of repurposing isAdmin (isAdmin is 'gestor'-only and other code paths depend on current semantics)
  - Client components inline the role check with a comment pointing to dal.ts (dal.ts is server-only and cannot be imported client-side)
  - Remove the vendedor-scoping EXISTS block in /api/execucao/export since non-admins are now 403'd before the query runs
  - Tightening: coordenador role loses access to /api/leads/export-pendentes (previously allowed)
metrics:
  duration: ~5 min
  tasks: 2
  files_modified: 6
  completed_date: 2026-04-14
commits:
  - b4edd56 feat(quick-260414-jby-01): gate contact CSV exports to admin-tier only
  - b189d32 feat(quick-260414-jby-02): hide contact CSV export buttons from non-admin UI
---

# Quick Task 260414-jby: Exportar contatos somente para admin — Summary

**One-liner:** Bulk contact CSV export (email/telefone/nome_pessoa across lead_contacts) restricted to admin-tier roles only (gestor/admin — Tito and Philipe), with a single `canExportContacts` helper driving both server-side 403 gates and UI visibility.

## What Shipped

### Helper

- `canExportContacts(role): boolean` in `web/src/lib/dal.ts` (after `isAdmin`).
- Returns `true` only for `'gestor'` and `'admin'`.
- JSDoc documents the product decision and points to this quick-task folder as the audit trail.

### API routes

| Route | Before | After |
|---|---|---|
| `GET /api/execucao/export` | Any authenticated user (vendedor gets auto-scoped to own leads) | `canExportContacts(role)` or 403 — vendedor-scoping block removed as dead code |
| `GET /api/leads/export-pendentes` (with or without `?filter=pendentes`) | `gestor` or `coordenador` | `canExportContacts(role)` or 403 — coordenador loses access (intentional tightening) |

### UI

- `web/src/app/leads/LeadsClient.tsx`: both export buttons ("Exportar Pendentes CSV" + "Exportar CSV") wrapped in a single `role === 'gestor' || role === 'admin'` guard. Previous partial guard (`gestor|coordenador` only around Exportar Pendentes) removed.
- `web/src/app/execucao/ExecucaoClient.tsx`: "Exportar CSV" button in the pagination footer wrapped in the same inline guard against `userRole` prop.
- Both call sites carry the comment `// mirrors canExportContacts() in dal.ts` to keep the two in sync.

### News banner

- Bumped `NEWS_VERSION` from `v4.4` -> `v4.5`.
- Added new first item: `"Seguranca: exportacao de CSV de contatos agora restrita a gestor/admin (Tito e Philipe)"`.
- This resets the dismissed-localStorage flag for all users so the banner re-shows once.

## Tightening (breaking change for coordenador)

The previous `/api/leads/export-pendentes` gate allowed `coordenador` in addition to `gestor`. It no longer does. This is intentional per product request — the debug file `.planning/debug/admin-csv-export-forbidden.md` captured the earlier permissive direction, which is now reversed.

## Verification

**Automated:**

```bash
cd web && npx tsc --noEmit
# exits 0 (no output)
```

**Manual (against running dev server) — to be run post-deploy:**

1. Login as `vendedor` -> visit `/leads` and `/execucao` — no export buttons visible. `GET /api/execucao/export` and `GET /api/leads/export-pendentes` return `403 {"error":"Forbidden"}`.
2. Login as `coordenador` — same as vendedor (was previously able to hit leads export; now 403).
3. Login as `csm` / `adm_produto` / `visualizador` — export buttons hidden; API returns 403.
4. Login as `gestor` -> visit `/leads` and `/execucao` — both export buttons visible; clicking downloads `text/csv` with `Content-Disposition: attachment` header.

## Deviations from Plan

None — plan executed exactly as written. The NewsBanner bump (v4.4 -> v4.5) was added proactively per orchestrator constraint (user-facing behavior change: coordenador loses export access).

## Commits

- `b4edd56` — feat(quick-260414-jby-01): gate contact CSV exports to admin-tier only
- `b189d32` — feat(quick-260414-jby-02): hide contact CSV export buttons from non-admin UI

## Self-Check: PASSED

- FOUND: web/src/lib/dal.ts (canExportContacts exported)
- FOUND: web/src/app/api/execucao/export/route.ts (imports + 403 gate)
- FOUND: web/src/app/api/leads/export-pendentes/route.ts (imports + 403 gate)
- FOUND: web/src/app/leads/LeadsClient.tsx (UI guard)
- FOUND: web/src/app/execucao/ExecucaoClient.tsx (UI guard)
- FOUND: web/src/components/NewsBanner.tsx (v4.5 bump)
- FOUND: commit b4edd56
- FOUND: commit b189d32
- `npx tsc --noEmit` exits 0
