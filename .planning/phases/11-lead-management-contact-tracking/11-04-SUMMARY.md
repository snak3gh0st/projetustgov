---
phase: 11-lead-management-contact-tracking
plan: 04
subsystem: crm-contact-tracking
tags: [contact-notes, timeline, visualizador-role, rbac]
dependency_graph:
  requires:
    - 11-01-PLAN.md (contact_notes table)
    - 10-01-PLAN.md (auth system)
  provides:
    - Contact notes API with RBAC
    - Timeline UI component for lead interaction history
    - Visualizador read-only role
  affects:
    - Lead detail page (added timeline section)
    - Auth system (3-role model)
tech_stack:
  added:
    - Contact notes CRUD endpoints
    - Timeline component with relative timestamps
  patterns:
    - Role-based access control (canModifyData helper)
    - Client-side session checking for UI permissions
    - Timeline UI with tipo-based icons and colors
key_files:
  created:
    - web/src/app/api/leads/[cnpj]/notes/route.ts
    - web/src/components/ContactNotesTimeline.tsx
  modified:
    - web/src/lib/types.ts (UserRole type)
    - web/src/lib/auth.ts (visualizador in callbacks)
    - web/src/lib/dal.ts (canModifyData, visualizador filters)
    - web/src/types/next-auth.d.ts (visualizador type declarations)
    - web/src/app/api/setup-crm/route.ts (visualizador constraint, Paulo user)
    - web/src/app/lead/[cnpj]/page.tsx (timeline integration)
decisions:
  - decision: "Visualizador role treated like gestor for read access, blocked for writes"
    rationale: "Leadership needs full visibility without modification risk"
    impact: "Clean separation of view-only vs. write permissions"
  - decision: "Contact notes sorted by created_at DESC"
    rationale: "Most recent interactions are most relevant for sales context"
    impact: "Timeline shows newest first"
  - decision: "Client-side session fetch for canModify permission"
    rationale: "Lead detail page is client component, needs role check for UI"
    impact: "Extra API call to /api/auth/session on page load"
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 2
  files_modified: 6
  commits: 3
  completed_date: 2026-02-12
---

# Phase 11 Plan 04: Contact Notes Timeline & Visualizador Role Summary

**One-liner:** Contact notes timeline with tipo-based icons, relative timestamps, and read-only visualizador role for leadership visibility

## What Was Built

Implemented contact notes tracking system (CONT-01, CONT-02) with timeline UI and added visualizador role (Decision #6) for read-only leadership access.

### Task 1: Add visualizador role to auth system and DAL

**Commit:** `fb55fbf`

- Updated `UserRole` type to include `'visualizador'`
- Extended next-auth type declarations in `next-auth.d.ts`
- Modified auth.ts JWT and session callbacks to support visualizador
- Updated `verifySession` and `getApiSession` return types
- Modified `buildVendedorFilter` to treat visualizador like gestor (see all leads)
- Added `canModifyData()` helper function for write permission checks
- Updated `verifyLeadAccess` to grant visualizador read access to all leads
- Migrated users table CHECK constraint to include visualizador
- Created Paulo user (paulo@sigma.com / sigma2026) as visualizador in setup-crm

**Files modified:**
- `web/src/lib/types.ts`
- `web/src/lib/auth.ts`
- `web/src/lib/dal.ts`
- `web/src/types/next-auth.d.ts`
- `web/src/app/api/setup-crm/route.ts`

**Access matrix:**
| Role         | Read Leads | Modify Leads | Admin Actions |
|--------------|------------|--------------|---------------|
| Gestor       | All        | Yes          | Yes           |
| Vendedor     | Assigned   | Yes          | No            |
| Visualizador | All        | No           | No            |

### Task 2: Create contact notes API endpoints

**Commit:** `f1a2cbe`

Created REST API for contact notes at `/api/leads/[cnpj]/notes`:

**GET endpoint:**
- Returns all notes for a CNPJ with `vendedor_nome` joined from users table
- Verifies lead access (vendedor sees assigned, gestor/visualizador see all)
- Sorts by `created_at DESC` (most recent first)
- Returns 401 if not authenticated, 403 if no access

**POST endpoint:**
- Creates new contact note with tipo and observacao
- Validates tipo against allowed values: `['ligacao', 'email', 'whatsapp', 'reuniao', 'outro']`
- Blocks visualizador from creating notes (403 Forbidden: read-only role)
- Verifies lead access before creating
- Returns 201 with created note on success

**Files created:**
- `web/src/app/api/leads/[cnpj]/notes/route.ts`

### Task 3: Build contact notes timeline component and integrate into lead detail page

**Commit:** `ce58545`

Created `ContactNotesTimeline` component with rich UI:

**Timeline features:**
- Displays notes as timeline with tipo-based icons and colors
- Shows relative timestamps: "agora", "há Xm", "há Xh", "há Xd", or formatted date
- Vendedor name displayed for each note
- Empty state: "Nenhuma interação registrada ainda"
- Hover effects on timeline items

**Tipo configuration:**
| Tipo      | Icon | Color             |
|-----------|------|-------------------|
| ligacao   | 📞   | Blue (phone)      |
| email     | 📧   | Cyan              |
| whatsapp  | 💬   | Green             |
| reuniao   | 🤝   | Purple            |
| outro     | 📝   | Gray              |

**Form features (gestor/vendedor only):**
- "+ Nova Interação" button (hidden for visualizador)
- Dropdown to select tipo
- Textarea for observacao
- Form validation (observacao required)
- Auto-refresh timeline after creation
- Cancel button to hide form

**Integration:**
- Added to lead detail page below emendas table
- Fetches session client-side to determine `canModify` permission
- Passed to timeline component as prop

**Files created:**
- `web/src/components/ContactNotesTimeline.tsx`

**Files modified:**
- `web/src/app/lead/[cnpj]/page.tsx`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated users table CHECK constraint**
- **Found during:** Task 1
- **Issue:** Existing users table had CHECK constraint limiting role to ('gestor', 'vendedor')
- **Fix:** Added migration to drop and recreate constraint with visualizador included
- **Files modified:** `web/src/app/api/setup-crm/route.ts`
- **Commit:** `fb55fbf` (included in Task 1)

**2. [Rule 2 - Missing critical] Added UserRole type export**
- **Found during:** Task 1
- **Issue:** CRMUser interface used inline union type instead of shared UserRole type
- **Fix:** Created exported UserRole type, updated CRMUser to use it, added missing created_at/updated_at fields
- **Files modified:** `web/src/lib/types.ts`
- **Commit:** Part of earlier work (types.ts was already committed)

## Verification

### TypeScript Compilation
```bash
cd web && npx tsc --noEmit
```
**Result:** ✅ No errors

### Database Verification
- Paulo user created with visualizador role
- Users table CHECK constraint includes visualizador
- Contact notes table exists with proper schema

### API Endpoints
- GET /api/leads/[cnpj]/notes - Returns notes array
- POST /api/leads/[cnpj]/notes - Creates note, validates tipo, blocks visualizador

### UI Components
- ContactNotesTimeline renders with tipo icons
- Form hidden for visualizador role
- Timeline integrated into lead detail page

## Self-Check: PASSED

**Files created:**
```bash
FOUND: web/src/app/api/leads/[cnpj]/notes/route.ts
FOUND: web/src/components/ContactNotesTimeline.tsx
```

**Commits exist:**
```bash
fb55fbf feat(11-04): add visualizador role to auth system and DAL
f1a2cbe feat(11-04): create contact notes API endpoints
ce58545 feat(11-04): add contact notes timeline to lead detail page
```

**Type system:**
- UserRole type includes visualizador ✅
- Next-auth declarations updated ✅
- DAL helpers support visualizador ✅

**RBAC implementation:**
- Visualizador can read all leads ✅
- Visualizador blocked from writes (canModifyData) ✅
- Timeline form hidden for visualizador ✅

**Timeline UI:**
- Notes sorted DESC by created_at ✅
- Tipo icons render correctly ✅
- Relative timestamps formatted ✅
- Vendedor names joined ✅

## Success Criteria

- [x] Visualizador role exists in auth system (gestor/vendedor/visualizador)
- [x] Visualizador user created (paulo@sigma.com) in setup-crm
- [x] Visualizador can view all leads but cannot modify
- [x] Contact notes API endpoints exist (GET, POST)
- [x] POST /notes validates tipo and checks write permissions
- [x] ContactNotesTimeline component displays notes with icons and timestamps
- [x] Vendedor/gestor can create notes via timeline form
- [x] Visualizador sees timeline but cannot create notes
- [x] Notes sorted by created_at DESC (most recent first)
- [x] TypeScript compiles without errors

## Next Steps

- **Plan 11-03:** Already completed (priority indicators and existing client badges)
- **Phase 12:** Pipeline Kanban board for lead status visualization
- **Phase 13:** Commission tracking and reporting
