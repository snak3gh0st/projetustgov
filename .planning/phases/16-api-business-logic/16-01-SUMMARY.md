---
phase: 16-api-business-logic
plan: 01
subsystem: api
tags: [api, execucao, postgresql, role-guard, aggregation]
dependency_graph:
  requires:
    - projetos_execucao table (Phase 15 — 8793 rows validated)
    - lead_contacts table (existing CRM)
    - web/src/lib/dal.ts (getApiSession)
    - web/src/lib/db.ts (query helper)
  provides:
    - GET /api/execucao (CNPJ-grouped financial intelligence for gestores)
    - GET /api/execucao/[cnpj] (per-CNPJ convenio detail for slide-over)
  affects:
    - Phase 17 /execucao page (consumes GET /api/execucao)
    - Phase 17 ExecucaoSlideOver (consumes GET /api/execucao/[cnpj])
tech_stack:
  added: []
  patterns:
    - Role guard returning 401 for both missing session and wrong role (project convention)
    - GROUP BY CNPJ aggregation with SUM/SUM weighted pct_execucao_ponderado
    - EXISTS subquery for boolean contact detection (avoids JOIN/GROUP BY complications)
    - dias values computed fresh from NOW() in SQL (not stale stored integers)
    - Dynamic WHERE conditions with paramIndex pattern from /api/leads/route.ts
key_files:
  created:
    - web/src/app/api/execucao/route.ts
    - web/src/app/api/execucao/[cnpj]/route.ts
  modified: []
decisions:
  - "Used EXISTS subquery instead of JOIN for contact_present to avoid GROUP BY complications (Pitfall 3)"
  - "Excluded pe.objeto from grouped list response to prevent large payload (Pitfall 6)"
  - "Alert placeholder uses existing ETL boolean columns — Plan 16-02 replaces after client confirmation"
  - "coordenador gets read access to /api/execucao alongside gestor (UI-02 requirement)"
metrics:
  duration: "2 minutes"
  completed_date: "2026-03-18"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 16 Plan 01: API Execucao Endpoints Summary

**One-liner:** Role-guarded GET /api/execucao with GROUP BY CNPJ aggregation and GET /api/execucao/[cnpj] detail — both using SQL-computed dias from NOW() and EXISTS-based contact detection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create GET /api/execucao with role guard, GROUP BY query, filters, and TypeScript types | 62b8449 | web/src/app/api/execucao/route.ts |
| 2 | Create CNPJ detail endpoint for Phase 17 slide-over | db4e356 | web/src/app/api/execucao/[cnpj]/route.ts |

## What Was Built

### GET /api/execucao (`web/src/app/api/execucao/route.ts`)

Aggregates `projetos_execucao` by CNPJ for the gestor dashboard table:

- **Role guard:** 401 for missing session; 401 for roles other than `gestor` or `coordenador` (project convention — no 403)
- **GROUP BY pe.cnpj:** All financial columns aggregated per organization
- **Weighted pct_execucao_ponderado:** `ROUND(SUM(valor_desembolsado) / SUM(valor_repasse) * 100, 1)` — not AVG
- **Fresh dias computation:** `EXTRACT(DAY FROM NOW() - data_inicio_vigencia)` and `EXTRACT(DAY FROM data_fim_vigencia - NOW())` — not stored integers
- **EXISTS contact detection:** `EXISTS(SELECT 1 FROM lead_contacts lc WHERE lc.lead_cnpj = pe.cnpj LIMIT 1)` — no JOIN
- **Alert aggregation:** `BOOL_OR(pe.alerta_desembolso)` and `BOOL_OR(pe.verificar_saldo)` — any alert in CNPJ fires boolean
- **Filters:** `search` (ILIKE on nome_proponente + CNPJ), `uf` (exact match, uppercased), `alert_only` (literal SQL condition)
- **objeto excluded:** Not needed in grouped table view; slide-over fetches it separately
- **Alert placeholder comment:** Explicitly references Plan 16-02 and the STATE.md blocker

### GET /api/execucao/[cnpj] (`web/src/app/api/execucao/[cnpj]/route.ts`)

Returns individual convenio rows for a specific CNPJ (consumed by Phase 17 ExecucaoSlideOver):

- Same role guard (401)
- `decodeURIComponent(params.cnpj)` for CNPJ extraction
- `objeto` IS included (unlike the grouped endpoint — slide-over needs full project description)
- `pct_execucao` returns per-row stored value (not weighted aggregate)
- `dias_em_execucao` and `dias_ate_vencimento` still computed from `NOW()` for freshness
- `GREATEST(0, ...)` guard on `dias_em_execucao` to prevent negative values for future-dated projects
- `ORDER BY pe.valor_global DESC NULLS LAST`

## Deviations from Plan

None — plan executed exactly as written.

The plan specified both routes in detail; implementation followed the specification without deviation.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Used `void ALERT_PLACEHOLDER_NOTE` to silence unused variable warning | TypeScript strict mode flags unused constants; void expression consumes the value without side effects |
| coordenador allowed on GET /api/execucao | UI-02 requirement states "Acesso restrito a gestor e coordenador" — cron endpoint correctly restricts to gestor only (different operation) |
| Alert placeholder documented in code comment | Plan 16-02 is a hard gate on client confirmation; comment makes the dependency traceable in the codebase |

## Self-Check

Files created:
- [x] web/src/app/api/execucao/route.ts — EXISTS
- [x] web/src/app/api/execucao/[cnpj]/route.ts — EXISTS

Commits:
- [x] 62b8449 — feat(16-01): Create GET /api/execucao
- [x] db4e356 — feat(16-01): Create GET /api/execucao/[cnpj]

TypeScript: Clean compile (0 src errors)
