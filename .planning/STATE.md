---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: — CSM & Customer Success — In Progress
status: executing
stopped_at: Completed 22-csm-rbac-foundation Plan 01 — canCsm helper, middleware /csm exemption, /csm page scaffold, sidebar nav entry
last_updated: "2026-04-27T15:35:00.000Z"
last_activity: 2026-04-27 -- Completed Phase 22 Plan 01
progress:
  total_phases: 21
  completed_phases: 12
  total_plans: 52
  completed_plans: 48
---

# Project State: PROJETUS — v6.0 CSM & Customer Success

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov, agora com area de Customer Success para upsell/cross-sell pos-venda.
**Current focus:** Phase 22 — csm-rbac-foundation

## Current Position

Phase: 22 (csm-rbac-foundation) — EXECUTING
Plan: 2 of 3 (Plan 01 complete)
Status: Executing Phase 22 — Plan 01 done
Last activity: 2026-04-27 - Completed Plan 01: canCsm(), middleware CSM_PATHS, /csm page scaffold, Sidebar nav entry

Progress (v6.0): [----------] 0% (0/5 phases)

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** COMPLETE (Phases 14-18)
**Milestone v5.0:** COMPLETE (Phases 19-21)
**Milestone v6.0:** IN PROGRESS — Phase 22 Plan 01 complete

## Phase Map (v6.0)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 22 | CSM RBAC Foundation | CSM-01..04 (4 reqs) | Plan 01 done (1/3) |
| 23 | CSM Pipeline & BI Dashboard | CLI-01..06, BI-01..05 (11 reqs) | Not started |
| 24 | UI Refresh | UI-01..04 (4 reqs) | Not started |
| 25 | Budget Items ETL & Display | BUD-01..04 (4 reqs) | Not started |
| 26 | AI Sales Tags | TAG-01, TAG-02 (2 reqs) | Not started |

## Accumulated Context

### Key Decisions (v5.0)

| Decision | Rationale |
|----------|-----------|
| csm role adicionado ao DB enum (Phase 20-01) | next-auth.d.ts + dal.ts estendidos; perfil CSM criado na fase 20 mas pipeline dedicado fica para v6.0 |
| Crons migrados de Vercel para sigmadb systemd timers | Vercel sync crons removidos em ee5fb71; timers gerenciados no servidor dedicado postgres |
| NOT MATERIALIZED nos CTEs all_propostas/all_exec (Plan 20-04) | Postgres materializava CTE referenciada uma unica vez; hint forca inlining e desbloqueia push-down — speedup 100x (5s → 54ms) |
| prestacao_contas tab mapeia para /api/tgov/execucao?mode=prestacao_contas | Reutiliza rota execucao com filtro ILIKE — evita nova rota |
| APROVACAO_ONLY_ROLES e EXECUCAO_ONLY_ROLES exportados de tgov.ts | Centraliza constantes de grupos de roles para tab isolation |

### Key Architecture Decisions (v6.0 — Phase 22 Plan 01)

| Decision | Rationale |
|----------|-----------|
| canCsm() placed after canCommentTgov() in dal.ts (Plan 22-01) | Logical grouping with TGov helpers; single source of truth for CSM area access (csm|gestor|admin) |
| CSM_PATHS allow-list at top-level scope in middleware, isCsmPath early-return inside csm block (Plan 22-01) | Prevents /api/csm/* from hitting isCrmApi 403; must fire before isCrmApi check to avoid race |
| CSM CRM-page redirect changed from /tgov to /csm (Plan 22-01) | /tgov was a stopgap; /csm is the correct CSM home; avoids redirect loop via Pitfall 5 pattern |
| auth.ts JWT/session callbacks use Role from @/lib/dal (Plan 22-01) | Stale 5-element union predated csm/tgov roles; import type ensures TS stays in sync with dal.ts |
| bruno@projetus.org updated via UPDATE SET role='csm' — no INSERT (Plan 22-01) | User existed with role='vendedor'; only role update needed, no bcrypt/INSERT required |

### Key Architecture Decisions (v6.0 — pre-implementation)

| Decision | Rationale |
|----------|-----------|
| CSM routes under /api/csm/* (new namespace) | Anti-pattern to extend /api/execucao — incompatible grouping semantics for CSM priority view |
| canCsm() auth gate before any CSM route | csm role exists in dal.ts but has no dedicated auth gate; any session can call CSM routes without it |
| Lazy on-demand budget fetch (not full ETL) | Budget items not in DB; lazy fetch + 7-day JSONB cache is minimum viable for v6.0 (batch ETL deferred to v7.0) |
| Cookie-based sidebar collapse state | localStorage causes hydration mismatch / FOUC; cookie is server-readable for correct initial render |
| next-themes for dark mode | Injects blocking script before paint, eliminates FOUC; integrates with Tailwind darkMode: 'class' |
| In-memory cosine similarity as pgvector fallback | pgvector availability on sigmadb unverified; in-memory JS is sufficient for <300 proposals |

### Research Prerequisites (must verify before planning)

| Phase | What to Verify | Impact if Blocked |
|-------|---------------|-------------------|
| 25 (Budget) | TransfereGov planoAplicacaoDetalhado API auth requirements (curl test) | If auth-gated: server-side proxy required. If blocked entirely: full ETL (Option B) must be scoped |
| 26 (AI Tags) | pgvector on sigmadb: `SELECT * FROM pg_extension WHERE extname = 'vector'` | If unavailable: in-memory cosine similarity is v6.0 implementation; pgvector → v6.1 |
| 24 (UI) | next-themes interaction with Radix UI portal components | If dark class doesn't propagate to portals: custom workaround needed |

### Quick Tasks Completed (v5.0 + recent)

| # | Description | Date | Commit |
|---|-------------|------|--------|
| 260401-e9r | Filter TGov aprovacao/execucao tabs to Projetus proposals whitelist (246 IDs) | 2026-04-01 | e3c7025 |
| 260401-kvp | Restringir visoes do ADM Produto: apenas Pipeline TGOV, Usuarios TGOV e TGOV Dashboard | 2026-04-01 | 07eeeab |
| 260410-kmx | Ultima coluna prestacao de contas: Atraso/Em tempo baseado em Limite PC | 2026-04-10 | 9bd8b04 |
| 260414-jby | Contact CSV export restricted to gestor/admin | 2026-04-14 | b189d32 |
| 260416-eoq | Remove projetista_execucao from TGov execution access | 2026-04-16 | d45d8ad |
| 260416-fep | TGOV Aprovacao: campo Vencimento com date picker + badge Vencida/Em tempo | 2026-04-16 | c459ec3 |
| 260416-gmd | Clear tgov_comments on phase transitions; Tecnico column; novos roles PC | 2026-04-16 | 619b92c |

### Technical Context (v6.0 Stack)

- **Role csm:** Existe no DB enum e no next-auth.d.ts/dal.ts — canCsm() a criar em Phase 22
- **tgov.ts:** Contratos compartilhados (TGovRow, TGovFilters, APROVACAO_ONLY_ROLES, EXECUCAO_ONLY_ROLES)
- **API TGov:** /api/tgov/aprovacao, /api/tgov/execucao (com mode=prestacao_contas), /api/tgov/tecnico, /api/tgov/interaction/[key]
- **Tags execucao:** Lobby, Desembolso, Rendimento, Autossuficiente, Iniciante — mapeiam para priority levels 1-5 do CSM
- **Plano de Aplicacao Detalhado:** endpoint TransfereGov API — auth reqs unverified; csm_budget_cache JSONB a criar
- **New deps (planned):** next-themes (dark mode), vaul (mobile drawer sidebar)
- **New table (planned):** csm_budget_cache (proposta_id PK, items JSONB, sales_tags JSONB, fetched_at TIMESTAMPTZ)

## Session Continuity

Last session: 2026-04-27
Stopped at: Completed 22-csm-rbac-foundation Plan 01 — CSM RBAC foundation (canCsm, middleware, /csm page, sidebar)
Next action: Execute Phase 22 Plans 02 and 03 (Wave 2, parallel)
