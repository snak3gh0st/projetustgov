---
phase: 22-csm-rbac-foundation
plan: 03
subsystem: api,ui
tags: [csm, rbac, comissoes, commission-view, sidebar]

# Dependency graph
requires:
  - phase: 22-01
    provides: "canCsm() in dal.ts; /api/csm/* and /csm/* middleware exemption; /csm page scaffold"
provides:
  - "GET /api/csm/comissoes — commission proxy with vendedor_id hardcoded to session.userId"
  - "Response shape: {role, summary, leads, filters_applied} — paulo_breakdown/per_vendedor/vendedores_list/selected_vendedor_stats intentionally absent"
  - "/csm/comissoes server page with canCsm() guard"
  - "CsmComissoesClient.tsx — fetches /api/csm/comissoes, renders summary cards + leads table, empty-state"
  - "Sidebar csm block extended to 5 items with /csm/comissoes as second entry"
affects:
  - "Phase 23 (CSM pipeline dashboard will co-exist with /csm/comissoes as sibling sub-pages)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSM proxy pattern: re-use SQL from /api/comissoes but strip per-role branches and pin vendedor_id to session"
    - "Empty-state branch required: bruno has zero closed leads at Phase 22 baseline — table renders Nenhum lead fechado copy"
    - "/csm/comissoes as standalone sub-page (not tab inside /csm) — follows standalone sub-page pattern from 22-CONTEXT.md"

key-files:
  created:
    - "web/src/app/api/csm/comissoes/route.ts"
    - "web/src/app/csm/comissoes/page.tsx"
    - "web/src/app/csm/comissoes/CsmComissoesClient.tsx"
  modified:
    - "web/src/components/Sidebar.tsx"

key-decisions:
  - "vendedor_id pinned to session.userId — no vendedorId query-param honored; prevents cross-seller data leak even if CSM constructs malicious URL"
  - "paulo_breakdown stripped — CSM must not see Paulo's 3-type commission split (Exclusivo/Closer/Coordenador); this data is gestor-only"
  - "per_vendedor, vendedores_list, selected_vendedor_stats stripped — manager-facing aggregations not needed for CSM self-view"
  - "Empty-state message required — bruno has no closed leads at launch; 0-row response is correct, not an error"

patterns-established:
  - "Pattern: CSM commission view is a standalone sub-page /csm/comissoes, not a tab in /csm"
  - "Pattern: CSM proxy routes strip all cross-seller fields — single-vendedor scope is non-negotiable"

requirements-completed:
  - CSM-04

# Metrics
duration: 20min
completed: 2026-04-27
---

# Phase 22 Plan 03: CSM Commission View Summary

**GET /api/csm/comissoes proxy with vendedor_id pinned to session, /csm/comissoes standalone page, and Sidebar nav entry**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-27
- **Tasks:** 3 auto
- **Files created:** 3
- **Files modified:** 1

## Accomplishments

- `GET /api/csm/comissoes` returns `{role, summary, leads, filters_applied}` for the CSM's own closed leads only — `vendedor_id` is hardcoded to `session.userId`, no override accepted
- Response intentionally excludes `paulo_breakdown`, `per_vendedor`, `vendedores_list`, `selected_vendedor_stats`
- `/csm/comissoes` server page with `verifySession()` + `canCsm()` guard; non-csm redirected to `/sem-permissao`
- `CsmComissoesClient.tsx` fetches on mount, renders 3 summary cards (Comissao / Bonus / Valor Venda) + leads table; empty-state message when 0 rows
- Sidebar csm block now 5 items: Clientes CSM, Comissoes, TGov Pipeline, TGov Dashboard, TGov BI

## Task Commits

1. **Task 1: GET /api/csm/comissoes** — `373b809`
2. **Task 2: /csm/comissoes page + CsmComissoesClient** — `87e401c`
3. **Task 3: Sidebar csm nav entry** — `0847ba7`

## Files Created/Modified

- `web/src/app/api/csm/comissoes/route.ts` — GET handler (132 lines)
- `web/src/app/csm/comissoes/page.tsx` — server component (10 lines)
- `web/src/app/csm/comissoes/CsmComissoesClient.tsx` — client component (148 lines)
- `web/src/components/Sidebar.tsx` — 1 line inserted in csm block

## Response Payload Shape

```json
{
  "role": "csm",
  "summary": {
    "total_leads": 0,
    "total_comissao": 0,
    "total_bonus": 0,
    "total_valor_venda": 0,
    "total_valor_emenda": 0
  },
  "leads": [],
  "filters_applied": {
    "start_date": null,
    "end_date": null
  }
}
```

Fields intentionally absent: `paulo_breakdown`, `per_vendedor`, `vendedores_list`, `selected_vendedor_stats`

## Decisions Made

- `vendedor_id` pinned to `session.userId` in the WHERE clause — even if CSM crafts `?vendedor_id=<other_uuid>`, the filter is never read, keeping cross-seller isolation intact
- `paulo_breakdown` stripped — it contains Paulo's split commission logic (Exclusivo/Closer/Coordenador), visible only to coordenador/gestor
- Empty-state is expected at launch: bruno has no closed leads, so `leads: []` and all summary totals = 0 is the correct Phase 22 baseline

## Deviations from Plan

None — plan executed exactly as written.

## Manual Verification (Deferred — requires running dev server)

- CSM GET /api/csm/comissoes → 200 `{role, summary, leads, filters_applied}`
- Response keys contain no `paulo_breakdown`, `per_vendedor`, `vendedores_list`, `selected_vendedor_stats`
- Anonymous → 401, Vendedor → 403
- /csm/comissoes loads with summary cards (0 / R$ 0,00 baseline)
- Vendedor session at /csm/comissoes → redirect to /sem-permissao
- Sidebar shows 5 items in order for csm session

---
*Phase: 22-csm-rbac-foundation*
*Completed: 2026-04-27*
