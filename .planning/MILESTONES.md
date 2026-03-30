# Milestones: PROJETUS

## v4.0 — Projetos em Execucao (Shipped: 2026-03-30)

**Phases:** 14-17 (4 phases, 8 plans)
**Quick tasks:** 8 delivered
**Commits:** 124 | Files: 84 | LOC: +15,582 / -2,464
**Timeline:** 10 days (2026-03-18 → 2026-03-27)

**Key accomplishments:**
- Data audit validating 44K+ convenios and 27K+ proponentes — zero unknowns before ETL
- Streaming ETL syncing 8,793 OSC execution projects from government CSVs with idempotent UPSERT
- Role-guarded API with CNPJ-grouped financial intelligence (desembolso, saldo, % execucao, vigencia)
- Client-confirmed alert rule (valor_desembolsado = 0) for zero-execution projects
- Full /execucao page with KPI cards, grouped table, slide-over detail, sidebar nav
- 8 quick tasks: execution tags, BrasilAPI enrichment, CRM status column, dashboard pipeline split, BI redesign

**Key deliverables:**
- New DB table: projetos_execucao with NUMERIC(18,2) financials
- ETL: execucao-sync.ts with streaming CSV join and cron at 13:00 UTC
- API: GET /api/execucao (grouped) + /api/execucao/[cnpj] (detail)
- UI: /execucao page, ExecucaoSlideOver, sidebar nav for gestor/coordenador
- Dashboard: separate Pipeline Aprovacao vs Pipeline Execucao on home
- BI: Aprovacao/Execucao tabs with vendedor filter

---

## v3.0 — CRM de Vendas

**Phases:** 10, 11, 12, 13
**Status:** Complete
**Summary:** Full sales CRM with auth per vendedor, lead management with CNPJ assignment, contact tracking, commission system, daily sync from 3 repo bases, BI dashboard, push notifications. 74 quick tasks delivered.

**Key deliverables:**
- Auth & roles (vendedor, gestor, coordenador, visualizador, gestor hybrid)
- Lead management with cascade emenda display
- Multi-contact tracking with notes timeline
- Commission system with SDR/Closer split
- Vercel cron sync + BrasilAPI enrichment
- BI dashboard with KPI cards and charts
- CNPJ monitoring with web push notifications

## v2.0 — Dashboard Premium Redesign

**Phases:** 6, 7, 8 (Phase 9 N/A)
**Status:** Superseded by Next.js migration
**Summary:** Streamlit dashboard redesign. Superseded when project migrated to Next.js for CRM.

## v1.0 — Crawler & ETL Pipeline

**Phases:** 1, 2, 4, 5
**Status:** Complete
**Summary:** Automated extraction from TransferenciaGov, ETL pipeline, PostgreSQL storage with relationships.

---
*Last phase number: 17*
