---
phase: quick-9
plan: 01
subsystem: api, ui, database
tags: [contacts, crud, inline-edit, telefone-status, multi-contact]

requires:
  - phase: 11-lead-management
    provides: lead detail page, contact notes pattern, dal helpers
provides:
  - lead_contacts table with telefone_status tracking
  - CRUD API at /api/leads/[cnpj]/contacts
  - LeadContacts UI component with inline CRUD
  - 'Telefone Invalido' as 5th status_contato option
affects: [lead-detail, setup-crm, vendedor-workflow]

tech-stack:
  added: []
  patterns: [multi-contact-per-lead, telefone-status-tracking, inline-crud-component]

key-files:
  created:
    - web/src/app/api/leads/[cnpj]/contacts/route.ts
    - web/src/components/LeadContacts.tsx
  modified:
    - web/src/lib/types.ts
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/lead/[cnpj]/page.tsx

key-decisions:
  - "Telefone status per contact (valido/invalido/nao_atende/desconhecido) for data quality tracking"
  - "One principal contact per CNPJ with automatic unset of previous principal"
  - "Migration copies existing vendedor_projetos telefone/email as first principal contact"

patterns-established:
  - "LeadContacts inline CRUD: same white card + border pattern as ContactNotesTimeline"
  - "CRUD route pattern: GET/POST/PATCH/DELETE on same route file with dynamic UPDATE builder"

requirements-completed: [CONTACTS-01, CONTACTS-02, CONTACTS-03]

duration: 3min
completed: 2026-02-17
---

# Quick Task 9: Lead Contacts Table + Multi-Contact UI Summary

**Multi-contact per lead with telefone_status tracking, inline CRUD, and 'Telefone Invalido' as 5th status option**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T14:53:40Z
- **Completed:** 2026-02-17T14:56:38Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `lead_contacts` table with schema, indexes, and migration from existing vendedor_projetos data
- Built complete CRUD API (GET/POST/PATCH/DELETE) following the exact same auth pattern as notes route
- Built LeadContacts UI component with inline add/edit/delete, telefone_status dropdown, and principal toggle
- Added 'Telefone Invalido' as 5th status_contato option on emendas

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lead_contacts table + type + CRUD API** - `e1b8297` (feat)
2. **Task 2: LeadContacts UI component + integration into lead detail page** - `91fb57d` (feat)

## Files Created/Modified
- `web/src/lib/types.ts` - Added LeadContact interface and TelefoneStatus type
- `web/src/app/api/setup-crm/route.ts` - Added lead_contacts table creation + data migration from vendedor_projetos
- `web/src/app/api/leads/[cnpj]/contacts/route.ts` - CRUD API with GET/POST/PATCH/DELETE
- `web/src/components/LeadContacts.tsx` - Multi-contact UI with inline CRUD, telefone_status dropdown, principal toggle
- `web/src/app/lead/[cnpj]/page.tsx` - Imported LeadContacts, added between contact info and emendas, added Telefone Invalido status

## Decisions Made
- Telefone status is per-contact (not per-lead) enabling granular data quality tracking per phone number
- One principal contact per CNPJ enforced at API level (PATCH unsets all others before setting new principal)
- Migration copies existing vendedor_projetos telefone/email as first principal contact (DISTINCT ON cnpj)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Run `/api/setup-crm` as gestor** to create the `lead_contacts` table and migrate existing telefone/email data from vendedor_projetos.

## Next Actions
- Deploy to Vercel
- Visit `/api/setup-crm` as gestor to create table + run migration
- Verify multi-contact CRUD on any lead detail page

## Self-Check: PASSED

- All 5 files verified present on disk
- Commit e1b8297 verified in git log
- Commit 91fb57d verified in git log
- TypeScript compiles cleanly (tsc --noEmit)
- Next.js build succeeds (npm run build)

---
*Quick Task: 9*
*Completed: 2026-02-17*
