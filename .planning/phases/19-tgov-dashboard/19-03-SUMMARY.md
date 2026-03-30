---
phase: 19-tgov-dashboard
plan: 03
subsystem: tgov-ui
tags: [tgov, dashboard, gestor, access-control, sidebar, middleware, donut-chart]
dependency_graph:
  requires: ["19-01", "19-02"]
  provides: ["/tgov page", "TGovStatusDonut component", "gestor-only nav entry", "middleware 403 guard"]
  affects: ["web/src/components/Sidebar.tsx", "web/src/middleware.ts"]
tech_stack:
  added: []
  patterns:
    - "Server page gate + colocated client component (same as /execucao pattern)"
    - "Shared filter state in client component, separate per-tab fetchers"
    - "Middleware role-based 403 for both page and API routes"
    - "Always-visible donut legend (count + percent) via recharts PieChart"
key_files:
  created:
    - web/src/app/tgov/page.tsx
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/components/TGovStatusDonut.tsx
    - web/scripts/verify-tgov-ui.mjs
  modified:
    - web/src/components/Sidebar.tsx
    - web/src/middleware.ts
    - web/.eslintrc.json
decisions:
  - "Redirect non-gestores to /sem-permissao in page.tsx (second layer after middleware 403)"
  - "Inline table filters (proponente, numeroProposta) only affect table rows, not KPI or donut"
  - "Tab switch resets tableFilters and page to 1 but preserves mainFilters (shared lens)"
  - "Middleware 403 is a true HTTP Response for page routes, JSON 403 for API routes"
  - "eslintrc updated to declare @typescript-eslint plugin off (pre-existing disable-comments need known rule)"
metrics:
  duration: "~9 minutes (511 seconds)"
  completed: "2026-03-30T19:45:00Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 19 Plan 03: TGov Dashboard UI Summary

**One-liner:** Gestor-only /tgov dashboard page with shared-filter tabs, donut chart, KPI card, 25-row pagination, and HTTP 403 enforcement in middleware.

## What Was Built

### Task 1: /tgov page and dashboard client (commit 79e0b4c)

**web/src/app/tgov/page.tsx** — 12-line server component that calls `verifySession()` and redirects non-gestores to `/sem-permissao`. Hands role into `TGovDashboardClient`.

**web/src/app/tgov/TGovDashboardClient.tsx** — 370-line client component with:
- Shared main filters: Ano (year dropdown 2020-current), Tipo (Todos/Meus Proponentes/Outros), Status (text input), UF (2-char input)
- Tab switcher: Aprovação / Execução — preserves mainFilters, resets tableFilters and page
- Total KPI card per tab (data.total with loading skeleton)
- TGovStatusDonut donut chart per tab
- Paginated detail table (25 rows, numbered pages with window pager)
- Inline table-only filters: Proponente + Numero Proposta / ID Proposta
- Row links to /lead/[cnpj] in new tab
- Zero-state messaging when no rows

**web/src/components/TGovStatusDonut.tsx** — 110-line recharts donut component:
- Always-visible legend showing count (localeString) and percentage without hover
- Status color palette (green=Em Execução, blue=Aprovado, amber=Aguardando, etc.)
- Sorted by `tgovStatusSortKey` for deterministic legend order

### Task 2: Navigation and access control (commit 4d6e48e)

**web/src/components/Sidebar.tsx** — Added ClipboardDocumentCheck-style `tgov` icon case and `/tgov` nav item exclusively in the gestor branch. No other role branches reference `/tgov`.

**web/src/middleware.ts** — Extended with TGov access boundary:
- Authenticated non-gestor → `/tgov` returns `new Response(...)` with status 403 (true HTTP 403 page response, not redirect)
- Authenticated non-gestor → `/api/tgov/*` returns JSON 403
- Unauthenticated requests still follow existing auth→redirect/401 behavior

**web/scripts/verify-tgov-ui.mjs** — 16-assertion static verification script:
- Sidebar gestor branch has /tgov; coordenador, BASE_NAV_ITEMS, BASE_WITH_EXECUCAO do not
- middleware has explicit /tgov + /api/tgov 403 branches with role check
- TGovDashboardClient has shared filter state, endpoint fetches, TGOV_PAGE_SIZE, numbered pagination

All 16 assertions pass. Build succeeds with `/tgov` at 11.1kB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing ESLint rule resolution failure**
- **Found during:** Task 1 build
- **Issue:** `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments in existing files caused "Definition for rule ... was not found" error because `.eslintrc.json` only extended `next/core-web-vitals` without `@typescript-eslint` plugin
- **Fix:** Updated `web/.eslintrc.json` to declare `@typescript-eslint` plugin with `no-explicit-any: off` and `no-unused-vars: off` — resolves the "unknown rule" error while keeping all existing code valid
- **Files modified:** `web/.eslintrc.json`
- **Commit:** 79e0b4c

## Success Criteria Verification

- [x] `/tgov` exists as a clean, app-native gestor dashboard
- [x] Both `Aprovacao` and `Execucao` show a total KPI card, donut chart, and paginated detail table
- [x] Sidebar shows `/tgov` only for gestores
- [x] Main filters are shared across tabs, inline filters stay table-only, and pagination is fixed at 25 rows with page numbers
- [x] The donut component always shows count and percentage in the legend
- [x] Non-gestor direct access to `/tgov` and `/api/tgov/*` is blocked with HTTP 403

## Self-Check: PASSED

All created files confirmed on disk. Both task commits (79e0b4c, 4d6e48e) verified in git log.
