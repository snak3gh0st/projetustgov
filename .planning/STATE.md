# Project State: PROJETUS — v4.0 Projetos em Execucao

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Inteligencia pos-venda para gestores identificarem clientes qualificados com projetos em execucao no TransferenciaGov.
**Current focus:** Phase 14 — Data Audit & Foundation

## Current Position

Phase: 14 of 17 in milestone v4.0 (Data Audit & Foundation)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-03-18 — Plan 14-02 complete: projetos_execucao table created in Supabase with NUMERIC(18,2) financial columns, UNIQUE(nr_convenio) constraint, and 3 indexes

Progress (v4.0): [██░░░░░░░░] 20%

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** In progress (Phases 14-17)

## Performance Metrics

**v4.0 Velocity:**
- Total plans completed: 2
- Average duration: 6 min
- Total execution time: 12 min

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

### Blockers / Concerns

- **Alert business rule (Phase 16 blocker):** Client must identify 3+ convenios that should show the alert and 3+ that are healthy before Phase 16 plan 2 can be executed. Do not implement as a guess.
- **NULL proposta_id scope (RESOLVED 2026-03-18):** Diagnostic ran — 0 of 44,035 em-execucao convenios have NULL proposta_id. All CNPJs in proponentes (27,215) already 14 digits. Phase 15 ETL uses LEFT JOIN with join_miss_count regardless (architecture decision is permanent, count is transient).
- **OSC Map memory size (Phase 15 watch):** Estimated small fraction of 187MB but not measured. Instrument Phase 15 test script; if Map exceeds Vercel 1GB limit, implement two-pass fallback.

### Technical Context (v4.0 Stack)

- **New table:** projetos_execucao (Supabase PostgreSQL) — isolated from CRM
- **New lib:** web/src/lib/execucao-sync.ts
- **New API route:** web/src/app/api/execucao/route.ts
- **New cron route:** web/src/app/api/cron/sync-execucao/route.ts
- **New page:** web/src/app/execucao/page.tsx
- **New component:** web/src/components/ExecucaoSlideOver.tsx
- **Data sources:** siconv_convenio.csv.zip (15MB), siconv_proposta.csv.zip (187MB) from repositorio.dados.gov.br/seges/detru/
- **Join key:** id_proposta (convenio) -> ID_PROPOSTA (proposta) to derive proponent CNPJ

## Session Continuity

Last session: 2026-03-18
Stopped at: Completed 14-02-PLAN.md — projetos_execucao table creation + schema.sql updated
Resume file: None
