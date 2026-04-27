# PROJETUS — Transfer Gov Automation

## What This Is

Sistema completo de CRM de vendas e inteligencia de dados do Transfer Gov. Extrai dados automaticamente do repositorio governamental, sincroniza propostas e convenios em Supabase PostgreSQL, e disponibiliza dashboard de vendas com pipeline de aprovacao, pipeline de execucao pos-venda, BI analytics, comissoes, e monitoramento de CNPJs. Plataforma Next.js 14 com autenticacao por role (gestor, vendedor, coordenador, visualizador) deployada na Vercel.

## Core Value

**CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov**, permitindo que gestores e vendedores identifiquem, contactem e acompanhem proponentes desde a aprovacao ate a execucao financeira.

## Requirements

### Validated

- ✓ Crawler & ETL Pipeline — v1.0
- ✓ Streamlit dashboard com visualizacao — v1.0/v2.0 (superseded by Next.js)
- ✓ Auth & role-based access (gestor/vendedor/coordenador/visualizador) — v3.0
- ✓ Lead management com assignment, contact tracking, notes timeline — v3.0
- ✓ Commission system com SDR/Closer split — v3.0
- ✓ Pipeline de vendas com status tracking — v3.0
- ✓ Vercel cron sync (leads + execucao) — v3.0/v4.0
- ✓ BrasilAPI enrichment para contatos — v3.0/v4.0
- ✓ BI dashboard com KPIs e charts — v3.0
- ✓ CNPJ monitoring com web push notifications — v3.0
- ✓ Projetos em execucao: ETL, API, UI com metricas financeiras — v4.0
- ✓ Alert rule (valor_desembolsado = 0) confirmada com cliente — v4.0
- ✓ Dashboard separado Pipeline Aprovacao vs Pipeline Execucao — v4.0
- ✓ Distribuicao igualitaria de leads na execucao com client-routing para coordenador — v4.1 Phase 18
- ✓ TGov Dashboard (/tgov) com abas Aprovacao/Execucao/Prestacao de Contas — v5.0 Phase 19
- ✓ Designacao de tecnico responsavel + perfil CSM + tgov_comments — v5.0 Phase 20
- ✓ Nav TGov BI + Pipeline, novos roles coord_execucao/assistente_execucao, isolamento de perfis — v5.0 Phase 21
- ✓ CSM RBAC Foundation: canCsm() gate, /csm + /csm/comissoes pages, middleware exemptions, CSM client/contact/commissions APIs — v6.0 Phase 22

### Active

- [ ] CSM pipeline com 5 niveis de prioridade por saldo/fase TransfereGov
- [ ] Perfil CSM completo: acesso CRM+TGov unificado, adicionar clientes, comissoes
- [ ] Visualizacao orcamentaria simplificada (Plano de Aplicacao Detalhado, 30 chars)
- [ ] Tags de potencial de venda por IA (similaridade itens orcamentarios × servicos Projetus)
- [ ] UI: sidebar recolhivel, dark mode, mobile-friendly, logo text

### Out of Scope

- **Edicao de dados de projetos em execucao** — Read-only por decisao; validar valor da visualizacao primeiro
- **Workflow de handoff pos-venda** — Ainda nao discutido com cliente
- **Notas/contatos especificos para pos-venda** — Depende do workflow de handoff
- **Alertas push para projetos em execucao** — Depende de regras de negocio com cliente
- **Mobile app** — Web-first approach
- **WhatsApp automation** — Projeto separado/futuro

## Current Milestone: v6.0 CSM & Customer Success

**Goal:** Criar area de Customer Success para Bruno Ferreira — pipeline priorizado por saldo/fase TransfereGov com visao combinada CRM+TGov, acesso orcamentario simplificado, tags de potencial de venda por IA, e melhorias de UI para toda a plataforma.

**Target features:**
- CSM pipeline com 5 niveis de prioridade (execucao com saldo, a desembolsar, rendimento, aprovacao, prestacao de contas)
- Perfil CSM completo: acesso CRM+TGov unificado, adicionar clientes, editar telefones, calcular comissoes
- Visualizacao orcamentaria: itens do Plano de Aplicacao Detalhado simplificados (30 chars, via ID Proposta)
- Tags de potencial de venda por IA (similaridade entre itens orcamentarios e servicos Projetus)
- UI: sidebar recolhivel, dark mode, mobile-friendly, logo text → "Hub da Projetos"

## Context

**Current state (v5.0 shipped):**
- Next.js 14 App Router + Supabase PostgreSQL on Vercel (crons moved to sigmadb systemd timers)
- ~15,500+ LOC TypeScript (web/)
- 21 phases completed across 5 milestones + 95+ quick tasks
- sigmadb systemd timers: sync-leads + sync-execucao (replacing Vercel crons)
- 8,793 OSC execution projects synced from government CSVs
- 10+ roles: gestor, vendedor, coordenador, visualizador, gestor_vendedor, csm, coord_execucao, assistente_execucao, coord_prestacao, assistente_prestacao
- TGov Dashboard (/tgov) com abas Aprovacao/Execucao/PC, tecnico assignment, tgov_comments

**Key technical decisions (v4.0):**
- NUMERIC(18,2) for all financial columns (not FLOAT)
- ON CONFLICT (nr_convenio) as UPSERT key for execution projects
- LEFT JOIN with join_miss_count for data loss visibility
- Alert condition: valor_desembolsado = 0 (client-confirmed)
- All financial computations in SQL, not JavaScript
- OSC filter multi-column fallback for government CSV header changes
- Memory peak ~1300MB during proposta sync (may need optimization for Vercel)

**Known tech debt:**
- Phase 3 (Production Excellence) never started — triggered by operational need
- Phase 12 (Pipeline Kanban) not started — drag-and-drop not yet needed
- Memory peak ~1300MB on proposta sync may exceed Vercel Pro 1GB limit

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python → Next.js migration | CRM needs demanded richer UI than Streamlit | ✓ Good |
| Railway → Supabase | Railway deleted; Supabase provides auth + DB + hosting | ✓ Good |
| Data audit before ETL (Phase 14 first) | NULL proposta_id and CNPJ padding are one-way doors | ✓ Good |
| NUMERIC(18,2) for financial columns | Old ETL tables use FLOAT incorrectly | ✓ Good |
| Dedicated cron endpoint for execution sync | Lead sync consumes ~250s of 300s budget | ✓ Good |
| Alert rule: valor_desembolsado = 0 | Client confirmed: money approved but never moved | ✓ Good |
| All financial computations in SQL | Prevents floating-point errors, keeps calc close to data | ✓ Good |
| Separate dashboard pipelines (approval vs execution) | Prevents duplicated counts, clear stage semantics | ✓ Good |

## Constraints

- **Budget**: R$5.000/mes do cliente, Supabase free tier, Vercel Pro
- **Memory**: Proposta CSV sync peaks at ~1300MB heap (1.1M rows)
- **Cron**: Vercel 300s maxDuration per cron job
- **Data**: Government CSV headers can change without notice
- **Roles**: 5 roles with different access levels across approval and execution pipelines

## Infrastructure

| Service | Usage | Status |
|---------|-------|--------|
| **Supabase** | PostgreSQL database (all data) | Active |
| **Vercel** | Next.js hosting, cron jobs, deploy from master | Active |
| **Railway** | — | **Deleted 2026-02-12** |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 — Milestone v6.0 CSM & Customer Success started*
