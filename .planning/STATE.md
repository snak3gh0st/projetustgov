# Project State: PROJETUS CRM de Vendas

## Project Reference

**Core Value:** CRM funcional para vendedores qualificarem e contactarem leads do TransferênciaGov.

**Current Milestone:** v3.0 CRM de Vendas

**Milestone Goal:** Transformar dashboard de leads em CRM com auth, pipeline kanban, tracking de contato, e comissões.

**Current Focus:** Phase 10 - Auth & CRM Foundation (Plan 01 complete)

## Current Position

**Phase:** 10 of 13 (Milestone v3.0)
**Plan:** 02 of 03 (Phase 10)
**Status:** Executing Phase 10
**Progress:** [████████░░] 78%

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
- [ ] Execute Phase 10 Plan 02: Login UI and middleware
- [ ] Execute Phase 10 Plan 03: Vendedor management UI
- [ ] Plan Phase 11: Lead Management & Contact Tracking
- [ ] Plan Phase 12: Pipeline Kanban
- [ ] Plan Phase 13: Comissões

### Known Blockers

**None currently.**

## Session Continuity

### Last Session Summary
**Date:** 2026-02-11
**Milestone:** v3.0 CRM de Vendas
**Activity:** Executed Phase 10 Plan 01 — Auth & CRM Foundation

**Completed:**
- Installed Auth.js v5 dependencies (next-auth@beta, bcrypt, jose, zod)
- Created CRM database schema: users, lead_assignments, contact_notes, commissions
- Configured Auth.js with credentials provider and JWT sessions
- Implemented server actions: login, createVendedor (gestor-only), logout
- Created Zod validation schemas and TypeScript type augmentation
- Fixed TypeScript compilation errors (bcrypt imports, role type assertions)
- Migration endpoint ready at POST /api/migrate with seed capability

**Next Actions:**
- Execute Phase 10 Plan 02 — Build login UI and protect routes with middleware
- Deploy to Vercel and run POST /api/migrate to create CRM tables

---
*State initialized: 2026-02-11 for milestone v3.0*
