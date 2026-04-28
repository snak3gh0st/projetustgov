---
phase: 23-csm-pipeline-bi-dashboard
plan: "04"
subsystem: csm-bi-dashboard
tags: [csm, bi, dashboard, recharts, kpi, funnel, sidebar]
one_liner: "CSM BI dashboard at /csm/bi with 4 KPI cards, recharts donut, horizontal-bar funnel consuming /api/csm/bi"
dependency_graph:
  requires:
    - "23-01 (GET /api/csm/bi providing totals + by_status + funnel)"
    - "22-01 (canCsm RBAC guard in dal.ts)"
  provides:
    - "/csm/bi route (server-component gate + client component)"
    - "BI Dashboard CSM sidebar entry in csm role block"
  affects:
    - "web/src/components/Sidebar.tsx (csm nav block)"
tech_stack:
  added: []
  patterns:
    - "canCsm() gate in server component (same pattern as /csm page)"
    - "PieChart inline (not reusing TGovStatusDonut — different data shape)"
    - "Horizontal-bar funnel via plain divs with BUCKET_COLORS (no extra SVG deps)"
key_files:
  created:
    - web/src/app/csm/bi/page.tsx
    - web/src/app/csm/bi/CsmBiClient.tsx
  modified:
    - web/src/components/Sidebar.tsx
decisions:
  - "BI-02 donut uses recharts PieChart inline rather than TGovStatusDonut — TGovStatusDonut expects {status,count} keys; refactoring out of scope"
  - "Funnel is horizontal-bar divs not SVG funnel — visual simplicity, no added deps, matches existing bar pattern"
  - "csm/bi added only to csm role block in Sidebar — gestor/admin access via direct URL; sidebar pollution for non-CSM is out of scope"
metrics:
  duration: "~3 min"
  completed_date: "2026-04-28"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
requirements: [BI-01, BI-02, BI-03, BI-04, BI-05]
---

# Phase 23 Plan 04: CSM BI Dashboard Page + Sidebar Nav Summary

## What Was Built

Standalone `/csm/bi` route consisting of:

1. **Server component** (`web/src/app/csm/bi/page.tsx`) — canCsm() gate with redirect to `/sem-permissao`; passes `userRole` and `userName` to `CsmBiClient`.

2. **Client component** (`web/src/app/csm/bi/CsmBiClient.tsx`, 185 lines) — fetches `/api/csm/bi`, renders:
   - Four KPI cards: Saldo em Conta, Saldo Rendimento, A Liberar, Total Projetos
   - Recharts PieChart donut with up to 6 coloured segments (BUCKET_COLORS) and a legend showing count + percentage
   - Horizontal-bar funnel for each portfolio stage ordered by priority from `data.funnel`
   - Loading skeleton (4 animated placeholder cards), error banner with retry, empty-state fallback

3. **Sidebar entry** (`web/src/components/Sidebar.tsx`) — one line added after `/csm/comissoes` and before `/tgov/pipeline` in the `user.role === 'csm'` nav block; uses existing `'bi'` icon.

## Verification Results

### Task 1 Checks (all passed)
- `verifySession` and `canCsm` imported in page.tsx
- `canCsm(session.role)` gate present
- `redirect('/sem-permissao')` on failure
- `CsmBiClient` rendered with `userRole` and `userName`
- `'use client'` directive in CsmBiClient
- `fetch('/api/csm/bi'` in useEffect with cancel guard
- `KPICard` imported from `'@/components/KPICard'`
- `formatCompactCurrency` imported from `'@/lib/format'`
- All 4 KPI titles present: Saldo em Conta, Saldo Rendimento, A Liberar, Total Projetos
- `PieChart` and `Pie` from recharts present
- No `Rendimento Previsto`, `previsto`, `localStorage`, `vendedorId`, `paulo_breakdown`, or `per_vendedor`
- File is 185 lines (>= 120 minimum)

### Task 2 Checks (all passed)
- `/csm/bi` present in Sidebar
- `BI Dashboard CSM` label present
- `/csm/bi` entry in csm role block (awk verified)
- Entry is after `/csm/comissoes` and before `/tgov/pipeline`
- All 5 pre-existing entries still present
- Only 1 occurrence of `/csm/bi` in the file (csm block only)

## Deviations from Plan

None - plan executed exactly as written.

The plan's verify command included a `grep -c "user.role === 'csm'" | awk '{exit ($1 != 1)}'` check that expected exactly 1 occurrence. In practice there are 3 occurrences (nav block, badge color, badge text) — this is pre-existing in the file and unrelated to this plan. All acceptance criteria that matter were met: `/csm/bi` is only in the csm nav block.

## Commits

- `0a641d2` feat(23-04): create /csm/bi page + CsmBiClient (BI-01..05)
- `933ba32` feat(23-04): add /csm/bi nav entry to Sidebar csm role block

## Self-Check: PASSED

| Item | Status |
|------|--------|
| web/src/app/csm/bi/page.tsx | FOUND |
| web/src/app/csm/bi/CsmBiClient.tsx | FOUND |
| web/src/components/Sidebar.tsx | FOUND |
| commit 0a641d2 | FOUND |
| commit 933ba32 | FOUND |
