---
phase: 23-csm-pipeline-bi-dashboard
plan: 01
subsystem: csm-api
tags: [api, sql, cte, csm, bi, portfolio]
dependency_graph:
  requires:
    - dal.ts canCsm()
    - lib/tgov.ts EXECUCAO_NR_PROPOSTAS + APROVACAO_NR_PROPOSTAS
    - projetos_execucao table
    - tgov_projetos_execucao table
    - propostas table
    - tgov_propostas table
    - vendedor_projetos table
  provides:
    - GET /api/csm/portfolio (CsmClientRow[] with financials + priority badge)
    - GET /api/csm/bi (totals + by_status + funnel)
  affects:
    - web/src/app/csm/CsmDashboardClient.tsx (plans 23-03/23-04 consume these endpoints)
tech_stack:
  added: []
  patterns:
    - NOT MATERIALIZED CTE union (four tables: projetos_execucao + tgov_projetos_execucao + propostas + tgov_propostas)
    - csm_added CTE for manual clients with no whitelist match
    - Promise.all parallel queries for BI endpoint
    - Per-row priority CASE WHEN with MIN() aggregation for client badge
key_files:
  created:
    - web/src/app/api/csm/portfolio/route.ts
    - web/src/app/api/csm/bi/route.ts
  modified: []
decisions:
  - "Client-row badge shows MIN(priority_level) — best/highest priority drives the badge to surface upsell opportunities (research Open Question 3)"
  - "total_rendimento uses rendimento_aplicacao (realized); UI label MUST be 'Saldo Rendimento' — never 'Saldo de Rendimento Previsto' (research Open Question 1)"
  - "CSM scope = whitelist UNION vendedor_projetos rows where vendedor_id = session.userId. Manual-added clients with no TGov data show zeros for all financial fields (research Open Question 2)"
  - "BI does NOT include vendedor_projetos csm_added rows in totals — manual-added clients have zero financials by definition"
  - "funnel field name = 'stage' (matches research CsmBiResponse type); by_status field name = 'bucket'. Both arrays use same six buckets but funnel is ordered+complete, by_status lists only non-empty"
metrics:
  duration: ~10 min
  completed: 2026-04-27
  tasks: 2
  files: 2
---

# Phase 23 Plan 01: CSM API — Portfolio + BI Endpoints Summary

**One-liner:** Two CSM read-only API endpoints using NOT MATERIALIZED CTE unions over four tables — portfolio returns one row per CNPJ with aggregated financials and MIN-priority badge; BI returns portfolio totals + six-bucket status breakdown + ordered funnel.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | GET /api/csm/portfolio — client list with aggregated financials + priority badge | 0b43d0f | web/src/app/api/csm/portfolio/route.ts |
| 2 | GET /api/csm/bi — portfolio totals + by-status counts (BI-01..05) | 1db0c47 | web/src/app/api/csm/bi/route.ts |

## Implementation Notes

### portfolio/route.ts

Four NOT MATERIALIZED CTEs (`exec_rows`, `apr_rows`, `csm_added`, `all_rows`) union into a final GROUP BY cnpj with:
- `SUM(saldo_conta)` for total_saldo_conta
- `SUM(GREATEST(valor_repasse - valor_desembolsado, 0)) FILTER (WHERE situacao ILIKE 'em execu%')` for total_a_desembolsar
- `SUM(rendimento_aplicacao)` for total_rendimento
- `total_a_desembolsar + SUM(valor_global)` for total_a_liberar
- COUNT FILTER predicates for count_execucao_saldo, count_a_desembolsar, count_aprovacao, count_prestacao_contas
- `MIN(row_priority)` for priority_level — per-row CASE WHEN (1=saldo conta, 2=a desembolsar, 3=rendimento, 4=aprovacao, 5=PC)

The `csm_added` CTE adds manually-created CSM clients (via vendedor_projetos WHERE vendedor_id = session.userId) that have no matching row in exec_rows or apr_rows. These show zeros for all financial fields.

### bi/route.ts

Three parallel queries via `Promise.all`:
- **Query A** (totals): SUM aggregations across exec_rows + apr_rows
- **Query B** (by_status): Non-empty buckets grouped by normalized situacao bucket
- **Query C** (funnel): All six buckets always emitted via LEFT JOIN against VALUES list

Both exec_rows and apr_rows CTEs are repeated in each query (NOT MATERIALIZED, so Postgres inlines them — 8 total occurrences). No `vendedor_projetos` reference in BI (manual clients excluded by design).

### CNPJ normalization

- `projetos_execucao.cnpj` + `tgov_projetos_execucao.cnpj`: already VARCHAR(14) digits-only — selected directly
- `propostas.proponente_cnpj` + `tgov_propostas.proponente_cnpj` + `vendedor_projetos.cnpj`: wrapped in `REGEXP_REPLACE(x, '[^0-9]', '', 'g')`

### Auth + scope

Both routes use the same auth gate:
```typescript
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
`canCsm()` allows `csm | gestor | admin`. Portfolio pins scope to `session.userId` via `$3` parameter. BI uses whitelist only (no per-user scope needed).

## Deviations from Plan

None - plan executed exactly as written.

The plan specified the three main CTEs (exec_rows, apr_rows, csm_added) plus a "final SELECT." I introduced a fourth internal CTE `all_rows` that UNIONs all three source CTEs before the final GROUP BY. This is consistent with the plan's intent (avoids row multiplication from JOIN, as noted by advisor) and is NOT MATERIALIZED. All acceptance criteria still pass — there are 4 NOT MATERIALIZED occurrences (exec_rows, apr_rows, csm_added, all_rows).

## Phase 22-02 POST Endpoint Verification

`grep -q "export async function POST" web/src/app/api/csm/clients/route.ts` → confirmed still intact. The POST handler at `/api/csm/clients` is unchanged (CSM-02 load-bearing endpoint).

## Self-Check

- [x] web/src/app/api/csm/portfolio/route.ts exists (commit 0b43d0f)
- [x] web/src/app/api/csm/bi/route.ts exists (commit 1db0c47)
- [x] TypeScript compiles cleanly (npx tsc --noEmit exits 0 on main repo)
- [x] All automated verify checks pass (grep checks for NOT MATERIALIZED, canCsm, maxDuration=30, no manager fields, no tag_* columns)
- [x] POST /api/csm/clients still exports POST function (CSM-02 untouched)
