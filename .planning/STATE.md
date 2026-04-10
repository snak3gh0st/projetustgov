---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: — TGov Dashboard — In Progress
status: executing
stopped_at: Completed 21-01 — Foundation RBAC for execution roles
last_updated: "2026-04-10T14:17:20Z"
last_activity: 2026-04-10 -- Plan 21-01 complete (RBAC execution roles wired through all layers)
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 11
  completed_plans: 8
---

# Project State: PROJETUS — v5.0 TGov Dashboard

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Inteligencia pos-venda para gestores identificarem clientes qualificados com projetos em execucao no TransferenciaGov.
**Current focus:** Phase 21 — tgov-ajustes-0904

## Current Position

Phase: 21 (tgov-ajustes-0904) — EXECUTING
Plan: 2 of 4 (Plan 01 complete)
Status: Executing Phase 21 — Plan 01 done
Last activity: 2026-04-10 -- Plan 21-01 complete (RBAC execution roles)

Progress (v5.0): [███░░░░░░░] 100%

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** COMPLETE (Phases 14-17)
**Milestone v5.0:** IN PROGRESS (Phase 19)

## Performance Metrics

**v4.0 Velocity:**

- Total plans completed: 5
- Average duration: ~14 min
- Total execution time: ~69 min

**v5.0 Velocity (Phase 19):**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 19-tgov-dashboard | 01 | 4 min | 2 | 3 |
| 19-tgov-dashboard | 02 | 3 min | 2 | 2 |
| 19-tgov-dashboard | 03 | 9 min | 2 | 7 |
| 20-tgov-ajustes-0704 | 01 | ~25 min | 6 | 5 |
| 20-tgov-ajustes-0704 | 02 | ~10 min | 4 | 7 |
| 20-tgov-ajustes-0704 | 03 | ~3 min | 5 | 5 |
| 20-tgov-ajustes-0704 | 04 | ~45 min | 4+2perf | 8 |
| 21-tgov-ajustes-0904 | 01 | ~10 min | 2 | 6 |

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
| Alert condition: valor_desembolsado = 0 (confirmed 2026-03-18) | Client confirmed: projects with zero disbursement (money approved but never moved) should surface as alerts — replaces ETL placeholder that never fired |
| Two-file Next.js split for /execucao (Plan 17-01) | page.tsx as 6-line server component for role guard, ExecucaoClient.tsx as 218-line client component — avoids use-client/server-component conflict |
| selectedCnpj stub in ExecucaoClient (Plan 17-01) | State declared but not consumed; void pragma suppresses TS warning; Plan 17-02 wires ExecucaoSlideOver to this state |
| ClipboardDocumentCheck SVG for execucao sidebar icon (Plan 17-02) | ChartBarIcon already used by pipeline nav entry — distinct icon prevents visual ambiguity |
| execucao nav entry first after BASE_NAV_ITEMS in gestor/coordenador arrays (Plan 17-02) | Natural grouping of data-view links before admin tools (upload, distribuir, monitoramento) |
| Keep execucao_pipeline inside /api/dashboard-crm (Quick 260323) | Home compares approval vs execution in one fetch; separate route would add sync drift and extra client plumbing |
| Execution funnel uses distinct projetos_execucao CNPJs with CRM priority ladder (Quick 260323) | Prevents duplicated convenio counts and keeps execution stage semantics aligned with /api/execucao |
| tipo=meus_proponentes maps to vendedor_projetos EXISTS predicate (Plan 19-01) | Only established ownership meaning in the codebase — no ambiguity between "assigned" and "in CRM" since they use the same table |
| ano filter uses propostas.data_publicacao for both TGov tabs (Plan 19-01) | Consistent "proposal publication year" prevents cross-tab drift; execucao derives via id_proposta->transfer_gov_id join |
| Inline table filters isolated from TGov donut/KPI aggregates (Plan 19-01) | Donut/KPI stay stable as analytics lens; inline search is detail-only per CONTEXT.md Claude's discretion |
| execucao numeroProposta: COALESCE(id_proposta, nr_convenio) (Plan 19-02) | Prefers proposal ID to align with approval tab semantics; nr_convenio only when id_proposta is NULL |
| execucao Data column: COALESCE(propostas.data_publicacao, data_assinatura, data_inicio_vigencia) (Plan 19-02) | Proposal publication date preferred for cross-tab consistency; assinatura/vigencia as fallbacks for rows without matching proposta |
| execucao table sort: Data DESC, id_proposta DESC NULLS LAST, nr_convenio DESC (Plan 19-02) | Deterministic newest-first order with two tie-breakers for stable pagination per CONTEXT.md locked table-browsing decision |
| Redirect non-gestores to /sem-permissao in page.tsx (Plan 19-03) | Second layer after middleware 403; page redirect gives better UX than middleware 403 HTML for SSR-navigated requests |
| Middleware returns true HTTP 403 Response for /tgov page (Plan 19-03) | `new Response(...)` with status 403 is the only way to return true 403 for page routes in Next 14; `redirect()` returns 302 |
| eslintrc @typescript-eslint plugin declared as off (Plan 19-03) | Pre-existing disable-comments need known rule — "off" prevents "rule not found" error without changing any lint behavior |
| users.id é UUID; FKs tecnico_id e tgov_comments.author_id são UUID (Plan 20-01) | Schema real divergia do plano (assumia INT) — descoberto na verificação manual; tecnicoId tipado como string\|null em TGov row types |
| Helpers RBAC TGov centralizados em dal.ts (Plan 20-02) | canReadTgov/canWriteTgov/canCommentTgov eliminam 8 inline checks duplicados; defense-in-depth (middleware + route) para mutations csm |
| tecnico_id é UUID (string\|null) no PATCH /api/tgov/tecnico (Plan 20-03) | Validação por regex UUID antes do UPDATE; chain CRM→TGov→fallback proposta com early-exit |
| LEFT JOIN users tu apenas na query final de tableData, não no CTE materialized (Plan 20-03) | Aggregations não precisam de tecnico_nome — JOIN no filtered_main aumentaria custo de todas as agg sem benefício |
| Remover LEFT JOIN users do CTE /aprovacao + resolver técnico_nome em segunda query (Plan 20-04 perf fix) | Plan 20-03 causou timeout 116s/500 em produção sobre CTE de 904k rows; segunda query SELECT id,nome WHERE id=ANY($1) é trivial |
| NOT MATERIALIZED nos CTEs all_propostas/all_exec (Plan 20-04 perf fix) | Postgres materializava CTE referenciada uma única vez; hint força inlining e desbloqueia push-down — speedup 100x (5s → 54ms) |
| dal.ts role union estendido com 'csm' (Plan 20-04) | next-auth.d.ts já tinha do 20-01 mas dal.ts duplicava o union — pages com guard `role==='csm'` falhavam build TS |
| UAT do Plan 20-04 diferido para build deployado (Plan 20-04) | Decisão do usuário: fechar plan e validar gestor+CSM contra produção em vez de ambiente local |
| APROVACAO_ONLY_ROLES e EXECUCAO_ONLY_ROLES exportados de tgov.ts (Plan 21-01) | Centraliza constantes de grupos de roles para tab isolation em TGovDashboardClient e page.tsx compartilharem fonte única |
| projetista_execucao isolado por tecnico_id no execucao API (Plan 21-01) | Espelha o padrão de isolamento do projetista na aprovacao — projetista_execucao só vê registros atribuídos a ele |
| Tab filter bidirecional em TGovDashboardClient (Plan 21-01) | Roles aprovacao-only não viam aba execucao; roles execucao-only agora também não veem aba aprovacao — isolamento simétrico |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260318-ook | Delete import sheets tab from dashboard | 2026-03-18 | 1fe0798 | [260318-ook-delete-import-sheets-tab-from-dashboard](./quick/260318-ook-delete-import-sheets-tab-from-dashboard/) |
| 260318-re1 | Add in-app news notification with v4.0 updates | 2026-03-18 | f451ebb | [260318-re1-add-in-app-news-notification-with-update](./quick/260318-re1-add-in-app-news-notification-with-update/) |
| 260320-d8f | Add Valor Convenio column, propostas priority colors, slide-over summary | 2026-03-20 | 8a05d1d | [260320-d8f-link-com-a-respectiva-proposta-valor-do-](./quick/260320-d8f-link-com-a-respectiva-proposta-valor-do-/) |
| 260320-dj7 | Add 5 execution classification tags (Autossuficiente, Iniciante, Desembolso, Lobby, Rendimento) | 2026-03-20 | 7bb3bc7 | [260320-dj7-add-execution-tags-autossuficiente-5-pro](./quick/260320-dj7-add-execution-tags-autossuficiente-5-pro/) |
| 260320-hgb | BrasilAPI enrichment in execucao-sync + Em Execucao tab on leads page | 2026-03-20 | c4103fd | [260320-hgb-add-brasilapi-enrichment-to-execucao-syn](./quick/260320-hgb-add-brasilapi-enrichment-to-execucao-syn/) |
| 260321 | Add CRM status column to /execucao from vendedor_projetos | 2026-03-25 | 1ad08b2 | [260321-coluna-de-status-no-lead-execucao-com-os](./quick/260321-coluna-de-status-no-lead-execucao-com-os/) |
| 260322 | Tighten Rendimento tag eligibility and 5-proposal maturity boundary in /execucao | 2026-03-25 | fd21fa2 | [260322-atualizar-o-vinculo-da-tag-rendimento-pa](./quick/260322-atualizar-o-vinculo-da-tag-rendimento-pa/) |
| 260323 | Separate Pipeline Aprovação vs Pipeline Execução on home dashboard | 2026-03-25 | 0377b2c | [260323-criar-pipeline-de-execucao-podendo-ficar](./quick/260323-criar-pipeline-de-execucao-podendo-ficar/) |
| 260401-e9r | Filter TGov aprovacao and execucao tabs to Projetus proposals whitelist (246 IDs) | 2026-04-01 | e3c7025 | [260401-e9r-tgov-execucao-projetus-proposals-filter](./quick/260401-e9r-tgov-execucao-projetus-proposals-filter/) |
| 260401-kvp | Restringir visoes do ADM Produto: apenas Pipeline TGOV, Usuarios TGOV e TGOV Dashboard | 2026-04-01 | 07eeeab | [260401-kvp-restringir-visoes-do-adm-produto-apenas-](./quick/260401-kvp-restringir-visoes-do-adm-produto-apenas-/) |

### Blockers / Concerns

- **Alert business rule (RESOLVED 2026-03-18):** Client confirmed valor_desembolsado = 0 as the alert condition. Implemented in Plan 16-02 with ALERT_ZERO_EXECUTION named constant. Phase 16 complete.
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

### Technical Context (v5.0 Stack — Phase 19 TGov Dashboard)

- **New lib:** web/src/lib/tgov.ts (shared contracts for both tabs)
- **New script:** web/scripts/verify-tgov-dashboard.mjs (11-check verification harness)
- **New API route:** web/src/app/api/tgov/aprovacao/route.ts (GET — gestor-only approval analytics, CREATED Plan 19-02)
- **New API route:** web/src/app/api/tgov/execucao/route.ts (GET — gestor-only execution analytics, CREATED Plan 19-02)
- **Planned page:** web/src/app/tgov/page.tsx + TGovDashboardClient.tsx
- **Data sources:** propostas table (approval), projetos_execucao table (execution)
- **Filter semantics locked:** ano=data_publicacao, tipo=vendedor_projetos EXISTS, inline search is table-only

## Session Continuity

Last session: 2026-04-07
Stopped at: Completed 20-04 (UI sidecard + perf fixes pós-wave) — Phase 20 fechada, UAT pendente no build deployado
Resume file: .planning/phases/20-tgov-ajustes-0704/20-04-SUMMARY.md
