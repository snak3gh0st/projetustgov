---
phase: quick
plan: 5
type: quick-task
subsystem: crm-ux
tags: [bugfix, ux-improvement, vendedor-pipeline, sale-tracking]
completed: 2026-02-13
duration: 29min

dependency_graph:
  requires: [quick-4, quick-7, 11-05]
  provides: [lead-detail-fix, reatribuir-button, sale-value-tracking, closing-fee-separation]
  affects: [leads-table, lead-detail-page, slide-over, dashboard-vendedor]

tech_stack:
  added: [valor_venda-field, closing-fee-display]
  patterns: [window-prompt-for-sale-value, conditional-pipeline-annotations, separated-commission-display]

key_files:
  created: []
  modified:
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/app/leads/page.tsx
    - web/src/components/LeadSlideOver.tsx
    - web/src/app/page.tsx
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/lib/types.ts

decisions: []

metrics:
  tasks_completed: 3
  commits: 2
  files_modified: 6
  verification: human-verified
---

# Quick Task 5: Fix Critical CRM Bugs and UX Improvements

**One-liner:** Fixed lead detail runtime error, improved leads table UX with reatribuir button and priority highlighting, added sale value tracking for closed deals, and separated commission/closing fee in vendedor pipeline.

## Objective

Fix critical bugs blocking CRM usage and implement UX improvements requested by sales team, including better readability in leads table, proper sale value tracking for "Fechado" deals, and separated display of commission vs closing fee.

## Tasks Executed

### Task 1: Fix lead detail page error, leads table bugs, and column readability
**Status:** ✅ Complete
**Commit:** `aa215ef`

**Changes:**
- Fixed runtime error in lead detail page by moving `updateContact` function after `first` variable definition
- Changed "Atribuir" button to show "Reatribuir" for assigned leads, with vendedor name displayed next to button
- Replaced small red dot priority indicator with full row highlight (`bg-red-500/10 border-l-2 border-l-red-500`)
- Added `title` tooltips to truncated columns (Nome, Parlamentar, Ministerio, Municipio) for hover readability
- Increased Nome max-width from 180px to 250px, Ministerio from 140px to 180px
- Removed empty priority indicator column from table header
- Made Observacoes/Detalhes section always visible and editable in slide-over when `canModify=true`

**Files modified:**
- `web/src/app/lead/[cnpj]/page.tsx` - Fixed function order, added sale value prompt
- `web/src/app/leads/page.tsx` - Improved table UX, dynamic "Atribuir"/"Reatribuir" button
- `web/src/components/LeadSlideOver.tsx` - Always-visible Detalhes field

**Verification:** Build passed, no TypeScript errors

---

### Task 2: Add sale value input on "Fechado" status and separate commission/closing fee
**Status:** ✅ Complete
**Commit:** `32e9187`

**Changes:**
- Added `valor_venda` field to `VendedorProjeto` type and API support
- Implemented window.prompt for sale value when status changes to "Fechado" (both leads table and lead detail page)
- Display sale value in slide-over when lead status is "Fechado"
- Split vendedor dashboard cards: "Comissao Vendas" (commission) and "Taxa Fechamento" (R$50/deal)
- Added closing fee annotation below pipeline "Fechado" count: `{count} × R$50 = R${total}` (vendedor view only)

**Files modified:**
- `web/src/lib/types.ts` - Added `valor_venda: number | null` field
- `web/src/app/api/leads/[cnpj]/route.ts` - Support PATCH with valor_venda
- `web/src/app/leads/page.tsx` - Prompt for sale value on "Fechado"
- `web/src/app/lead/[cnpj]/page.tsx` - Prompt for sale value on "Fechado"
- `web/src/components/LeadSlideOver.tsx` - Display sale value when "Fechado"
- `web/src/app/page.tsx` - Separate commission and closing fee cards + pipeline annotation

**Verification:** Build passed, no TypeScript errors

---

### Task 3: Human verification checkpoint
**Status:** ✅ Complete
**Verification:** User-approved

**Verified:**
- Admin view shows "Reatribuir" for assigned leads, "Atribuir" for unassigned
- Max priority leads have red row highlight (entire row)
- Hover tooltips work on truncated columns
- Lead detail page loads without runtime error
- Detalhes field is always visible/editable in slide-over
- "Fechado" status prompts for sale value
- Sale value displays in slide-over
- Vendedor dashboard shows separated commission and closing fee
- Pipeline bar shows closing fee calculation for vendedores

## Deviations from Plan

None - plan executed exactly as written.

## Impact

**User Experience:**
- Gestor can now clearly see assignment status ("Reatribuir" vs "Atribuir")
- Priority leads are visually distinct with full row highlighting
- Truncated content is accessible via hover tooltips
- Sales team can track actual sale values for closed deals
- Vendedores see clear separation between commission (percentage-based) and closing fee (flat R$50/deal)

**Data Quality:**
- Sale values are now captured at the moment deals close
- Commission calculations can be based on actual sale value (future enhancement)

**Maintainability:**
- Lead detail page function ordering fixed (no runtime errors)
- Detalhes field consistently editable across all views

## Technical Notes

**Sale Value Prompt Pattern:**
Used `window.prompt()` for quick implementation. Future enhancement could replace with modal dialog for better UX.

**Closing Fee Display:**
Hardcoded R$50/deal rate. Could be made configurable via environment variable or database setting in future.

**Priority Indicator:**
Moved from column-based dot to full row highlight for better visual hierarchy without cluttering table.

## Self-Check

**Created files:**
- `.planning/quick/5-fix-critical-crm-bugs-and-ux-improvement/5-SUMMARY.md` (this file)

**Modified files:**
- `web/src/app/lead/[cnpj]/page.tsx` - FOUND
- `web/src/app/leads/page.tsx` - FOUND
- `web/src/components/LeadSlideOver.tsx` - FOUND
- `web/src/app/page.tsx` - FOUND
- `web/src/app/api/leads/[cnpj]/route.ts` - FOUND
- `web/src/lib/types.ts` - FOUND

**Commits:**
- `aa215ef` - FOUND
- `32e9187` - FOUND

## Self-Check: PASSED

All files modified as documented. All commits exist in git history. Human verification completed successfully.
