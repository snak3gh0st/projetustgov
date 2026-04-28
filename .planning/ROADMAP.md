# Roadmap: PROJETUS Transfer Gov Automation

## Overview

PROJETUS entrega inteligência pós-venda para gestores identificarem clientes qualificados com projetos em execução no TransferênciaGov. **Milestone v1.0** (Phases 1–5) estabeleceu o pipeline ETL completo, monitoramento operacional, qualificação de clientes e data dashboard em Streamlit. **Milestone v2.0** (Phases 6–9) transformou o dashboard em uma ferramenta de vendas com branding Sigma premium — supersedida pela migração para Next.js. **Milestone v3.0** (Phases 10–13) construiu um CRM de Vendas completo em Next.js: auth por vendedor, atribuição de leads, pipeline kanban, rastreamento de contatos e controle de comissões. **Milestone v4.0** (Phases 14–18) adicionou a aba de inteligência pós-venda `/execucao` para gestores — ETL de convenios OSC, agrupamento por CNPJ com métricas financeiras, tags de classificação e distribuição automática de leads. **Milestone v5.0** (Phases 19–21) entregou o TGov Dashboard com abas Aprovação/Execução/Prestação de Contas, designação de técnico responsável, perfil CSM, sistema de comentários, TGov BI + Pipeline, novos roles e isolamento de perfis. **Milestone v6.0** (Phases 22–26) entrega a área de Customer Success: pipeline CSM priorizado, visão unificada CRM+TGov, itens orçamentários via TransfereGov API, tags de potencial de venda por IA, e UI refresh (sidebar recolhível, dark mode, mobile, logo).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>Milestone v1.0 — Complete (Phases 1–5)</summary>

- [x] **Phase 1: Foundation** - Pipeline ETL completo com garantia de zero data loss
- [x] **Phase 2: Operational Maturity** - Monitoramento avançado, reconciliação, gestão de configuração
- [x] **Phase 4: Client Qualification** - Interface intuitiva para qualificação de proponentes
- [x] **Phase 5: Data Dashboard** - Dashboard Streamlit para visualização dos dados extraídos
- [ ] **Phase 3: Production Excellence** - Melhorias opcionais disparadas por necessidade operacional

</details>

<details>
<summary>Milestone v2.0 — Dashboard Premium Redesign (Phases 6–9) — Supersedido</summary>

- [x] **Phase 6: Visual Foundation & Component System** - Dark theme Sigma, glassmorphic cards, CSS injection, tipografia
- [x] **Phase 7: Data Visualization & Charts** - Gráficos Plotly interativos com branding Sigma
- [x] **Phase 8: Lead Profile & Enhanced Navigation** - Página de perfil de lead, busca global, ranking visual
- [x] **Phase 9: Polish & Production Readiness** - Supersedido pela migração Next.js

</details>

<details>
<summary>Milestone v3.0 — CRM de Vendas (Phases 10–13) — Complete</summary>

- [x] **Phase 10: Auth & CRM Foundation** - Auth baseada em roles (gestor/vendedor), tabelas CRM, rotas protegidas
- [x] **Phase 11: Lead Management & Contact Tracking** - Atribuição de leads, timeline de contatos, rastreamento de status
- [ ] **Phase 12: Pipeline Kanban** - Board visual com drag-and-drop por colunas de status (não iniciado)
- [x] **Phase 13: Comissoes** - Rastreamento e cálculo de comissões por vendedor

</details>

<details>
<summary>Milestone v4.0 — Projetos em Execução (Phases 14–18) — Complete</summary>

- [x] **Phase 14: Data Audit & Foundation** - Auditoria de integridade + criação de projetos_execucao (2026-03-18)
- [x] **Phase 15: ETL Sync & Validation** - Sync streaming de convenio + proposta CSVs (2026-03-18)
- [x] **Phase 16: API & Business Logic** - Rota guarded por role com agrupamento CNPJ + lógica de alertas (2026-03-18)
- [x] **Phase 17: UI & Navigation** - Página /execucao com KPIs, tabela agrupada, slide-over, sidebar (2026-03-18)
- [x] **Phase 18: Lead Distribution** - Distribuição automática de leads execucao com round-robin e roteamento para coordenador (2026-03-30)

</details>

<details>
<summary>Milestone v5.0 — TGov Dashboard (Phases 19–21) — Complete</summary>

- [x] **Phase 19: TGov Dashboard** - Página gestor-only `/tgov` com abas Aprovação/Execução, donut de situação, KPIs, tabela paginada e filtros (2026-03-30)
- [x] **Phase 20: Ajustes TGov 07/04 — Técnico + CSM** - Designação de técnico responsável, perfil CSM, sistema de comentários tgov_comments, helpers RBAC centralizados (2026-04-08)
- [x] **Phase 21: Ajustes TGov 09/04 — BI, Pipeline, Execução/PC Split, Novos Roles** - Nav TGov BI + Pipeline, split Execução/PC, novos roles coord_execucao/assistente_execucao, isolamento de perfis, bugfixes (2026-04-10)

</details>

### Milestone v6.0 — CSM & Customer Success — In Progress

- [x] **Phase 22: CSM RBAC Foundation** - canCsm() gate, /csm route protection, CRM capabilities (add client, edit contact, commissions) for CSM role
- [ ] **Phase 23: CSM Pipeline & BI Dashboard** - Unified client list with 5-level priority badges, aggregated financials, search/filter, expandable detail, BI dashboard totals and charts
- [ ] **Phase 24: UI Refresh** - Collapsible sidebar, dark mode via next-themes, mobile-responsive sidebar, logo text "Hub da Projetos"
- [ ] **Phase 25: Budget Items ETL & Display** - csm_budget_cache table, on-demand TransfereGov API fetch, 7-day TTL cache, budget items rendered per project in CSM detail view
- [ ] **Phase 26: AI Sales Tags** - OpenAI embedding-based similarity matching between budget items and Projetus service categories, manual tag fallback for CSM

---

## Phase Details

<details>
<summary>Milestone v1.0 — Complete</summary>

### Phase 1: Foundation
**Goal**: Deliver working end-to-end pipeline that extracts 4 files from Transfer Gov daily at 9am, processes with validation, loads to PostgreSQL with relationships, and alerts on failures. Zero data loss guarantee through comprehensive validation and atomic transactions.

**Status**: Complete (2026-02-05)

Plans:
- [x] 01-01-PLAN.md — Playwright crawler + Transfer Gov navigation
- [x] 01-02-PLAN.md — File download and storage
- [x] 01-03-PLAN.md — ETL parser (encoding, validation, transformation)
- [x] 01-04-PLAN.md — PostgreSQL schema, relationships, upserts
- [x] 01-05-PLAN.md — Scheduler, monitoring, health check

### Phase 2: Operational Maturity
**Goal**: Add advanced monitoring, reconciliation checks, configuration management, and data lineage tracking. System becomes easier to debug, adapt to source changes, and audit for compliance.

**Status**: Complete (2026-02-05)

Plans:
- [x] 02-01-PLAN.md — Configuration Externalization (YAML + Pydantic)
- [x] 02-02-PLAN.md — Enhanced Alerting (Telegram + Email + Volume + Scheduler)
- [x] 02-03-PLAN.md — Reconciliation & Lineage (DB model + tracking)
- [x] 02-04-PLAN.md — Dry-Run Mode & Health Check API

### Phase 3: Production Excellence
**Goal**: Add advanced capabilities for self-healing, performance optimization, and data quality monitoring. Only build when operational pain justifies complexity investment.

**Status**: Not started (triggered by operational need)

Plans:
- [ ] TBD when operational need emerges

### Phase 4: Client Qualification
**Goal**: Create an intuitive interface that makes it easy for clients to discover and contact the most valuable proponents.

**Status**: Complete (2026-02-08)

Plans:
- [x] 04-01-PLAN.md — Proponente data model + ETL extraction
- [x] 04-02-PLAN.md — Qualification dashboard page (ranked table, filters, KPIs, CSV export)
- [x] 04-03-PLAN.md — Human verification

### Phase 5: Data Dashboard
**Goal**: Build a Streamlit dashboard that visualizes all extracted Transfer Gov data with row counts, extraction history, data freshness, and drill-down views.

**Status**: Complete (2026-02-08)

Plans:
- [x] 05-01-PLAN.md — Dashboard foundation: Streamlit app structure, DB queries, shared components, home overview page
- [x] 05-02-PLAN.md — Entity pages: Propostas, Programas, Apoiadores, Emendas with cross-filtering and CSV export
- [x] 05-03-PLAN.md — Extraction history page and Railway deployment configuration
- [x] 05-04-PLAN.md — Human verification

</details>

<details>
<summary>Milestone v2.0 — Dashboard Premium Redesign — Supersedido (Next.js)</summary>

### Phase 6: Visual Foundation & Component System
**Status**: Complete (2026-02-09)

Plans:
- [x] 06-01-PLAN.md — CSS foundation: config.toml dark theme, external CSS files, CSS loader
- [x] 06-02-PLAN.md — Component wrappers (cards, KPI, badges) + Home page integration

### Phase 7: Data Visualization & Charts
**Status**: Complete (2026-02-10)

Plans:
- [x] 07-01-PLAN.md — Plotly theme wrapper, chart functions (choropleth, distribution, trend, sparkline)
- [x] 07-02-PLAN.md — Chart integration into Home and Qualificacao pages

### Phase 8: Lead Profile & Enhanced Navigation
**Status**: Complete (2026-02-10)

Plans:
- [x] 08-01-PLAN.md — Search queries, lead profile queries, tier classification utility
- [x] 08-02-PLAN.md — Lead profile page with tabs, KPIs, contact info, quick actions
- [x] 08-03-PLAN.md — Global search bar, sidebar branding, breadcrumb component
- [x] 08-04-PLAN.md — Qualificacao ranking cards, entity page premium styling
- [x] 08-05-PLAN.md — Visual verification

### Phase 9: Polish & Production Readiness
**Status**: Superseded (Streamlit replaced by Next.js migration)

</details>

<details>
<summary>Milestone v3.0 — CRM de Vendas — Complete (exceto Phase 12)</summary>

### Phase 10: Auth & CRM Foundation
**Goal**: Auth baseada em roles (gestor/vendedor), tabelas CRM, rotas protegidas. Gestor vê todos os leads, vendedor vê apenas os atribuídos.

**Status**: Complete (2026-02-12)

Plans:
- [x] 10-01-PLAN.md — Install deps, CRM database tables, Auth.js config with credentials + JWT
- [x] 10-02-PLAN.md — Login page with Sigma branding, middleware route protection
- [x] 10-03-PLAN.md — DAL with role-based filtering, protect API routes, gestor vendedor management

### Phase 11: Lead Management & Contact Tracking
**Goal**: Gestor atribui leads a vendedores, vendedores registram notas de contato, sistema detecta duplicatas.

**Status**: Complete (2026-02-12)

Plans:
- [x] 11-01-PLAN.md — Schema updates: existing_clients table, contact_notes, 5th status "Nao Contatado"
- [x] 11-02-PLAN.md — Lead assignment UI and API with duplicate detection
- [x] 11-03-PLAN.md — Priority indicators, parlamentar repositioning, existing client flags
- [x] 11-04-PLAN.md — Contact notes timeline component and visualizador role
- [x] 11-05-PLAN.md — Contact edit UI gap closure (phone/email inline editing)

### Phase 12: Pipeline Kanban
**Goal**: Board visual com drag-and-drop entre 4 colunas de status. Vendedor arrasta leads entre etapas; gestor filtra por vendedor, UF ou tier.

**Status**: Not started

Plans:
- [ ] TBD (plan with `/gsd:plan-phase 12`)

### Phase 13: Comissoes
**Goal**: Rastreamento e cálculo de comissões por vendedor. Quando lead é marcado "Fechado", comissão é calculada com percentual configurável.

**Status**: Complete (2026-02-14)

Plans:
- [x] 13-01-PLAN.md — Commission configuration backend (DB tables, config API, lock on Fechado)
- [x] 13-02-PLAN.md — Commission report with filters and enhanced vendedor dashboard

</details>

<details>
<summary>Milestone v4.0 — Projetos em Execução — Complete</summary>

### Phase 14: Data Audit & Foundation
**Goal**: Validar integridade dos dados antes de qualquer linha de ETL ou API, e criar a tabela projetos_execucao com colunas NUMERIC(18,2).

**Status**: Complete (2026-03-18)

Plans:
- [x] 14-01-PLAN.md — Data audit diagnostics: NULL proposta_id count, CNPJ padding check, gap strategy documentation
- [x] 14-02-PLAN.md — Create projetos_execucao table with NUMERIC(18,2) columns, UNIQUE(nr_convenio), indexes

### Phase 15: ETL Sync & Validation
**Goal**: Sync streaming dos CSVs do governo (187MB proposta + 15MB convenio) para projetos_execucao, com filtro OSC-only e join por id_proposta.

**Status**: Complete (2026-03-18)

Plans:
- [x] 15-01-PLAN.md — Export helpers, execucao-sync.ts with streaming proposta+convenio ETL, in-memory join, UPSERT
- [x] 15-02-PLAN.md — One-off test script, cron endpoint /api/cron/sync-execucao, vercel.json entry

### Phase 16: API & Business Logic
**Goal**: Rota guarded por role servindo projetos_execucao agrupado por CNPJ com métricas financeiras e lógica de alertas confirmada com cliente.

**Status**: Complete (2026-03-18)

Plans:
- [x] 16-01-PLAN.md — GET /api/execucao with role guard, GROUP BY CNPJ query, weighted pct_execucao, SQL-computed dias, contact EXISTS
- [x] 16-02-PLAN.md — Alert business rule client confirmation, named constants, alert_only filter

### Phase 17: UI & Navigation
**Goal**: Página /execucao com KPI cards, tabela agrupada, slide-over por CNPJ, entry no sidebar, e timestamp de freshness.

**Status**: Complete (2026-03-18)

Plans:
- [x] 17-01-PLAN.md — API extension, /sem-permissao page, ExecucaoClient with KPIs, table, filters, alert highlighting
- [x] 17-02-PLAN.md — ExecucaoSlideOver com detalhe por convenio, barra de progresso, contact badge, Sidebar nav entry

### Phase 18: Lead Distribution
**Goal**: Distribuição automática de leads de execução para vendedores via round-robin, com roteamento prioritário para coordenador quando o CNPJ já é cliente existente. Advisory lock previne double-assignment em chamadas concorrentes.

**Depends on**: Phase 17 (leads execucao populados via /api/execucao)

**Status**: Complete (2026-03-30)

Plans:
- [x] 18-01-PLAN.md — distribute-execucao.ts: advisory lock + client routing + round-robin; POST /api/execucao/distribute
- [x] 18-02-PLAN.md — UI de distribuição no painel gestor + verification

</details>

<details>
<summary>Milestone v5.0 — TGov Dashboard — Complete</summary>

### Phase 19: TGov Dashboard
**Goal**: Página gestor-only `/tgov` que reproduz as principais visões Power BI de aprovação e execução dentro do app. Abas Aprovação e Execução com donut de situação, KPI card, tabela paginada (25 rows, paginação numerada) e filtros compartilhados (Ano, Tipo, Status, UF). Filtros inline de tabela (Proponente, Número Proposta) afetam apenas a tabela.

**Depends on**: Phase 17 (projetos_execucao populado), Phase 16 (dados execucao na API)

**Status**: Complete (2026-03-30)

Plans:
- [x] 19-01-PLAN.md — Shared TGov contracts (tgov.ts) and DB-backed verification harness
- [x] 19-02-PLAN.md — API endpoints: /api/tgov/aprovacao e /api/tgov/execucao com SQL aggregates + pagination
- [x] 19-03-PLAN.md — UI: /tgov page com tabs, donut chart, KPI card, tabela paginada, sidebar entry

### Phase 20: Ajustes TGov 07/04 — Técnico Responsável + Perfil CSM
**Goal**: Criar sistema de designação manual de técnico responsável (propostas e execuções TGov, pool = adm_produto/gestor/admin) e novo perfil CSM (read-only TGov + comentários). Sistema de comentários `tgov_comments` com thread no sidecard.

**Depends on**: Phase 19 (TGov dashboard + sidecards existentes)

**Status**: Complete (2026-04-08)

Plans:
- [x] 20-01-PLAN.md — SQL migrations (tecnico_id em 4 tabelas + tgov_comments) + tipos TS (next-auth role csm, tgov.ts, tgov-tables.ts)
- [x] 20-02-PLAN.md — Helpers RBAC em dal.ts + middleware branch csm + refator das 5 routes TGov existentes
- [x] 20-03-PLAN.md — Endpoints novos: /api/tgov/comments (GET/POST), /api/tgov/tecnico (PATCH), /api/tgov/usuarios/tecnicos (GET) + join tecnico nos CTEs aprovacao/execucao
- [x] 20-04-PLAN.md — Frontend: CommentsThread + TecnicoSelector, integração nos 2 sidecards, sidebar oculta CRM pra csm

**Out of scope**: Pipeline coordenação Paulo+Philipe, round-robin automático, edição/deleção de comentários, notificações.

---

### Phase 21: Ajustes TGov 09/04 — BI, Pipeline, Execução/PC Split, Novos Roles
**Goal**: Reestruturar navegação TGov (renomear "TGov Pipeline" → "TGov BI", adicionar novo "TGov Pipeline" com kanban estilo CRM), split da aba Execução em Execução + Prestação de Contas, novos roles RBAC (coord_execucao, assistente_execucao, projetista_execucao) com isolamento completo de perfis, e bugfixes na aba Aprovação (CSS, SituacaoBadge, contador de comentários).

**Depends on**: Phase 20 (técnico, CSM, comentários tgov_comments)

**Status**: Complete (2026-04-10)

Plans:
- [x] 21-01-PLAN.md — RBAC: novos roles em validations.ts + page.tsx + middleware; isolamento de abas por role
- [x] 21-02-PLAN.md — Sidebar: renomear TGov BI + novo item TGov Pipeline; nova rota /tgov/pipeline com TGovPipelineSection
- [x] 21-03-PLAN.md — Split Execução/PC: nova aba Prestação de Contas, split API execucao/route.ts, paginação independente
- [x] 21-04-PLAN.md — Bugfixes Aprovação: CSS bordas tabela, SituacaoBadge na coluna SITUAÇÃO, ícone contador de comentários

**Out of scope**: Notificações, edição de comentários, qualquer mudança fora do módulo TGov.

</details>

---

### Milestone v6.0 — CSM & Customer Success — In Progress

### Phase 22: CSM RBAC Foundation
**Goal**: CSM role (bruno@projetus.org) can access a protected /csm area and perform CRM capabilities — adding clients, editing contact data, and viewing own commissions. Auth gate exists before any CSM data routes are built.
**Depends on**: Phase 21 (csm role already in DB enum + next-auth.d.ts)
**Requirements**: CSM-01, CSM-02, CSM-03, CSM-04
**Success Criteria** (what must be TRUE):
  1. CSM user navigating to /csm lands on an authenticated page; unauthenticated users are redirected
  2. canCsm() helper in dal.ts is applied to all /api/csm/* routes — no CSM route is accessible without the auth gate
  3. CSM can add a new client record to the system via the existing CRM add-client flow
  4. CSM can edit phone/email for any client without needing gestor privileges
  5. CSM can view their own commission calculations using the existing SDR/Closer commission system
**Plans:** 3/3 plans complete

Plans:
- [ ] 22-01-PLAN.md — canCsm() helper, middleware exemption for /csm + /api/csm, /csm page scaffold, sidebar CSM nav, bruno user verification (CSM-01)
- [ ] 22-02-PLAN.md — POST /api/csm/clients (add client) + PATCH /api/csm/clients/[cnpj]/contacts (edit telefone/email only) (CSM-02, CSM-03)
- [ ] 22-03-PLAN.md — GET /api/csm/comissoes proxy + /csm/comissoes sub-page + sidebar Comissoes entry (CSM-04)

### Phase 23: CSM Pipeline & BI Dashboard
**Goal**: CSM sees all Projetus clients (2020–2025) in a unified prioritized list with aggregated financial data, can drill into per-client project detail, filter and search, and has a dedicated BI dashboard with portfolio-wide totals and project counts.
**Depends on**: Phase 22 (canCsm() gate must exist before CSM data routes are built)
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, BI-01, BI-02, BI-03, BI-04, BI-05
**Success Criteria** (what must be TRUE):
  1. CSM sees a unified client list — one row per client — showing saldo em conta, valor a desembolsar, saldo rendimento previsto, and valor a liberar aggregated across all projects, plus a count of projects per situacao (execucao c/ saldo, a desembolsar, aprovacao, PC) on each client row
  2. Each client row and project displays a priority badge (1=saldo em conta, 2=a desembolsar, 3=rendimento, 4=aprovacao, 5=PC) with distinct color per level
  3. CSM can search by client name or CNPJ and filter by situacao or saldo range
  4. CSM can expand a client row to see all their projects grouped by phase (aprovacao, execucao, PC) with per-project financial data
  5. CSM BI dashboard shows portfolio totals (saldo em conta, a liberar, rendimento) and a project count breakdown by situacao via KPI cards and chart
**Plans:** 1/4 plans executed

Plans:
- [x] 23-01-PLAN.md — GET /api/csm/portfolio (aggregated client list with priority badge) + GET /api/csm/bi (portfolio totals, by-status counts, funnel) (CLI-01..03, CLI-06 server, BI-01..05 server)
- [ ] 23-02-PLAN.md — GET /api/csm/clients/[cnpj]/projects (single-client project breakdown with per-row priority) (CLI-04, CLI-06)
- [ ] 23-03-PLAN.md — PriorityBadge component + replace CsmDashboardClient with full client list (search, filter, expandable rows, badges) (CLI-01..06 UI)
- [ ] 23-04-PLAN.md — /csm/bi server+client page (KPI cards + donut + funnel) + Sidebar nav entry (BI-01..05 UI)

### Phase 24: UI Refresh
**Goal**: All platform users benefit from a collapsible sidebar, dark mode, mobile-responsive navigation, and updated logo text. These changes apply globally — not CSM-specific.
**Depends on**: Phase 22 (csm role + /csm route exist; LayoutShell will wrap the sidebar that already contains the CSM nav item)
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. User can click a toggle to collapse the sidebar to icon-only width and expand it again; state persists across page navigations (cookie-based, no hydration flash)
  2. User can switch to dark mode from any page; the dark class applies globally including Radix UI portal components (dropdowns, dialogs); no flash of unstyled content on first load
  3. On a mobile device, the sidebar appears as a bottom drawer (vaul) that closes automatically on route change
  4. The app logo/brand text reads "Hub da Projetos" everywhere it previously showed "CRM de vendas"
**Plans**: TBD

### Phase 25: Budget Items ETL & Display
**Goal**: CSM can view budget line items (Plano de Aplicacao Detalhado) for any execution-phase project with saldo em conta, fetched on-demand from TransfereGov API and cached for 7 days.
**Depends on**: Phase 23 (CSM client detail view must exist to render budget items within it)
**Requirements**: BUD-01, BUD-02, BUD-03, BUD-04
**Success Criteria** (what must be TRUE):
  1. CSM opening a project in execucao with saldo em conta sees a list of budget line items from Plano de Aplicacao Detalhado
  2. Budget items with saldo zerado (fully executed) are not shown in the list
  3. Item descriptions are truncated to 30 characters in the list view
  4. Items load from cache on repeat visits (7-day TTL); first visit triggers a TransfereGov API fetch transparently
**Research prerequisite**: TransfereGov API authentication requirements for planoAplicacaoDetalhado endpoint must be verified (curl test) before plan-phase begins. If auth is required, server-side proxy must be scoped. If public access is blocked entirely, full ETL (Option B) must be planned as alternative before implementation starts.
**Plans**: TBD

### Phase 26: AI Sales Tags
**Goal**: Budget line items for each execution project are automatically matched against Projetus service categories (juridico, contabil, marketing, RH) and presented as sales potential tags; CSM can override or assign tags manually when AI is not available.
**Depends on**: Phase 25 (csm_budget_cache.items must be populated before embeddings can be computed)
**Requirements**: TAG-01, TAG-02
**Success Criteria** (what must be TRUE):
  1. Each execution project in the CSM view displays one or more service tags (juridico, contabil, marketing, RH) automatically derived from its budget item descriptions
  2. CSM can manually assign or override service tags on any project when the auto-generated tags are absent or incorrect
**Research prerequisite**: pgvector availability on sigmadb dedicated Postgres must be verified (`SELECT * FROM pg_extension WHERE extname = 'vector'`) before implementation. In-memory JS cosine similarity is the v6.0 fallback if pgvector is unavailable — plan accordingly.
**Plans**: TBD

---

## Quick Tasks Completed (60 total)

Tarefas pontuais executadas fora de fases formais — bugs, ajustes de UX e pequenas features. Ver `.planning/quick/` para detalhes de cada uma.

**Seleção das mais relevantes:**

| ID | Descrição | Data | Commit |
|----|-----------|------|--------|
| 260318-ook | Delete import sheets tab from dashboard | 2026-03-18 | 1fe0798 |
| 260318-re1 | Add in-app news notification with v4.0 updates | 2026-03-18 | f451ebb |
| 260320-d8f | Add Valor Convenio column, propostas priority colors, slide-over summary | 2026-03-20 | 8a05d1d |
| 260320-dj7 | Add 5 execution classification tags (Autossuficiente, Iniciante, Desembolso, Lobby, Rendimento) | 2026-03-20 | 7bb3bc7 |
| 260320-hgb | BrasilAPI enrichment in execucao-sync + Em Execucao tab on leads page | 2026-03-20 | c4103fd |
| 260321 | Add CRM status column to /execucao from vendedor_projetos | 2026-03-25 | 1ad08b2 |
| 260322 | Tighten Rendimento tag eligibility and 5-proposal maturity boundary | 2026-03-25 | fd21fa2 |
| 260323 | Separate Pipeline Aprovação vs Pipeline Execução on home dashboard | 2026-03-25 | 0377b2c |
| 260401-e9r | Filter TGov aprovacao and execucao tabs to Projetus proposals whitelist (246 IDs) | 2026-04-01 | e3c7025 |
| 260401-kvp | Restringir visões do ADM Produto: Pipeline TGov, Usuários TGov e TGov Dashboard | 2026-04-01 | 07eeeab |

---

## Progress

**Execution Order:**
- **Milestone v1.0**: Phases 1 → 2 → 4 → 5 (complete), Phase 3 (optional)
- **Milestone v2.0**: Phases 6 → 7 → 8 (complete), Phase 9 (superseded)
- **Milestone v3.0**: Phases 10 → 11 → 13 (complete), Phase 12 (not started)
- **Milestone v4.0**: Phases 14 → 15 → 16 → 17 → 18 (complete)
- **Milestone v5.0**: Phases 19 → 20 → 21 (complete)
- **Milestone v6.0**: Phases 22 → 23 → 24 → 25 → 26 (in progress)

| Phase | Plans | Status | Concluído |
|-------|-------|--------|-----------|
| **Milestone v1.0** | | | |
| 1. Foundation | 5/5 | ✅ Complete | 2026-02-05 |
| 2. Operational Maturity | 4/4 | ✅ Complete | 2026-02-05 |
| 4. Client Qualification | 3/3 | ✅ Complete | 2026-02-08 |
| 5. Data Dashboard | 4/4 | ✅ Complete | 2026-02-08 |
| 3. Production Excellence | 0/TBD | ⏸ Optional | — |
| **Milestone v2.0** | | | |
| 6. Visual Foundation & Component System | 2/2 | ✅ Complete | 2026-02-09 |
| 7. Data Visualization & Charts | 3/3 | ✅ Complete | 2026-02-10 |
| 8. Lead Profile & Enhanced Navigation | 5/5 | ✅ Complete | 2026-02-10 |
| 9. Polish & Production Readiness | — | ⛔ Superseded | — |
| **Milestone v3.0** | | | |
| 10. Auth & CRM Foundation | 3/3 | ✅ Complete | 2026-02-12 |
| 11. Lead Management & Contact Tracking | 5/5 | ✅ Complete | 2026-02-12 |
| 12. Pipeline Kanban | 0/TBD | 🔲 Not started | — |
| 13. Comissoes | 2/2 | ✅ Complete | 2026-02-14 |
| **Milestone v4.0** | | | |
| 14. Data Audit & Foundation | 2/2 | ✅ Complete | 2026-03-18 |
| 15. ETL Sync & Validation | 2/2 | ✅ Complete | 2026-03-18 |
| 16. API & Business Logic | 2/2 | ✅ Complete | 2026-03-18 |
| 17. UI & Navigation | 2/2 | ✅ Complete | 2026-03-18 |
| 18. Lead Distribution | 2/2 | ✅ Complete | 2026-03-30 |
| **Milestone v5.0** | | | |
| 19. TGov Dashboard | 3/3 | ✅ Complete | 2026-03-30 |
| 20. Ajustes TGov 07/04 — Técnico + CSM | 4/4 | ✅ Complete | 2026-04-08 |
| 21. Ajustes TGov 09/04 — BI + Pipeline + Roles | 4/4 | ✅ Complete | 2026-04-10 |
| **Milestone v6.0** | | | |
| 22. CSM RBAC Foundation | 3/3 | Complete    | 2026-04-27 |
| 23. CSM Pipeline & BI Dashboard | 1/4 | In Progress|  |
| 24. UI Refresh | 0/TBD | 🔲 Not started | — |
| 25. Budget Items ETL & Display | 0/TBD | 🔲 Not started | — |
| 26. AI Sales Tags | 0/TBD | 🔲 Not started | — |

**Resumo:** 26 phases planejadas — 18 completas, 1 opcional (Phase 3), 1 supersedida (Phase 9), 1 não iniciada/diferida (Phase 12), 5 em planejamento (Phases 22–26)

---

*Roadmap criado: 2026-02-04*
*Última atualização: 2026-04-27 — Milestone v6.0 CSM & Customer Success — Phases 22–26 adicionadas*
