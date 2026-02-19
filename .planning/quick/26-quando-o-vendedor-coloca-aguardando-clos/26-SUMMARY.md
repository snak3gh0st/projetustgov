---
phase: quick-26
plan: "01"
subsystem: lead-detail-page, api-leads-patch, debug-closer
tags: [aguardando-closer, sale-modal, closer-id, debug-endpoint, vendedor-flow]
dependency_graph:
  requires: [quick-24]
  provides: [aguardando-closer-direct-patch, closer-id-logging, recent-closer-debug]
  affects: [lead-detail-page, leads-list-page, paulo-gabriel-leads-view]
tech_stack:
  added: []
  patterns: [console-log-diagnostic, debug-endpoint-enhancement]
key_files:
  created: []
  modified:
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/app/api/debug-closer/route.ts
decisions:
  - "Aguardando Closer bypasses SaleModal — no valor_venda required at handoff stage"
  - "Diagnostic console.log added to Aguardando Closer block for Vercel log verification"
  - "debug-closer endpoint extended with recent_closer_assignments for instant post-deploy verification"
metrics:
  duration: "~1 minute"
  completed_date: "2026-02-19"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase quick-26 Plan 01: Aguardando Closer SaleModal Fix Summary

**One-liner:** Removed SaleModal intercept for 'Aguardando Closer' in lead detail page so status change goes directly to PATCH API, setting closer_id = Paulo's UUID without requiring valor_venda.

## What Was Built

The lead detail page (`/lead/[cnpj]`) was intercepting both 'Fechado' AND 'Aguardando Closer' status changes and routing them through SaleModal, which requires a `valor_venda` input. Since 'Aguardando Closer' is a handoff action (no sale value known yet), users who dismissed or cancelled the modal never sent the PATCH — so `closer_id` was never set, and Paulo's leads list never received the lead.

### Task 1: Remove SaleModal intercept for Aguardando Closer

**File:** `web/src/app/lead/[cnpj]/page.tsx`

Changed the condition in `updateProjeto` from:
```typescript
if (field === 'status_contato' && (value === 'Fechado' || value === 'Aguardando Closer')) {
```
to:
```typescript
if (field === 'status_contato' && value === 'Fechado') {
```

Now only 'Fechado' opens SaleModal. 'Aguardando Closer' falls through to the direct `fetch PATCH` call. The existing "Aguardando Closer" banner with "Fechar Venda" / "Cancelar" buttons was already correct — no change needed there.

**Commit:** `b70d30e`

### Task 2: Add diagnostic console.log lines to Aguardando Closer block

**File:** `web/src/app/api/leads/[cnpj]/route.ts`

Added two `console.log` lines inside the existing Aguardando Closer block (from quick-24):
1. At block entry: logs `project ID`, `user ID`, `role` — confirms the block was reached
2. After successful `UPDATE closer_id`: logs Paulo's UUID — confirms assignment succeeded

These enable Vercel log verification post-deploy without changing any logic.

**Commit:** `4645c6e`

### Task 3: Enhance debug endpoint with recent_closer_assignments

**File:** `web/src/app/api/debug-closer/route.ts`

Added a 4th field to the debug endpoint response: `recent_closer_assignments` — last 5 rows ordered by `updated_at DESC` where `closer_id IS NOT NULL`. This allows instant verification: set a lead to Aguardando Closer, hit `/api/debug-closer`, see the lead appear in `recent_closer_assignments` within seconds.

**Commit:** `e5e488c`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript: Zero errors across all 3 modified files (`npx tsc --noEmit`)
- Manual (post-deploy): Navigate to `/lead/{cnpj}`, change any emenda status dropdown to "Aguardando Closer" — status updates immediately without SaleModal opening
- Vercel logs: After status change, logs show `[PATCH] Aguardando Closer triggered` + `[PATCH] closer_id set to {uuid}`
- Debug endpoint: `GET /api/debug-closer` returns `recent_closer_assignments` array; changed lead appears with non-null `closer_id`

## Self-Check: PASSED

Files exist:
- FOUND: `web/src/app/lead/[cnpj]/page.tsx` (modified)
- FOUND: `web/src/app/api/leads/[cnpj]/route.ts` (modified)
- FOUND: `web/src/app/api/debug-closer/route.ts` (modified)

Commits exist:
- FOUND: b70d30e — fix(quick-26): remove Aguardando Closer from SaleModal intercept
- FOUND: 4645c6e — feat(quick-26): add diagnostic console.log lines
- FOUND: e5e488c — feat(quick-26): add recent_closer_assignments to debug-closer endpoint
