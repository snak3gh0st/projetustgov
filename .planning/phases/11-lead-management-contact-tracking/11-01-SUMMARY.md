---
phase: 11-lead-management-contact-tracking
plan: 01
subsystem: lead-management
tags: [schema, backend, frontend, existing-clients, contact-notes, status]
dependency_graph:
  requires: [phase-10-auth]
  provides: [existing-clients-table, contact-notes-table, 5-status-system]
  affects: [leads-api, leads-ui, lead-detail-ui]
tech_stack:
  added: [existing_clients table, contact_notes table]
  patterns: [LEFT JOIN filtering, role-based exclusion]
key_files:
  created:
    - .planning/phases/11-lead-management-contact-tracking/11-01-SUMMARY.md
  modified:
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/leads/route.ts
    - web/src/lib/types.ts
    - web/src/app/leads/page.tsx
    - web/src/app/lead/[cnpj]/page.tsx
decisions:
  - schema: Created existing_clients table with CNPJ unique constraint and index
  - schema: Activated contact_notes table for Phase 11 timeline feature
  - migration: Converted 'Ainda Não' to 'Não Contatado' for leads with no observations
  - api: Vendedores ALWAYS excluded from seeing existing clients via ec.cnpj IS NULL
  - ui: Gray badge for 'Não Contatado' status, purple badge for existing clients
metrics:
  duration: 4m 34s
  tasks_completed: 3
  files_modified: 5
  commits: 3
  completed_date: 2026-02-12
---

# Phase 11 Plan 01: Schema & Backend for Lead Management

Database schema and API updates to support existing client exclusion and contact tracking.

## Tasks Completed

### Task 1: Schema Updates (Commit 0968fd1)
- Created `existing_clients` table with CNPJ unique constraint and index
- Activated `contact_notes` table for timeline feature (ready for Plans 03-04)
- Updated `status_contato` default to 'Não Contatado' in vendedor_projetos table
- Migrated existing 'Ainda Não' leads to 'Não Contatado' where observacoes IS NULL
- Added TypeScript types: `ExistingClient`, `ContactNote`
- Added `is_existing_client` flag to `VendedorProjeto` type

**Migration result:** 3,251 leads converted to 'Não Contatado' status, 1 lead kept as 'Ainda Não' (had observations)

### Task 2: Leads API Filtering (Commit e3fa370)
- Added LEFT JOIN to `existing_clients` table in main leads query
- Returns `is_existing_client` boolean flag in lead response
- Vendedor role **ALWAYS** excludes existing clients (`ec.cnpj IS NULL` condition)
- Added optional `?exclude_existing=true` parameter for gestor assignment view
- Existing clients never appear in vendedor distribution, only gestor can see them

### Task 3: Frontend Status & Badges (Commit 7bc5514)
- Updated STATUS_OPTIONS to 5 statuses: ['Não Contatado', 'Ainda Não', 'Retorno', 'Proposta', 'Fechado']
- Added gray color for 'Não Contatado': `bg-gray-500/20 text-gray-400`
- Added purple "CLIENTE EXISTENTE" badge on lead rows (gestor view only)
- Added existing client badge to lead detail page header
- New leads now display gray "Não Contatado" badge by default

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

### Schema Verification
- `existing_clients` table exists with CNPJ column and index ✓
- `contact_notes` table exists and ready for timeline feature ✓
- `vendedor_projetos.status_contato` default is 'Não Contatado' ✓
- Migration converted 3,251 leads to 'Não Contatado' status ✓

### API Verification
- Leads API returns `is_existing_client` flag in response ✓
- LEFT JOIN to `existing_clients` table included in query ✓
- Vendedor role always excludes existing clients ✓
- Optional `exclude_existing` parameter available for gestor ✓

### Frontend Verification
- Status dropdowns show 5 options including 'Não Contatado' ✓
- Gray badge displays for 'Não Contatado' status ✓
- Purple "CLIENTE EXISTENTE" badge added (gestor view) ✓
- TypeScript compiles without new errors ✓

## Technical Notes

### Database State After Migration
- Total leads: 3,252
- Status distribution:
  - 'Não Contatado': 3,251 (99.97%)
  - 'Ainda Não': 1 (0.03% - had observations, not migrated)
- Proponentes table: 27,215 records with contact info
- CNPJ overlap: 3,225 matches between vendedor_projetos and proponentes

### Existing Clients Filtering Logic
```sql
-- Vendedor query (automatic exclusion)
SELECT vp.*, u.nome as vendedor_nome, ec.cnpj IS NOT NULL as is_existing_client
FROM vendedor_projetos vp
LEFT JOIN users u ON vp.vendedor_id = u.id
LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj
WHERE vp.vendedor_id = $vendedor_id
  AND ec.cnpj IS NULL  -- vendedores never see existing clients

-- Gestor query (optional exclusion)
WHERE 1=1
  AND (ec.cnpj IS NULL OR $exclude_existing = false)
```

### Status Flow (Decision #1)
```
Não Contatado → Ainda Não / Retorno / Proposta → Fechado
     (gray)      (red)    (amber)   (blue)       (green)
```

## Next Steps (Plan 02)

Plan 02 will add:
- CSV import for existing clients (140+ CNPJs from Tito)
- Management UI for existing_clients table
- Alert system when new emendas detected for existing clients

## Self-Check: PASSED

Verification of all claims:

**Created files:**
- [x] .planning/phases/11-lead-management-contact-tracking/11-01-SUMMARY.md ✓

**Modified files:**
- [x] web/src/app/api/setup-crm/route.ts ✓
- [x] web/src/app/api/leads/route.ts ✓
- [x] web/src/lib/types.ts ✓
- [x] web/src/app/leads/page.tsx ✓
- [x] web/src/app/lead/[cnpj]/page.tsx ✓

**Commits:**
- [x] 0968fd1 - feat(11-01): add existing_clients table, contact_notes, and Não Contatado status ✓
- [x] e3fa370 - feat(11-01): filter existing clients in leads API ✓
- [x] 7bc5514 - feat(11-01): update frontend to support 5 statuses and existing client badges ✓
