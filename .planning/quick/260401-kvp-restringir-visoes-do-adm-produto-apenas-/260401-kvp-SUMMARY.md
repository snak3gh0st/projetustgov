---
phase: quick
plan: 260401-kvp
subsystem: auth/navigation
tags: [role-guard, sidebar, adm_produto, server-component]
one_liner: "Restrict adm_produto role to /tgov and /cadastro-vendedor via Sidebar branch + server-side redirects on / and /leads"
dependency_graph:
  requires: []
  provides: [adm_produto-nav-isolation, home-leads-route-guards]
  affects: [Sidebar.tsx, layout.tsx, page.tsx, leads/page.tsx]
tech_stack:
  added: []
  patterns: [server-component-route-guard, two-file-server-client-split]
key_files:
  created:
    - web/src/app/HomeClient.tsx
    - web/src/app/leads/LeadsClient.tsx
  modified:
    - web/src/components/Sidebar.tsx
    - web/src/app/layout.tsx
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/app/page.tsx
    - web/src/app/leads/page.tsx
decisions:
  - adm_produto redirected to /tgov (not /sem-permissao) from home — it's a valid user with a different entry point
  - adm_produto redirected to /sem-permissao from /leads — CRM leads are out of scope for this role
  - TGovDashboardClient userRole prop type extended alongside Sidebar to keep types consistent
metrics:
  duration: ~5 min
  completed_date: "2026-04-01"
  tasks: 2
  files: 7
---

# Quick 260401-kvp: Restrict ADM Produto Views Summary

Restrict the `adm_produto` role to only TGov Dashboard and Usuarios TGov. All other CRM pages are hidden from sidebar and blocked via server-side redirects on the two main entry points (home and leads).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add adm_produto nav branch to Sidebar and fix layout role type | 9ce70d0 | Sidebar.tsx, layout.tsx, TGovDashboardClient.tsx |
| 2 | Add server-side route guards on / and /leads for adm_produto | 87b71fb | page.tsx, HomeClient.tsx, leads/page.tsx, leads/LeadsClient.tsx |

## Deviations from Plan

**1. [Rule 1 - Bug] TGovDashboardClient.tsx userRole type did not include adm_produto**
- **Found during:** Task 1 — TypeScript compile after Sidebar update
- **Issue:** TGovDashboardClient prop type `userRole` had the old narrow union, causing TS2322 error since tgov/page.tsx passes `session.role` which now resolves to `'adm_produto'`
- **Fix:** Extended `userRole` prop type in TGovDashboardClient.tsx to include `'adm_produto'`
- **Files modified:** web/src/app/tgov/TGovDashboardClient.tsx
- **Commit:** 9ce70d0

**2. [Rule 1 - Bug] LeadsClient.tsx default export name conflicted with new server component**
- **Found during:** Task 2
- **Issue:** Original leads/page.tsx exported `function LeadsPage()` — copying it to LeadsClient.tsx would create two `LeadsPage` exports, breaking imports
- **Fix:** Renamed default export in LeadsClient.tsx to `LeadsClient`
- **Files modified:** web/src/app/leads/LeadsClient.tsx
- **Commit:** 87b71fb

## Self-Check: PASSED

- web/src/app/HomeClient.tsx: FOUND
- web/src/app/leads/LeadsClient.tsx: FOUND
- web/src/app/page.tsx: server component with verifySession + adm_produto guard
- web/src/app/leads/page.tsx: server component with verifySession + adm_produto guard
- Commits 9ce70d0 and 87b71fb exist
- TypeScript: no errors
