---
phase: quick-8
plan: 01
type: summary
subsystem: existing-clients-import
tags: [backend, frontend, api, upload, excel, deduplication]
dependency_graph:
  requires: [existing_clients table, session auth, XLSX library]
  provides: [/api/import-existing-clients endpoint, /upload-clientes UI]
  affects: [existing_clients table]
tech_stack:
  added: []
  patterns: [Next.js API Route, React drag-drop upload, Excel parsing, gestor role check, ON CONFLICT deduplication]
key_files:
  created:
    - src/app/api/import-existing-clients/route.ts
    - src/app/upload-clientes/page.tsx
  modified: []
decisions:
  - Used ON CONFLICT DO NOTHING for safe CNPJ deduplication (no data loss risk)
  - Restricts access to gestor role only (both API and UI)
  - Case/accent-insensitive column validation for flexibility
metrics:
  tasks_completed: 2
  duration_minutes: 2.87
  completed_at: "2026-02-12T22:58:27Z"
---

# Quick Task 8: Create Endpoint and UI for Uploading Existing Clients

**One-liner:** POST /api/import-existing-clients + /upload-clientes page for safely importing CLIENTES.xlsx with CNPJ deduplication and gestor-only access.

## What Was Built

Created a dedicated system for importing existing Projetus clients from CLIENTES.xlsx (~78 clients) into the existing_clients table. This prevents vendedores from receiving leads that belong to existing clients.

### Components

**1. API Endpoint: `/api/import-existing-clients`**
- POST endpoint accepting .xlsx/.xls files
- Validates presence of CNPJ and ENTIDADE columns (case/accent-insensitive)
- Parses first sheet only using XLSX library
- Cleans CNPJ (strips non-digits, pads to 14 chars)
- Safe insertion with `ON CONFLICT (cnpj) DO NOTHING` (prevents duplicates and data loss)
- Tracks counts: inserted, duplicates, skipped (invalid CNPJ), errors
- Restricts to gestor role via session check
- Returns JSON: `{ success, total, inserted, duplicates, skipped, errors }`

**2. UI Page: `/upload-clientes`**
- Drag-drop file upload zone (accepts .xlsx/.xls only)
- Prominent amber-styled instructions panel explaining:
  - Upload CLIENTES.xlsx with existing Projetus clients
  - Required columns: CNPJ and ENTIDADE
  - Automatic duplicate skipping (no data loss)
  - Gestor-only operation
- Results display showing 5 cards: Total, Inseridos (cyan), Duplicatas (amber), Ignorados (gray), Erros (red)
- Gestor-only access check with "Acesso restrito" message for non-gestores
- Dark theme styling matching existing upload page (bg-gray-950, white/5 cards, cyan accents)
- Back link to dashboard

## Implementation Details

### Patterns Followed
- Same Excel parsing pattern as `import-spreadsheet/route.ts` (getPool, cleanCNPJ, normalizeHeader)
- Same upload UI pattern as `upload/page.tsx` (drag-drop, gestor check, results grid)
- Same auth check pattern as `auth-actions.ts` (session check via `auth()` from `@/lib/auth`)

### Safety Mechanisms
- `ON CONFLICT (cnpj) DO NOTHING`: Never overwrites or deletes existing records
- Read-append only approach: no UPDATE or DELETE operations
- Invalid CNPJ rows are skipped (tracked in skipped count)
- Clear error reporting with counts for each category

### Column Validation
- Normalizes headers: lowercase, trim, remove accents, collapse whitespace
- Flexible matching: checks if normalized header includes "cnpj" or "entidade"
- Returns clear error if columns missing: "Planilha deve conter colunas CNPJ e ENTIDADE"
- Includes found headers in error response for debugging

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Create /api/import-existing-clients POST endpoint | 20d80d0 | Complete |
| 2 | Create /upload-clientes page with instructions | 49522cc | Complete |

## Verification Results

Build check:
- `npx next build` completed successfully with no TypeScript errors
- Both new routes appear in build output: `/api/import-existing-clients` and `/upload-clientes`

Pattern verification:
- ON CONFLICT DO NOTHING present at line 116 of route.ts
- Instructions block present at line 119 of page.tsx
- Both files exist and follow codebase patterns

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

Files created:
- FOUND: src/app/api/import-existing-clients/route.ts
- FOUND: src/app/upload-clientes/page.tsx

Commits verified:
- FOUND: 20d80d0 (API endpoint)
- FOUND: 49522cc (Upload page)

Safety features verified:
- ON CONFLICT DO NOTHING present in SQL query
- Gestor-only access check in both API and UI
- Instructions panel clearly visible in UI

## Self-Check: PASSED
