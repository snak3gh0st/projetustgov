---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: — Projetos em Execucao
status: in_progress
stopped_at: Completed 16-01-PLAN.md — GET /api/execucao and GET /api/execucao/[cnpj] created, Phase 16 Plan 01 complete
last_updated: "2026-03-18T17:37:00.000Z"
last_activity: "2026-03-18 — Plan 16-01 complete: GET /api/execucao (GROUP BY CNPJ, role guard, filters) and GET /api/execucao/[cnpj] (detail endpoint) created — both TypeScript clean"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 6
  completed_plans: 5
---

# Project State: PROJETUS — v4.0 Projetos em Execucao

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Inteligencia pos-venda para gestores identificarem clientes qualificados com projetos em execucao no TransferenciaGov.
**Current focus:** Phase 16 — API & Business Logic

## Current Position

Phase: 16 of 17 in milestone v4.0 (API & Business Logic) — IN PROGRESS
Plan: 1 of 2 in current phase (Plan 01 complete)
Status: Phase 16 Plan 01 complete — API endpoints created, awaiting Plan 02 (alert business rule)
Last activity: 2026-03-18 — Plan 16-01 complete: GET /api/execucao (GROUP BY CNPJ, role guard, filters) and GET /api/execucao/[cnpj] (detail endpoint) created — both TypeScript clean

Progress (v4.0): [█████░░░░░] 50%

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** In progress (Phases 14-17)

## Performance Metrics

**v4.0 Velocity:**
- Total plans completed: 4
- Average duration: ~17 min
- Total execution time: ~67 min

*Updated after each plan completion*

## Accumulated Context

### Key Decisions (v4.0)

| Decision | Rationale |
|----------|-----------|
| Data audit before ETL (Phase 14 first) | NULL proposta_id and CNPJ padding are one-way doors — baking the bug into the architecture is worse than discovering it in a diagnostic query |
| NUMERIC(18,2) for all financial columns in projetos_execucao | Old ETL tables use FLOAT incorrectly; new table must be correct from the start |
| Dedicated cron endpoint /api/cron/sync-execucao | Lead sync consumes ~250s of 300s budget; appending execution sync causes 504 failures |
| ON CONFLICT (nr_convenio) as UPSERT key | Never ON CONFLICT (cnpj) alone — mirrors the STEP 7c production bug (commit 9e20d04) |
| LEFT JOIN with join_miss_count for proposta join | INNER JOIN silently drops projects with NULL proposta_id; LEFT JOIN + logged miss count makes data loss visible |
| Alert business rule confirmed with client before Phase 16 | "Desembolso negativo" is a business signal, not mathematical — implement only after client inspects known-problematic convenios |
| Role guard on both page (verifySession) and API (getApiSession) | Middleware only checks session existence, not role; vendedor can call API directly |
| All financial computations in SQL, not JavaScript | Prevents floating-point precision errors and keeps calc logic close to data |
| OSC filter multi-column fallback in execucao-sync.ts | Government CSV headers can change; fallback order NATUREZA_JURIDICA -> TIPO_INSTRUMENTO prevents silent empty Map failures |
| parseBRDate as internal helper in execucao-sync.ts | Only needed by execucao-sync.ts currently; can be exported to repo-sync.ts if Phase 16/17 need date parsing |
| siconv_convenio date columns are DIA_* not DT_* | Actual CSV headers verified 2026-03-18: DIA_ASSIN_CONV, DIA_INIC_VIGENC_CONV, DIA_FIM_VIGENC_CONV — fallbacks kept for forward compat |
| join_miss_count=35291 is expected, not a bug | 44084 em_execucao convenios — only 8793 belong to OSC proponents; non-OSC misses are intentional by design |
| Memory peak ~1300MB during proposta STEP A | 1.1M rows -> 87836-entry OSC Map. Vercel may need --max-old-space-size=1536 or two-pass approach for production cron |
| EXISTS subquery for contact_present (not JOIN) | JOIN on lead_contacts causes GROUP BY complications; EXISTS subquery returns boolean at zero extra cost per Pitfall 3 |
| objeto excluded from GET /api/execucao grouped response | Large TEXT field would inflate 2000+ row payload; slide-over fetches it separately via /api/execucao/[cnpj] |
| Alert placeholder logic uses ETL boolean columns | Plan 16-02 replaces after client provides 3+ convênio examples; code comment documents the gate |

### Blockers / Concerns

- **Alert business rule (Phase 16 blocker):** Client must identify 3+ convenios that should show the alert and 3+ that are healthy before Phase 16 plan 2 can be executed. Do not implement as a guess.
- **NULL proposta_id scope (RESOLVED 2026-03-18):** Diagnostic ran — 0 of 44,035 em-execucao convenios have NULL proposta_id. All CNPJs in proponentes (27,215) already 14 digits. Phase 15 ETL uses LEFT JOIN with join_miss_count regardless (architecture decision is permanent, count is transient).
- **OSC Map memory size (MEASURED 2026-03-18):** Heap peak ~1300MB during STEP A on local dev. Vercel Pro limit is 1GB — production cron may OOM. Solutions: --max-old-space-size=1536 flag on Vercel, or implement two-pass streaming approach in Phase 16 planning if cron fails.

### Technical Context (v4.0 Stack)

- **New table:** projetos_execucao (Supabase PostgreSQL) — isolated from CRM
- **New lib:** web/src/lib/execucao-sync.ts
- **New API route:** web/src/app/api/execucao/route.ts (GET — CNPJ grouped, CREATED Plan 16-01)
- **New API route:** web/src/app/api/execucao/[cnpj]/route.ts (GET — detail rows, CREATED Plan 16-01)
- **New cron route:** web/src/app/api/cron/sync-execucao/route.ts
- **New page:** web/src/app/execucao/page.tsx
- **New component:** web/src/components/ExecucaoSlideOver.tsx
- **Data sources:** siconv_convenio.csv.zip (15MB), siconv_proposta.csv.zip (187MB) from repositorio.dados.gov.br/seges/detru/
- **Join key:** id_proposta (convenio) -> ID_PROPOSTA (proposta) to derive proponent CNPJ

## Session Continuity

Last session: 2026-03-18
Stopped at: Completed 16-01-PLAN.md — GET /api/execucao and GET /api/execucao/[cnpj] created, Phase 16 Plan 01 complete
Resume file: None
