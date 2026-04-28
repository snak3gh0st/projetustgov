---
phase: 23-csm-pipeline-bi-dashboard
plan: 02
subsystem: api
tags: [nextjs, postgres, csm, tgov, sql, cte]

# Dependency graph
requires:
  - phase: 22-csm-rbac-foundation
    provides: "canCsm() gate, contacts/route.ts sibling, getApiSession pattern"
  - phase: 23-01
    provides: "EXECUCAO_NR_PROPOSTAS + APROVACAO_NR_PROPOSTAS whitelists; priority CASE WHEN (levels 1-5)"
provides:
  - "GET /api/csm/clients/[cnpj]/projects — per-client project breakdown with priority_level"
  - "CsmProjectRow type exported from the route file"
affects: [csm-pipeline-ui, client-detail-expandable-rows, csm-bi-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NOT MATERIALIZED CTE union across CRM + TGov-only tables with NOT EXISTS dedup"
    - "Per-row priority_level CASE WHEN matching portfolio-level aggregation (Plan 23-01)"
    - "phase='execucao' for all execucao+PC rows; UI differentiates via priority_level=5 or situacao ILIKE"

key-files:
  created:
    - web/src/app/api/csm/clients/[cnpj]/projects/route.ts
  modified: []

key-decisions:
  - "phase literal is exactly 'aprovacao' or 'execucao' — no third 'prestacao_contas' phase value; PC rows tagged as execucao with priority_level=5"
  - "Empty result returns {cnpj, projects:[]} not 404 — CSM-added clients with no TGov projects are valid"
  - "NOT EXISTS dedup prevents double-counting rows that appear in both CRM and TGov-only tables"
  - "REGEXP_REPLACE on proponente_cnpj column side for aprovacao (column may have punctuation); projetos_execucao.cnpj is already digits-only"

patterns-established:
  - "Sibling route pattern: projects/route.ts coexists with contacts/route.ts under [cnpj]; neither imports the other"
  - "Priority CASE WHEN 1/2/3/5 for execucao rows + fixed 4 for aprovacao rows matches Plan 23-01 (CSM portfolio aggregation)"

requirements-completed: [CLI-04, CLI-06]

# Metrics
duration: 10min
completed: 2026-04-27
---

# Phase 23 Plan 02: CSM Client Projects Endpoint Summary

**Single-CNPJ project breakdown API returning all aprovacao + execucao + PC projects with per-row priority_level via NOT MATERIALIZED CTE union across four PostgreSQL tables**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-27T00:00:00Z
- **Completed:** 2026-04-27T00:10:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `GET /api/csm/clients/[cnpj]/projects` under existing `[cnpj]` dynamic segment
- Endpoint unions projetos_execucao + tgov_projetos_execucao + propostas + tgov_propostas via NOT MATERIALIZED CTEs
- NOT EXISTS dedup prevents double-counting rows present in both CRM and TGov-only tables
- Priority CASE WHEN matches Plan 23-01 exactly: saldo_conta>0 → 1, valor_desembolsado=0 → 2, rendimento>0 → 3, aprovacao → 4, prestacao_contas → 5
- canCsm() gate (csm/gestor/admin only); CNPJ normalisation with 14-digit validation
- Sibling contacts/route.ts untouched — both GET and PATCH still present

## Task Commits

1. **Task 1: GET /api/csm/clients/[cnpj]/projects** - `871d03c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `web/src/app/api/csm/clients/[cnpj]/projects/route.ts` - New GET handler; returns `{cnpj, projects: CsmProjectRow[]}`

## Decisions Made
- `phase` is exactly `'aprovacao'` or `'execucao'`; PC rows tagged as execucao — avoids third phase value the UI would have to handle; UI distinguishes via priority_level=5 or situacao ILIKE '%presta%conta%'
- Empty result returns `{cnpj, projects: []}` not 404 — CSM-added clients with no TGov projects are a valid case
- REGEXP_REPLACE on column side for aprovacao (proponente_cnpj may have punctuation); projetos_execucao.cnpj is VARCHAR(14) digits-only so direct equality is correct

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled cleanly on first attempt; all verification checks passed.

## Verification Notes

**Manual verification CNPJ:** Any CNPJ from EXECUCAO_NR_PROPOSTAS scope (e.g., a known Projetus client CNPJ like 14-digit from `projetos_execucao` table).

**Sample response shape:**
```json
{
  "cnpj": "12345678901234",
  "projects": [
    {
      "phase": "execucao",
      "cnpj": "12345678901234",
      "identifier": "929999/2023",
      "nr_proposta": "9264/2023",
      "objeto": "Fortalecimento institucional...",
      "situacao": "Em Execução",
      "valor_global": 150000.00,
      "valor_repasse": 140000.00,
      "valor_desembolsado": 0,
      "saldo_conta": 45000.00,
      "rendimento_aplicacao": 1200.00,
      "data_inicio_vigencia": "2023-07-01",
      "data_fim_vigencia": "2025-06-30",
      "uf": "SP",
      "municipio": "São Paulo",
      "priority_level": 1
    }
  ]
}
```

**Contacts route untouched:** Verified `grep` confirms `export async function GET` AND `export async function PATCH` both exist in `contacts/route.ts`.

**Priority CASE WHEN adjustment:** None — matches Plan 23-01 exactly (saldo_conta>0→1, valor_desembolsado=0+em_execu→2, rendimento>0→3, aprovacao fixed 4, presta%conta%→5).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 23-02 complete: GET /api/csm/clients/[cnpj]/projects ready for UI consumption
- Plan 23-03 can build the expandable-row client list UI against this endpoint
- Plan 23-04 can build the BI dashboard using the portfolio + per-client project data

---
*Phase: 23-csm-pipeline-bi-dashboard*
*Completed: 2026-04-27*
