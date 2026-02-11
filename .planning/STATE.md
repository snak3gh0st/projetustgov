# Project State: PROJETUS CRM de Vendas

## Project Reference

**Core Value:** CRM funcional para vendedores qualificarem e contactarem leads do TransferênciaGov.

**Current Milestone:** v3.0 CRM de Vendas

**Milestone Goal:** Transformar dashboard de leads em CRM com auth, pipeline kanban, tracking de contato, e comissões.

**Current Focus:** Phase 10 - Auth & CRM Foundation (Plan 01 complete)

## Current Position

**Phase:** 10 of 13 (Milestone v3.0)
**Plan:** 03 of 03 (Phase 10)
**Status:** Executing Phase 10
**Progress:** [█████████░] 80%

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

### Technical Context (Next.js Stack)

- **Framework:** Next.js 14 App Router, deployed on Vercel
- **Database:** PostgreSQL on Railway (shortline.proxy.rlwy.net:30852)
- **Frontend:** React 18, Tailwind CSS (Sigma brand theme), Recharts
- **Auth:** Auth.js v5 (next-auth@beta) with credentials provider and JWT sessions
- **Working directory:** `web/` (deploy from here, NOT root)
- **Existing pages:** Pipeline (/), Leads (/leads), Lead Profile (/lead/[cnpj])
- **Existing API routes:** /api/dashboard, /api/leads, /api/leads/[cnpj]/*, /api/chart/*, /api/filters/*

### Active TODOs

- [x] Plan Phase 10: Auth & CRM Foundation
- [x] Execute Phase 10 Plan 01: Install dependencies, create CRM tables, configure Auth.js
- [x] Execute Phase 10 Plan 02: Login UI and middleware
- [ ] Execute Phase 10 Plan 03: Vendedor management UI
- [ ] Plan Phase 11: Lead Management & Contact Tracking
- [ ] Plan Phase 12: Pipeline Kanban
- [ ] Plan Phase 13: Comissões

### Known Blockers

**None currently.**

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Leads clicáveis com card de info rápida e UI premium | 2026-02-11 | 1edb2b1 | [2-leads-clic-veis-com-card-de-info-r-pida-](./quick/2-leads-clic-veis-com-card-de-info-r-pida-/) |
| 3 | Schema expansion + Siconv base bruta import + Upload UI | 2026-02-11 | 33fd78c | [3-schema-upload-base-bruta-import](./quick/3-schema-upload-base-bruta-import/) |

## Session Continuity

### Last Session Summary
**Date:** 2026-02-11
**Milestone:** v3.0 CRM de Vendas
**Activity:** Completed quick task 3: Schema expansion + base bruta import

**Completed:**
- Expanded vendedor_projetos schema with NUMERIC financial columns (valor_global, valor_emenda, etc.)
- Added program metadata fields (codigo_programa, nome_programa, qualificacao, parlamentar)
- Rewrote import endpoint with Siconv vs CRM format auto-detection
- Duplicate CNPJ detection (skip and report, not overwrite)
- Created gestor-only upload page with drag-and-drop and results card
- Updated all 13 files (dashboard, leads, slide-over, detail pages) for new schema
- New status values: Novo, Contactado, Proposta, Retorno

**Next Actions:**
- Run POST /api/setup-crm to recreate vendedor_projetos with expanded schema
- Upload Siconv base bruta .xlsx via /upload page
- Execute Phase 10 Plan 03 -- Build vendedor management UI for gestor
- Deploy to Vercel

---
*State initialized: 2026-02-11 for milestone v3.0*
