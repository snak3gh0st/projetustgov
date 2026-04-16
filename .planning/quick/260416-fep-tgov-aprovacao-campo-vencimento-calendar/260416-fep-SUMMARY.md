---
phase: quick
plan: 260416-fep
subsystem: tgov-aprovacao
tags: [tgov, aprovacao, vencimento, date-picker, crm-interno]
dependency_graph:
  requires: []
  provides: [tgov_interactions.vencimento, aprovacao-vencimento-ui]
  affects: [tgov-dashboard, aprovacao-sidecard, aprovacao-table]
tech_stack:
  added: []
  patterns: [conditional-tab-rendering, date-picker-crm-field]
key_files:
  created:
    - migrations/add_tgov_interactions_vencimento.sql
  modified:
    - web/src/app/api/tgov/interaction/[key]/route.ts
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/lib/tgov.ts
    - web/src/app/tgov/TGovDashboardClient.tsx
decisions:
  - "aprovacao tab sends vencimento field in PATCH, execucao tab sends status field — conditional body in handleSave"
  - "VencimentoBadge parses date as local (appending T00:00:00) to avoid UTC offset shifting date display"
  - "date input uses ISO YYYY-MM-DD value directly from DB — no conversion needed on load"
metrics:
  duration: ~10min
  completed: 2026-04-16
---

# Quick Task 260416-fep: TGov Aprovacao Vencimento Date Picker Summary

**One-liner:** Replaced Situacao status pills in Aprovacao CRM Interno with a date picker for Vencimento, and updated the Aprovacao table column to show expiry date with Vencida/Em tempo badge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add vencimento column to tgov_interactions and update API | 9a4d20c | migrations/add_tgov_interactions_vencimento.sql, interaction route, aprovacao route, tgov.ts |
| 2 | Replace Situacao with Vencimento date picker in Aprovacao UI | 8cbe7b9 | TGovDashboardClient.tsx |

## What Was Built

### Migration
`migrations/add_tgov_interactions_vencimento.sql` adds `vencimento DATE` column to `tgov_interactions` using `ADD COLUMN IF NOT EXISTS` (idempotent).

### API Changes
- **GET `/api/tgov/interaction/[key]`**: Now returns `vencimento` (ISO date string or null) in response.
- **PATCH `/api/tgov/interaction/[key]`**: Accepts `vencimento` in request body, validates it's a valid date, stores as `DATE` column. INSERT and ON CONFLICT UPDATE both handle the field.
- **GET `/api/tgov/aprovacao`**: Selects `ti.vencimento::text AS vencimento` from the existing LEFT JOIN on `tgov_interactions`, maps to `vencimento: r.vencimento ?? null` in table row response.

### Type Update
`TGovAprovacaoTableRow` in `tgov.ts` gets `vencimento?: string | null` field.

### UI Changes
**`VencimentoBadge` component:** New helper that shows formatted `dd/mm/yyyy` date + colored badge (red "Vencida" if past, green "Em tempo" if future). Handles null with `—`.

**`TGovInteractionPanel`:**
- Added `vencimento` state, loaded from API alongside `status` and `obs`.
- When `tab === 'aprovacao'`: renders `<input type="date">` labeled "Vencimento" with inline `VencimentoBadge` preview below the picker.
- When `tab !== 'aprovacao'` (execucao): unchanged status pills as before.
- `handleSave`: sends `{ vencimento, obs, tab }` for aprovacao, `{ status, obs, tab }` for execucao.

**`AprovacaoTable`:** "Situação" column header replaced with "Vencimento" (sortable by `vencimento`), cell renders `<VencimentoBadge vencimento={row.vencimento} />`.

**`AprovacaoSidecard`:** `<SituacaoBadge situacao={row.situacao} />` at the top of the content area replaced with `<VencimentoBadge vencimento={row.vencimento} />`.

**ExecucaoTable and ExecucaoSidecard:** Completely unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `migrations/add_tgov_interactions_vencimento.sql` exists
- [x] `web/src/app/api/tgov/interaction/[key]/route.ts` updated
- [x] `web/src/app/api/tgov/aprovacao/route.ts` updated
- [x] `web/src/lib/tgov.ts` updated
- [x] `web/src/app/tgov/TGovDashboardClient.tsx` updated
- [x] Commit 9a4d20c exists (Task 1)
- [x] Commit 8cbe7b9 exists (Task 2)
- [x] `npx tsc --noEmit` — no errors

## Self-Check: PASSED
