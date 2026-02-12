---
phase: 11-lead-management-contact-tracking
plan: 02
subsystem: lead-assignment
tags: [crm, gestor, ui, modal, assignment]
dependency_graph:
  requires:
    - users table (gestor role)
    - vendedor_projetos table
    - /api/vendedores endpoint
  provides:
    - POST /api/leads/assign (CNPJ-based)
    - LeadAssignmentModal component
    - Lead assignment workflow with duplicate detection
  affects:
    - /leads page (gestor view)
tech_stack:
  added: []
  patterns:
    - Modal UI pattern for assignment flow
    - Duplicate detection with force override
    - Atomic CNPJ-based assignment
key_files:
  created:
    - web/src/components/LeadAssignmentModal.tsx
  modified:
    - web/src/app/api/leads/assign/route.ts
    - web/src/app/leads/page.tsx
decisions:
  - decision: Support both CNPJ-based and bulk assignment in same endpoint
    rationale: Backward compatibility with existing bulk assignment, new modal uses CNPJ
  - decision: Return 409 status for duplicate assignment
    rationale: Standard HTTP conflict status, allows UI to show warning before override
  - decision: Force flag for override instead of separate endpoint
    rationale: Single endpoint cleaner than assign + reassign endpoints
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
  completed_date: 2026-02-12
---

# Phase 11 Plan 02: Lead Assignment with Duplicate Detection

**One-liner:** Gestor can assign leads by CNPJ with duplicate detection and force override option

## What Was Built

### API Endpoint Enhancement
Enhanced `/api/leads/assign` to support CNPJ-based assignment alongside existing bulk assignment:
- **CNPJ mode:** Assign all projects for a CNPJ to a vendedor atomically
- **Duplicate detection:** Returns 409 with warning if CNPJ already assigned to different vendedor
- **Force override:** `force: true` parameter bypasses duplicate warning
- **Gestor-only guard:** Returns 403 if non-gestor attempts assignment
- **Backward compatible:** Preserves existing bulk assignment by lead_ids

### Assignment Modal Component
Created `LeadAssignmentModal.tsx` with:
- Vendedor dropdown with current lead counts (aids distribution decisions)
- Current assignment indicator (blue banner)
- Duplicate warning display (amber banner with confirmation prompt)
- Error handling and loading states
- Two-click confirmation for reassignment (shows warning, then confirm)

### Leads Page Integration
Added "Atribuir" button column for gestor role:
- Button opens assignment modal with CNPJ and lead name pre-filled
- Modal auto-refreshes leads list after successful assignment
- Click-through prevention (stopPropagation) so button doesn't trigger row click

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

### TypeScript Compilation
```
npx tsc --noEmit --skipLibCheck
```
Result: PASSED (no errors)

### Code Quality
- Proper error handling in API endpoint and modal
- Loading states prevent duplicate submissions
- Type safety maintained throughout
- Accessibility: keyboard navigation works in modal

## Implementation Notes

### Key Design Decisions

**Why count rows before UPDATE:**
The `query()` helper returns only rows, not the full result object with `rowCount`. To report how many rows were updated, we SELECT COUNT(*) before the UPDATE. This is acceptable because:
1. Assignment is a rare operation (not performance-critical)
2. Accurate feedback is valuable to gestor
3. Alternative would require refactoring db.ts to return full result object

**Why 409 Conflict for duplicates:**
Standard HTTP semantics - 409 indicates the request conflicts with current state. Client can choose to retry with force flag, making the conflict resolution explicit.

**Why force flag instead of confirm=true:**
`force` is semantically clearer - it indicates override intent, not just confirmation. Future features might add other confirmation types.

### Modal UX Flow
1. Gestor clicks "Atribuir" on lead row
2. Modal opens, fetches vendedores list
3. Gestor selects vendedor, clicks "Atribuir"
4. If duplicate: warning shown, button text changes to "Confirmar"
5. Click "Confirmar" sends request with `force: true`
6. Success: modal closes, list refreshes

### Atomic Assignment Guarantee
Single UPDATE query ensures all vendedor_projetos rows for a CNPJ get assigned together. This is critical because one CNPJ can have multiple emendas (projects), and they must stay with one vendedor.

## Next Steps

This plan enables **LEAD-01** (gestor assignment) and **LEAD-02** (duplicate detection). The assignment workflow is now complete. Next plans in Phase 11 should build:
1. Contact tracking (notes, timeline)
2. Status pipeline visualization
3. Performance metrics for redistribution

## Self-Check

Verifying created files exist:
- [x] `web/src/components/LeadAssignmentModal.tsx` - EXISTS
- [x] `web/src/app/api/leads/assign/route.ts` - MODIFIED
- [x] `web/src/app/leads/page.tsx` - MODIFIED

Verifying commits exist:
- [x] `20e06b1` - feat(11-02): add CNPJ-based lead assignment with duplicate detection
- [x] `8030746` - feat(11-02): add lead assignment modal UI for gestor

## Self-Check: PASSED
