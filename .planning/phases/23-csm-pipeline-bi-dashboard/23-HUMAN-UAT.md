---
status: partial
phase: 23-csm-pipeline-bi-dashboard
source: [23-VERIFICATION.md]
started: 2026-04-28T00:00:00Z
updated: 2026-04-28T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. CSM Client List Functional Test
expected: Table loads with multiple rows. Each filter operation (search, priority pill, saldo range) is instant with no new network requests. First expand fires one GET /api/csm/clients/{cnpj}/projects; re-collapse + reopen uses cache (no second network call).
result: [pending]

### 2. BI Dashboard Visual Verification
expected: 4 KPI cards show non-zero numeric values. Donut chart has coloured segments (up to 6). Funnel shows all 6 priority-ordered horizontal bars. No "Previsto" or "Rendimento Previsto" labels visible.
result: [pending]

### 3. Console Warning Check
expected: No React "Each child in a list should have a unique key" warning from the fragment-without-key pattern in the row map on /csm page load.
result: [pending]

### 4. Sidebar Role Isolation
expected: Gestor sidebar does NOT show "BI Dashboard CSM" entry. Direct URL /csm/bi as gestor renders the BI page (canCsm allows gestor).
result: [pending]

### 5. Phase 22 Regression Check
expected: POST /api/csm/clients works; /csm/comissoes loads without error. No breakage to Phase 22 routes.
result: [pending]

### 6. count_aprovacao Accuracy
expected: count_aprovacao in portfolio matches raw apr_rows count for a known client (noting that COUNT(*) FILTER (WHERE valor_global > 0) may undercount rows with NULL/0 valor_global).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
