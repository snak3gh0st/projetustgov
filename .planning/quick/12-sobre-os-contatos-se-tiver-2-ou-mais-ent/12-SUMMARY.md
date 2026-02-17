---
phase: quick-12
plan: "01"
subsystem: contacts
tags: [contacts, enrichment, brasilapi, lead_contacts, repo-sync, backfill]
dependency_graph:
  requires: [lead_contacts table, repo-sync daily sync, BrasilAPI, siconv_proponentes]
  provides: [multi-contact population in daily sync, /api/enrich-contacts backfill endpoint]
  affects: [lead_contacts table, repo-sync.ts, enrich-contacts API route]
tech_stack:
  added: []
  patterns: [INSERT ON CONFLICT DO NOTHING pattern via check-before-insert, Map-based pre-load to avoid N+1, phone normalization via digit stripping]
key_files:
  created:
    - web/src/app/api/enrich-contacts/route.ts
  modified:
    - web/src/lib/repo-sync.ts
decisions:
  - "Export formatPhone from repo-sync.ts to allow reuse in backfill endpoint"
  - "Pre-load all lead_contacts into memory Map to avoid N+1 DB queries per CNPJ"
  - "Normalize phones by stripping non-digits and emails by lowercasing for duplicate detection"
  - "BrasilAPI phone2 only inserted as separate entry when normalized digits differ from phone1"
metrics:
  duration: "2m 36s"
  completed: "2026-02-17"
  tasks_completed: 2
  files_changed: 2
---

# Quick Task 12: Multi-contact Population from BrasilAPI + Proponentes

**One-liner:** Multi-contact population during daily sync and backfill via exportable formatPhone, brasilApiContacts Map in STEP 9, and gestor-only /api/enrich-contacts endpoint capturing ddd_telefone_2 as a separate lead_contacts row.

## What Was Built

### Task 1: repo-sync.ts multi-contact population (STEP 9)

**File:** `web/src/lib/repo-sync.ts`

Key changes:
- Exported `formatPhone` so the backfill endpoint can import it
- Added `contacts_created: number` to `SyncStats` interface
- In STEP 8: capture `ddd_telefone_2` from BrasilAPI and store it alongside phone1/email in a `brasilApiContacts` Map per CNPJ
- Added **STEP 9** "Populate lead_contacts from enrichment data" that runs for ALL CNPJs in the sync batch:
  - Queries existing `lead_contacts` per CNPJ
  - Builds normalized phone/email sets for duplicate detection
  - Inserts proponentes contact (telefone + email) if not duplicate
  - Inserts BrasilAPI phone1+email as one entry if not duplicate
  - Inserts BrasilAPI phone2 as a separate entry (no email) if different from phone1 and not duplicate
  - Marks first contact as `principal = true`, rest as `false`
  - Respects Vercel timeout (skips STEP 9 if >200s elapsed)
- Logs `contacts_created` count in final summary line

### Task 2: /api/enrich-contacts backfill endpoint

**File:** `web/src/app/api/enrich-contacts/route.ts`

- Gestor-only (`session.role !== 'gestor'` returns 403)
- `maxDuration = 120` for Vercel Pro
- Pre-loads all vendedor_projetos CNPJs with their telefone/email in one query
- Pre-loads all existing lead_contacts into a Map to avoid N+1 queries
- For each CNPJ:
  1. Inserts vendedor_projetos (proponentes) contact if not duplicate
  2. Calls BrasilAPI with 10s timeout and 300ms rate limiting
  3. Inserts phone1+email as one entry, phone2 as separate entry (if different)
- Stops early if elapsed > 100s to avoid timeout
- Returns JSON summary: `{ success, cnpjs_processed, contacts_created, contacts_skipped_duplicate, api_errors, elapsed_ms }`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (full project type check)
- `ddd_telefone_2` is used in `repo-sync.ts`
- `INSERT INTO lead_contacts` logic exists in `repo-sync.ts`
- `/api/enrich-contacts/route.ts` exists with GET handler and gestor auth check
- No existing lead_contacts logic broken

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | a49be16 | feat(quick-12): add multi-contact population to repo-sync daily sync |
| 2    | 2fcf30d | feat(quick-12): create /api/enrich-contacts backfill endpoint for existing leads |

## Self-Check: PASSED

- `web/src/lib/repo-sync.ts` - exists with ddd_telefone_2, lead_contacts INSERT, contacts_created
- `web/src/app/api/enrich-contacts/route.ts` - exists with GET handler, gestor auth
- Both commits exist in git history
- `npx tsc --noEmit` passes
