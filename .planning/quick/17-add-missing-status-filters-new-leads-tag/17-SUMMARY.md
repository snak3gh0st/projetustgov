---
phase: quick-17
plan: "01"
subsystem: leads-ui
tags: [leads, status-filters, ux, badges]
dependency_graph:
  requires: []
  provides: [complete-status-filters, novo-badge]
  affects: [web/src/app/leads/page.tsx, web/src/components/LeadSlideOver.tsx]
tech_stack:
  added: []
  patterns: [tailwind-badge-pattern, helper-function]
key_files:
  modified:
    - web/src/app/leads/page.tsx
    - web/src/components/LeadSlideOver.tsx
decisions:
  - "All 6 statuses added to leads page: Não Contatado, Retorno, Proposta, Aguardando Closer, Fechado, Telefone Invalido"
  - "NOVO badge uses 48h cutoff based on created_at from VendedorProjeto type"
  - "Telefone Invalido uses gray styling (neutral/inactive signal) in both files"
metrics:
  duration: "1m"
  completed: "2026-02-17"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 17: Add Missing Status Filters and NOVO Lead Badge Summary

**One-liner:** Added 2 missing statuses (Aguardando Closer, Telefone Invalido) to all leads page dropdowns and LeadSlideOver badge, plus a green NOVO badge for leads created within 48 hours.

## What Was Built

### Task 1: Add missing statuses to leads page filter and row dropdowns

Updated `STATUS_OPTIONS` in `web/src/app/leads/page.tsx` from 4 to 6 entries:
- Added `'Aguardando Closer'` with `bg-purple-50 text-purple-600` styling
- Added `'Telefone Invalido'` with `bg-gray-50 text-gray-500` styling

These changes automatically propagate to:
1. The status filter `<select>` dropdown at the top of the page
2. The inline status change `<select>` on each lead row
3. The inline status change `<select>` on cascade sub-rows (emendas)

Updated `STATUS_COLORS` in `web/src/components/LeadSlideOver.tsx`:
- Added `'Telefone Invalido': 'bg-gray-50 text-gray-500 border-gray-300'`
- `'Aguardando Closer'` was already present in LeadSlideOver

### Task 2: Add NOVO badge for leads created within last 48 hours

Added `isNewLead(createdAt: string | null): boolean` helper function inside the component that:
- Returns `false` for null/missing created_at
- Compares `created_at` against a cutoff of `Date.now() - 48 * 60 * 60 * 1000`

Added green NOVO badge in the institution name column, placed after the existing CLIENTE badge:
- Styling: `bg-green-50 text-green-600` with `border border-green-200`
- Text: "NOVO" (Portuguese UI language)
- Only visible when `isNewLead(lead.created_at)` returns true

## Verification

- `npx next build` passed with no TypeScript errors
- STATUS_OPTIONS has 6 entries in `leads/page.tsx`
- STATUS_COLORS has 6 entries in `leads/page.tsx`
- STATUS_COLORS has 6 entries in `LeadSlideOver.tsx`
- isNewLead helper and NOVO badge present in `leads/page.tsx`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8e5147d | feat(quick-17): add missing statuses to leads page and LeadSlideOver |
| 2 | 5eda288 | feat(quick-17): add NOVO badge for leads created within last 48 hours |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `web/src/app/leads/page.tsx` - modified, changes committed in 8e5147d and 5eda288
- [x] `web/src/components/LeadSlideOver.tsx` - modified, changes committed in 8e5147d
- [x] Build passed with no errors
- [x] 6 entries in STATUS_OPTIONS (was 4)
- [x] 6 entries in STATUS_COLORS in both files
- [x] isNewLead() helper added
- [x] NOVO badge added in institution name cell
