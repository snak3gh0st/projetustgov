---
phase: quick-4
plan: 01
subsystem: lead-distribution-crm
tags: [leads, assignment, crm, vendedor, gestor]
dependency-graph:
  requires: [quick-3-schema, 10-01-auth, 10-02-login]
  provides: [lead-assignment-api, distribuir-page, inline-crm-editing]
  affects: [leads-page, vendedores-api, leads-api]
tech-stack:
  added: []
  patterns: [session-based-role-filtering, inline-edit-onblur, multi-select-table]
key-files:
  created:
    - web/src/app/api/leads/assign/route.ts
    - web/src/app/distribuir/page.tsx
  modified:
    - web/src/app/api/vendedores/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/app/api/leads/route.ts
    - web/src/app/leads/page.tsx
key-decisions:
  - Client-side session check for /distribuir (fetch /api/auth/session)
  - Unassigned filter via vendedor_id=unassigned query param
  - Vendedores endpoint open to all authenticated users (not gestor-only)
metrics:
  duration: 3m15s
  completed: 2026-02-11
---

# Quick Task 4: Distribuicao de Leads e CRM do Vendedor Summary

Gestor lead distribution page with multi-select assignment and inline telefone/email CRM editing on /leads.

## What Was Built

### API Endpoints
- **POST /api/leads/assign** - Gestor bulk-assigns leads to vendedor by updating vendedor_projetos.vendedor_id
- **GET /api/vendedores** - Returns vendedores with aggregated lead_count (LEFT JOIN on vendedor_projetos)
- **PATCH /api/leads/[cnpj]** - Now accepts telefone and email fields alongside existing status_contato and observacoes
- **GET /api/leads** - Added vendedor_id=unassigned filter for NULL vendedor_id leads

### /distribuir Page (Gestor-only)
- Table of unassigned leads with multi-select checkboxes (individual + select all)
- Vendedor cards showing name, email, and current lead count (click to select)
- Search by CNPJ/nome and UF dropdown filter
- Sticky bottom action bar with vendedor dropdown and "Atribuir X leads" button
- Toast notification on successful assignment, auto-refresh of leads and counts

### /leads Page Updates
- Vendedor filter dropdown (gestor-only) with "Nao atribuidos" option
- Telefone and email columns are inline-editable (onBlur pattern matching existing observacoes)
- Role-aware subtitle text (vendedor sees "Seus leads atribuidos")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript Set iteration error**
- **Found during:** Task 2
- **Issue:** `[...new Set(leads.map(l => l.uf).filter(Boolean))]` failed with downlevelIteration error
- **Fix:** Changed to `Array.from(new Set(...))` with type guard filter
- **Files modified:** web/src/app/distribuir/page.tsx

**2. [Rule 2 - Missing functionality] Unassigned leads API filter**
- **Found during:** Task 1
- **Issue:** No way to query unassigned leads via API (plan only mentioned client-side filtering)
- **Fix:** Added vendedor_id=unassigned support in /api/leads route.ts
- **Files modified:** web/src/app/api/leads/route.ts

**3. [Rule 2 - Missing functionality] Vendedores endpoint access**
- **Found during:** Task 1
- **Issue:** Existing vendedores endpoint was gestor-only (403 for vendedores), but /leads page needs it for filter
- **Fix:** Removed gestor-only restriction, now any authenticated user can list vendedores
- **Files modified:** web/src/app/api/vendedores/route.ts

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6b4d3a1 | API endpoints: assign, vendedores with counts, PATCH telefone/email |
| 2 | 6d238b3 | /distribuir page with multi-select and vendedor assignment |
| 3 | 489c1a4 | /leads vendedor filter and inline telefone/email editing |

## Self-Check: PASSED
