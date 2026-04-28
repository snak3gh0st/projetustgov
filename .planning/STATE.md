---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: — CSM & Customer Success — In Progress
status: executing
stopped_at: "Completed Phase 24-ui-refresh Plan 03 — all 16 checks approved — Phase 24 complete"
last_updated: "2026-04-28T14:00:00.000Z"
last_activity: 2026-04-28
progress:
  total_phases: 26
  completed_phases: 15
  total_plans: 62
  completed_plans: 55
---

# Project State: PROJETUS — v6.0 CSM & Customer Success

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov, agora com area de Customer Success para upsell/cross-sell pos-venda.
**Current focus:** Phase 24 — ui-refresh

## Current Position

Phase: 24 COMPLETE — next: Phase 25 (Budget Items ETL & Display)
Plan: Phase 24 all 3 plans done
Status: Phase 24 complete — all 16 human-verify checks passed
Last activity: 2026-04-28

Progress (v6.0): [████░░░░░░] 40% (2/5 phases)

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** COMPLETE (Phases 14-18)
**Milestone v5.0:** COMPLETE (Phases 19-21)
**Milestone v6.0:** IN PROGRESS — Phase 22 complete (3/3 plans); Phase 23 complete (4/4 plans); Phase 24 complete (3/3 plans)

## Phase Map (v6.0)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 22 | CSM RBAC Foundation | CSM-01..04 (4 reqs) | COMPLETE (3/3 plans) |
| 23 | CSM Pipeline & BI Dashboard | CLI-01..06, BI-01..05 (11 reqs) | IN PROGRESS (Plans 01-02 + 04 done) |
| 24 | UI Refresh | UI-01..04 (4 reqs) | COMPLETE (3/3 plans — dark mode, brand rename, collapsible sidebar, mobile drawer — all 16 checks approved) |
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

### Key Architecture Decisions (v6.0 — Phase 23 Plan 04)

| Decision | Rationale |
|----------|-----------|
| BI-02 donut uses recharts PieChart inline (not TGovStatusDonut) (Plan 23-04) | TGovStatusDonut expects {status,count} keys; refactoring for generic bucket shape is out of scope — 30-line inline is isolated to /csm/bi |
| Funnel is horizontal-bar divs, not SVG funnel (Plan 23-04) | Visual simplicity, accessibility, no added deps; matches existing horizontal-bar pattern in codebase |
| /csm/bi nav entry added only to csm role sidebar block (Plan 23-04) | gestor/admin have canCsm() access via direct URL; sidebar pollution for non-CSM roles out of scope |

### Key Architecture Decisions (v6.0 — Phase 23 Plan 02)

| Decision | Rationale |
|----------|-----------|
| phase='execucao' for PC rows in /api/csm/clients/[cnpj]/projects (Plan 23-02) | PC rows live in projetos_execucao tables; UI distinguishes via priority_level=5 or situacao ILIKE '%presta%conta%' — avoids third phase value the UI would have to handle |
| Empty result returns {cnpj, projects:[]} not 404 (Plan 23-02) | CSM-added clients with no TGov projects are a valid case — do not 404 |
| NOT EXISTS dedup in exec_rows/apr_rows CTEs (Plan 23-02) | Prevents double-counting rows present in both CRM and TGov-only tables; mirrors pattern from /api/tgov/execucao |

### Key Architecture Decisions (v6.0 — Phase 22 Plans 02 and 03)

| Decision | Rationale |
|----------|-----------|
| status_contato = 'Não Contatado' (accented) in CSM POST (Plan 22-02) | Plan template had unaccented form; repo-sync.ts + api/leads production SQL uses accented form — unaccented INSERT would silently misclassify new rows in pipeline filters |
| allowedFields = ['telefone', 'email'] in PATCH /api/csm/clients/[cnpj]/contacts (Plan 22-02) | CSM trust scope; status_contato/principal/comissao_* changes must remain in gestor/vendedor hands only |
| vendedor_id hardcoded to session.userId in /api/csm/comissoes; no vendedorId query-param honored (Plan 22-03) | Prevents cross-seller data leak even from malicious CSM query strings; data isolation is non-negotiable |
| paulo_breakdown / per_vendedor / vendedores_list / selected_vendedor_stats stripped from CSM comissoes response (Plan 22-03) | Manager-facing aggregations expose Paulo's personal commission split to a non-manager role |

### Key Architecture Decisions (v6.0 — Phase 22 Plan 01)

| Decision | Rationale |
|----------|-----------|
| canCsm() placed after canCommentTgov() in dal.ts (Plan 22-01) | Logical grouping with TGov helpers; single source of truth for CSM area access (csm|gestor|admin) |
| CSM_PATHS allow-list at top-level scope in middleware, isCsmPath early-return inside csm block (Plan 22-01) | Prevents /api/csm/* from hitting isCrmApi 403; must fire before isCrmApi check to avoid race |
| CSM CRM-page redirect changed from /tgov to /csm (Plan 22-01) | /tgov was a stopgap; /csm is the correct CSM home; avoids redirect loop via Pitfall 5 pattern |
| auth.ts JWT/session callbacks use Role from @/lib/dal (Plan 22-01) | Stale 5-element union predated csm/tgov roles; import type ensures TS stays in sync with dal.ts |
| bruno@projetus.org updated via UPDATE SET role='csm' — no INSERT (Plan 22-01) | User existed with role='vendedor'; only role update needed, no bcrypt/INSERT required |

### Key Architecture Decisions (v6.0 — Phase 24 Plan 03)

| Decision | Rationale |
|----------|-----------|
| vaul issue #631 workaround: useEffect pathname close (Plan 24-03) | vaul drawers don't auto-close on Next.js navigation; useEffect(() => setOpen(false), [pathname]) is the confirmed fix per research |
| Shared getNavItemsForRole() helper in sidebar-nav-items.ts (Plan 24-03) | Single source of truth for nav items — prevents drift between desktop Sidebar and mobile MobileDrawer |
| hidden md:flex on desktop aside (Plan 24-03) | Standard Tailwind responsive hiding pattern; sidebar disappears entirely on mobile |
| md:ml-* on main in layout.tsx (Plan 24-03) | Mobile viewport has no fixed sidebar to offset; margin applied only at >= 768px |

### Key Architecture Decisions (v6.0 — Phase 24 Plan 02)

| Decision | Rationale |
|----------|-----------|
| Client writes sidebar:state via document.cookie directly (Plan 24-02) | Instant UX without server round-trip; Server Action setSidebarState exists for future RSC callers but not used by toggle handler |
| cookies() without await in layout.tsx (Plan 24-02) | Next.js 14.2.0 synchronous cookies() API — Pitfall 5 from research confirmed working |
| Default sidebarOpen=true when cookie absent (Plan 24-02) | undefined !== 'false' = true; new users see full sidebar on first visit |

### Key Architecture Decisions (v6.0 — Phase 24 Plan 01)

| Decision | Rationale |
|----------|-----------|
| UI-02 Interpretation A: infrastructure only (Plan 24-01) | Per-page dark: variants on 22 light-hardcoded pages deferred to follow-up quick task; dark class applies globally via html cascade |
| suppressHydrationWarning on html not body (Plan 24-01) | next-themes injects blocking script that sets class on html; body suppression would miss the actual mismatch |
| Hub da Projetos mixed case in UI (Plan 24-01) | PROJETUS-uppercase memory rule scoped to email subjects/body content — in-app UI uses the verbatim REQUIREMENTS.md phrasing |

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

Last session: 2026-04-28
Stopped at: Completed Phase 24-ui-refresh Plan 03 — all 16 checks approved — Phase 24 complete
Next action: Phase 25 (Budget Items ETL & Display) — research prerequisite: verify TransfereGov planoAplicacaoDetalhado API auth requirements
