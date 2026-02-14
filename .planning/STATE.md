# Project State: PROJETUS CRM de Vendas

## Project Reference

**Core Value:** CRM funcional para vendedores qualificarem e contactarem leads do TransferênciaGov.

**Current Milestone:** v3.0 CRM de Vendas

**Milestone Goal:** Transformar dashboard de leads em CRM com auth, pipeline kanban, tracking de contato, e comissões.

**Current Focus:** Phase 13 - Comissões (Plan 01 complete)

## Current Position

**Phase:** 13 of 13 (Milestone v3.0)
**Plan:** 1 of 2 (Phase 13)
**Status:** Executing Phase 13
**Progress:** [█████████░] 85%

**Milestone v1.0 Status:** Complete (Phases 1, 2, 4, 5 delivered)
**Milestone v2.0 Status:** Superseded by Next.js migration (Phases 6-8 delivered in Streamlit, Phase 9 N/A)
**Milestone v3.0 Status:** Initialized (Phases 10-13 planned)

## Accumulated Context

### Key Decisions (v3.0)

| Decision | Phase | Rationale | Date |
|----------|-------|-----------|------|
| Next.js replaces Streamlit | v3.0 | Client needs interactive CRM, Streamlit too limited | 2026-02-11 |
| Login por vendedor (not shared) | v3.0 | Each seller sees only their assigned leads | 2026-02-11 |
| Manual lead assignment by gestor | v3.0 | Gestor controls distribution, avoids duplicates | 2026-02-11 |
| Simple 4-column kanban | v3.0 | Novo → Contactado → Em negociação → Fechado | 2026-02-11 |
| Commission calculation with % | v3.0 | Percentual over contract value, report per seller | 2026-02-11 |
| Railway PostgreSQL (not Supabase) | v3.0 | Existing data, faster to ship | 2026-02-11 |
| Vercel deploy with iad1 region | v3.0 | Same region as Railway for low latency | 2026-02-11 |
| Single /api/dashboard endpoint | v3.0 | Avoids parallel connection issues on Vercel serverless | 2026-02-11 |
| JWT sessions for credentials auth | 10-01 | Auth.js v5 requires JWT for credentials provider | 2026-02-11 |
| Bcrypt with 10 rounds | 10-01 | Industry standard for password hashing (~100ms per hash) | 2026-02-11 |
| React 18 form patterns (useFormState) | 10-02 | Project uses React 18.3.0, not React 19 useActionState | 2026-02-11 |
| Edge Runtime warnings acceptable | 10-02 | Middleware only validates JWT, DB queries run server-side | 2026-02-11 |
| NUMERIC(15,2) for financial columns | quick-3 | Proper arithmetic in SQL, no string parsing needed | 2026-02-11 |
| Status contato: Novo/Contactado/Proposta/Retorno | quick-3 | Cleaner CRM pipeline stages replacing old PROPOSTA/AINDA NAO/RETORNO | 2026-02-11 |
| Existing clients table with CNPJ exclusion | 11-01 | Created existing_clients table to prevent vendedor distribution to 140+ existing clients | 2026-02-12 |
| Contact notes table activation | 11-01 | Activated contact_notes for timeline feature (Plans 03-04) | 2026-02-12 |
| 5-status system with 'Não Contatado' | 11-01 | Default status for new leads, enables gestor to monitor uncontacted leads | 2026-02-12 |
| Vendedores always exclude existing clients | 11-01 | API-level filtering ensures vendedores never see existing clients | 2026-02-12 |
| CNPJ-based assignment with duplicate detection | 11-02 | Single CNPJ can have multiple emendas, must assign atomically with conflict check | 2026-02-12 |
| HTTP 409 for duplicate assignment | 11-02 | Standard conflict status allows UI force override without separate endpoint | 2026-02-12 |
| Visualizador read-only role for leadership | 11-04 | Leadership needs visibility without modification risk | 2026-02-12 |
| Contact notes sorted DESC by created_at | 11-04 | Most recent interactions are most relevant for sales context | 2026-02-12 |
| Inline edit pattern for contact fields | 11-05 | Cleaner UX than always-visible inputs, maintains read-only appearance | 2026-02-12 |
| Optimistic updates in slide-over | 11-05 | Faster perceived performance, acceptable for MVP without parent refresh | 2026-02-12 |
| Database-driven commission config | 13-01 | Enables gestor to adjust rates without code deployment, supports future per-vendedor rates | 2026-02-14 |
| Separate commission_overrides table | 13-01 | Preserves audit trail, tracks approval + motivo for each override | 2026-02-14 |
| Commission locking on Fechado status | 13-01 | Prevents retroactive rate changes affecting closed deals, allows re-opening leads | 2026-02-14 |
| PostgreSQL NUMERIC for commission math | 13-01 | Avoids floating-point precision errors, keeps calculation logic close to data | 2026-02-14 |

### Technical Context (Next.js Stack)

- **Framework:** Next.js 14 App Router, deployed on Vercel
- **Database:** PostgreSQL on Railway (shortline.proxy.rlwy.net:30852)
- **Frontend:** React 18, Tailwind CSS (Sigma brand theme), Recharts
- **Auth:** Auth.js v5 (next-auth@beta) with credentials provider and JWT sessions
- **Working directory:** `web/` (deploy from here, NOT root)
- **Existing pages:** CRM Dashboard (/), Leads (/leads), Lead Profile (/lead/[cnpj]), Monitoramento (/monitoramento)
- **Existing API routes:** /api/dashboard, /api/dashboard-crm, /api/leads, /api/leads/[cnpj]/*, /api/chart/*, /api/filters/*, /api/monitoramento

### Active TODOs

- [x] Plan Phase 10: Auth & CRM Foundation
- [x] Execute Phase 10 Plan 01: Install dependencies, create CRM tables, configure Auth.js
- [x] Execute Phase 10 Plan 02: Login UI and middleware
- [x] Execute Phase 10 Plan 03: Vendedor management UI (already done via quick tasks)
- [x] Plan Phase 11: Lead Management & Contact Tracking
- [x] Execute Phase 11 Plan 01: Schema & backend for lead management
- [x] Execute Phase 11 Plan 02: Lead assignment with duplicate detection
- [x] Execute Phase 11 Plan 03: Priority indicators & parlamentar repositioning
- [x] Execute Phase 11 Plan 04: Contact notes timeline & visualizador role
- [x] Execute Phase 11 Plan 05: Contact edit UI gap closure
- [ ] Plan Phase 12: Pipeline Kanban
- [x] Plan Phase 13: Comissões
- [x] Execute Phase 13 Plan 01: Commission configuration backend

### Known Blockers

**None currently.**

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Leads clicáveis com card de info rápida e UI premium | 2026-02-11 | 1edb2b1 | [2-leads-clic-veis-com-card-de-info-r-pida-](./quick/2-leads-clic-veis-com-card-de-info-r-pida-/) |
| 3 | Schema expansion + Siconv base bruta import + Upload UI | 2026-02-11 | 33fd78c | [3-schema-upload-base-bruta-import](./quick/3-schema-upload-base-bruta-import/) |
| 4 | Distribuicao de leads + CRM vendedor (telefone/email inline) | 2026-02-11 | 489c1a4 | [4-distribuicao-leads-crm-vendedor](./quick/4-distribuicao-leads-crm-vendedor/) |
| 5 | Monitoramento financeiro de convênios em execução | 2026-02-11 | a040061 | [5-monitoramento-financeiro](./quick/5-monitoramento-financeiro/) |
| 6 | Dashboard CRM gestor (pipeline, vendedor cards, activity feed) | 2026-02-11 | 7cbcc44 | [6-dashboard-crm-gestor](./quick/6-dashboard-crm-gestor/) |
| 7 | Commission system, default status Não Contatado, parlamentar column reorder | 2026-02-12 | 3ae5f1c | [4-commission-system-default-status-n-o-con](./quick/4-commission-system-default-status-n-o-con/) |
| 8 | Upload existing clients (CLIENTES.xlsx) with validation and clear instructions | 2026-02-12 | 29539cc | [8-create-endpoint-and-ui-to-upload-existin](./quick/8-create-endpoint-and-ui-to-upload-existin/) |
| 9 | Fix critical CRM bugs and UX improvements | 2026-02-13 | 32e9187 | [5-fix-critical-crm-bugs-and-ux-improvement](./quick/5-fix-critical-crm-bugs-and-ux-improvement/) |

## Session Continuity

### Last Session Summary
**Date:** 2026-02-14
**Milestone:** v3.0 CRM de Vendas
**Activity:** Completed Phase 13 Plan 01: Commission configuration backend

**Completed:**
- Created commission_config and commission_overrides database tables
- Seeded default commission config: SDR 9%+R$50, Closer 12%+R$0
- Built /api/commission-config CRUD endpoint (gestor-only)
- GET returns active configs and recent overrides
- POST updates default rates and recalculates non-locked leads
- PUT creates per-lead overrides with audit trail (motivo + approved_by)
- Updated lead PATCH to lock commission when status becomes Fechado
- Ensure vendedor_id is set when marking Fechado (COM-01 requirement)
- All commission math happens in PostgreSQL using NUMERIC precision
- Commission unlocks when status changes away from Fechado

**Phase 13 Plan 01 Complete:**
- Commission configuration is now database-driven (not hardcoded)
- Gestor can change rates without code deployment
- Closed deals (Fechado) protected from retroactive rate changes
- Per-lead overrides with documented reasons and approval tracking

**Next Actions:**
- Execute Phase 13 Plan 02 - Commission tracking and reporting UI
- Plan Phase 12 - Pipeline Kanban board

---
*State initialized: 2026-02-11 for milestone v3.0*
