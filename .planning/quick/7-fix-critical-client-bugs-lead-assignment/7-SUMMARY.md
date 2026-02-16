---
phase: quick-7
plan: 01
subsystem: crm-bugfixes
tags: [bugfix, backend, ui, security, commission]
dependency_graph:
  requires: [phase-13-comissoes, phase-11-lead-management]
  provides: [corrected-dal, corrected-commission-rates, secured-endpoints, tipo-vendedor-ui, lead-unassignment]
  affects: [dal, setup-crm, dashboard-crm, leads-cnpj-api, middleware, leads-page, lead-detail, slide-over, assignment-modal, assign-api]
tech_stack:
  added: []
  patterns: [error-handling, ui-dropdowns, unassignment-flow]
key_files:
  created: []
  modified:
    - web/src/lib/dal.ts
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/middleware.ts
    - web/src/app/leads/page.tsx
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/components/LeadSlideOver.tsx
    - web/src/components/LeadAssignmentModal.tsx
    - web/src/app/api/leads/assign/route.ts
decisions:
  - context: "BUG 1 - DAL queried non-existent lead_assignments table"
    decision: "Fixed verifyLeadAccess to query vendedor_projetos WHERE cnpj AND vendedor_id"
    rationale: "lead_assignments table never existed; assignment tracked via vendedor_id column"
  - context: "BUG 3 - Commission rates were 9%/12% with R$50 flat fee"
    decision: "Changed to 1% SDR / 4% Closer with zero flat fees everywhere"
    rationale: "Correct business rates; updated setup-crm seed, recalculation logic, and PATCH fallbacks"
  - context: "BUG 5 - Dashboard comissao_total summed all leads"
    decision: "Filter comissao_total to only sum leads with status_contato = 'Fechado'"
    rationale: "Commissions only earned on closed deals, not pipeline"
  - context: "BUG 6 - /api/setup-crm and /api/import-spreadsheet were public"
    decision: "Removed both from publicPaths array in middleware"
    rationale: "Security - setup and import endpoints require authentication"
  - context: "BUG 2 - Status change to Fechado failed silently"
    decision: "Check res.ok in both leads/page.tsx and lead/[cnpj]/page.tsx, alert on failure"
    rationale: "User must see errors; prevent optimistic update on failure"
  - context: "BUG 4 - No UI to set tipo_vendedor (SDR/Closer)"
    decision: "Added dropdown in LeadSlideOver and editable selector in lead detail commission section"
    rationale: "Gestor/vendedor must control commission tier; backend already supported PATCH"
  - context: "BUG 8 - No way to unassign a lead"
    decision: "Added 'Remover Atribuicao' button in assignment modal + unassign=true API handler"
    rationale: "Gestor needs ability to remove vendedor from lead (sets vendedor_id to NULL)"
  - context: "BUG 7 - Login redirect edge case"
    decision: "No code change needed; middleware logic already correct"
    rationale: "Middleware properly redirects unauthenticated to /login, authenticated away from /login"
metrics:
  duration_seconds: 327
  tasks_completed: 3
  files_modified: 10
  commits: 3
  build_status: passed
completed: 2026-02-16T13:43:17Z
---

# Quick Task 7: Fix Critical Client Bugs - Lead Assignment

**Fixed 8 production bugs spanning backend data access, commission rates, security, UI error handling, and lead management.**

## Summary

Production CRM had critical bugs that broke core functionality. Fixed broken table references, incorrect commission calculations, inflated dashboard totals, exposed security endpoints, silent PATCH failures, missing tipo_vendedor UI, and lack of lead unassignment.

## Tasks Completed

### Task 1: Fix critical backend bugs (DAL, commission rates, dashboard, security)
**Commit:** `0f31bc2`

Fixed 6 backend bugs in a single atomic commit:

**BUG 1 - dal.ts verifyLeadAccess:**
- Changed query from `lead_assignments` (non-existent table) to `vendedor_projetos`
- Query now: `SELECT 1 FROM vendedor_projetos WHERE cnpj = $1 AND vendedor_id = $2`

**BUG 3 - Commission rates (3 locations):**
1. `setup-crm/route.ts` lines 113-129: Changed recalculation from 9%/12% to 1%/4%, removed R$50 flat
2. `setup-crm/route.ts` lines 203-213: Changed seed config from `9.00, 50.00` to `1.00, 0.00` (SDR), `12.00, 0.00` to `4.00, 0.00` (Closer)
3. `leads/[cnpj]/route.ts` lines 99-121: Changed fallback rates in commission lock CTE from 9%/12% to 1%/4%, flat fee CASE to `0.00`

**BUG 3 + BUG 4 backend - tipo_vendedor PATCH:**
- Added `tipo_vendedor` to PATCH handler in `leads/[cnpj]/route.ts`
- Enables UI to change SDR/Closer dynamically

**BUG 5 - dashboard-crm/route.ts:**
- Changed `SUM(vp.comissao_valor::numeric)` to `SUM(CASE WHEN vp.status_contato = 'Fechado' THEN vp.comissao_valor::numeric ELSE 0 END)`
- Dashboard now only counts confirmed commissions, not pipeline

**BUG 6 - middleware.ts:**
- Removed `/api/setup-crm` and `/api/import-spreadsheet` from `publicPaths`
- Secured setup and import endpoints (require auth)

### Task 2: Fix FECHADO error handling + add tipo_vendedor UI dropdown
**Commit:** `e6416dd`

**BUG 2 - Error handling:**
- `leads/page.tsx`: Capture fetch response, check `res.ok`, alert on error, prevent optimistic update
- `lead/[cnpj]/page.tsx`: Same pattern in `updateProjeto`
- Users now see "Erro ao atualizar: {server message}" instead of silent failure

**BUG 4 - tipo_vendedor UI:**
- `LeadSlideOver.tsx`: Added dropdown after status badge (visible when `canModify=true`)
  - Shows "SDR (1%)" / "Closer (4%)" options
  - Calls PATCH `/api/leads/{cnpj}` with `tipo_vendedor`
  - Updates `localLead` on success, alerts on failure
- `lead/[cnpj]/page.tsx`: Made tipo_vendedor display editable in commission section
  - Conditional render: `canModify ? <select> : <p>`
  - Uses existing `updateProjeto` handler

### Task 3: Add lead unassignment + fix login redirect edge case
**Commit:** `7af8385`

**BUG 8 - Lead unassignment:**
- `LeadAssignmentModal.tsx`: Added "Remover Atribuicao" button above vendedor select
  - Visible only when `currentVendedor` is set
  - Shows confirmation dialog before unassigning
  - POSTs `{ cnpj, unassign: true }` to `/api/leads/assign`
  - Red destructive styling
- `assign/route.ts`: Added unassign handler before vendedor_id check
  - Checks `body.unassign`, sets `vendedor_id = NULL` for all CNPJ rows
  - Returns `{ success: true, unassigned: true, cnpj }`

**BUG 7 - Login redirect:**
- No code change needed
- Middleware already handles edge case correctly:
  - Redirects unauthenticated users to `/login`
  - Redirects authenticated users away from `/login` to `/`
  - `/login` already in `publicPaths`

## Deviations from Plan

None - plan executed exactly as written. All 8 bugs addressed with no unexpected issues.

## Verification

**Build:** Passed with zero errors (`npx next build`)

**Grep confirmations:**
- `grep "vendedor_projetos" dal.ts` → Fixed table name
- `grep "1.00" setup-crm/route.ts` → Correct SDR rate
- `grep "setup-crm" middleware.ts` → No results (secured)
- `grep "CASE WHEN vp.status_contato = 'Fechado'" dashboard-crm/route.ts` → Filtered commission
- `grep "tipo_vendedor" leads/[cnpj]/route.ts` → PATCH support
- `grep "res.ok" leads/page.tsx` → Error check
- `grep "res.ok" lead/[cnpj]/page.tsx` → Error check
- `grep "Tipo Vendedor" LeadSlideOver.tsx` → Dropdown present
- `grep "canModify ? (" lead/[cnpj]/page.tsx` → Editable tipo_vendedor
- `grep "unassign" assign/route.ts` → Unassign handler
- `grep "Remover" LeadAssignmentModal.tsx` → Unassign button

## Impact

**Security:** `/api/setup-crm` and `/api/import-spreadsheet` now require authentication (previously publicly accessible).

**Data Integrity:**
- `verifyLeadAccess` now queries correct table (prevented potential access control bypass)
- Commission calculations use correct rates (1%/4% instead of 9%/12%)
- Dashboard commission totals no longer inflated with pipeline leads

**UX:**
- Users see error alerts when status updates fail (no more silent failures)
- Gestor/vendedor can now set tipo_vendedor via UI
- Gestor can unassign leads (previously impossible without direct DB access)

## Files Modified

| File | Changes |
|------|---------|
| `web/src/lib/dal.ts` | Fixed verifyLeadAccess table reference |
| `web/src/app/api/setup-crm/route.ts` | Corrected commission rates (seed + recalc) |
| `web/src/app/api/leads/[cnpj]/route.ts` | Fixed fallback rates, added tipo_vendedor PATCH |
| `web/src/app/api/dashboard-crm/route.ts` | Filtered comissao_total to Fechado only |
| `web/src/middleware.ts` | Secured setup-crm and import-spreadsheet |
| `web/src/app/leads/page.tsx` | Added error handling, prevented bad optimistic updates |
| `web/src/app/lead/[cnpj]/page.tsx` | Added error handling, editable tipo_vendedor |
| `web/src/components/LeadSlideOver.tsx` | Added tipo_vendedor dropdown |
| `web/src/components/LeadAssignmentModal.tsx` | Added unassign button |
| `web/src/app/api/leads/assign/route.ts` | Added unassign handler |

## Commits

1. `0f31bc2` - fix(quick-7): fix critical backend bugs (DAL, commission rates, dashboard, security)
2. `e6416dd` - feat(quick-7): add error handling for status updates and tipo_vendedor UI
3. `7af8385` - feat(quick-7): add lead unassignment capability

## Self-Check: PASSED

**Created files:** None (all modifications)

**Modified files verified:**
```bash
[ -f "web/src/lib/dal.ts" ] && echo "FOUND: web/src/lib/dal.ts"
# FOUND: web/src/lib/dal.ts
[ -f "web/src/app/api/setup-crm/route.ts" ] && echo "FOUND: web/src/app/api/setup-crm/route.ts"
# FOUND: web/src/app/api/setup-crm/route.ts
[ -f "web/src/app/api/leads/[cnpj]/route.ts" ] && echo "FOUND: web/src/app/api/leads/[cnpj]/route.ts"
# FOUND: web/src/app/api/leads/[cnpj]/route.ts
[ -f "web/src/app/api/dashboard-crm/route.ts" ] && echo "FOUND: web/src/app/api/dashboard-crm/route.ts"
# FOUND: web/src/app/api/dashboard-crm/route.ts
[ -f "web/src/middleware.ts" ] && echo "FOUND: web/src/middleware.ts"
# FOUND: web/src/middleware.ts
[ -f "web/src/app/leads/page.tsx" ] && echo "FOUND: web/src/app/leads/page.tsx"
# FOUND: web/src/app/leads/page.tsx
[ -f "web/src/app/lead/[cnpj]/page.tsx" ] && echo "FOUND: web/src/app/lead/[cnpj]/page.tsx"
# FOUND: web/src/app/lead/[cnpj]/page.tsx
[ -f "web/src/components/LeadSlideOver.tsx" ] && echo "FOUND: web/src/components/LeadSlideOver.tsx"
# FOUND: web/src/components/LeadSlideOver.tsx
[ -f "web/src/components/LeadAssignmentModal.tsx" ] && echo "FOUND: web/src/components/LeadAssignmentModal.tsx"
# FOUND: web/src/components/LeadAssignmentModal.tsx
[ -f "web/src/app/api/leads/assign/route.ts" ] && echo "FOUND: web/src/app/api/leads/assign/route.ts"
# FOUND: web/src/app/api/leads/assign/route.ts
```

**Commits verified:**
```bash
git log --oneline --all | grep -q "0f31bc2" && echo "FOUND: 0f31bc2"
# FOUND: 0f31bc2
git log --oneline --all | grep -q "e6416dd" && echo "FOUND: e6416dd"
# FOUND: e6416dd
git log --oneline --all | grep -q "7af8385" && echo "FOUND: 7af8385"
# FOUND: 7af8385
```

All files modified and all commits exist. Self-check passed.
