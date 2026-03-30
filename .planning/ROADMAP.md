# Roadmap: PROJETUS Transfer Gov Automation

## Overview

PROJETUS delivers 100% reliable automated extraction of Transfer Gov data through focused milestone delivery. Four milestones shipped: v1.0 (ETL pipeline), v2.0 (Streamlit dashboard, superseded), v3.0 (CRM de Vendas), v4.0 (Projetos em Execucao). v4.1 adds lead distribution equalization, a new TGov analytics dashboard, memory optimization, and Projete brand identity.

## Milestones

- ✅ **v1.0 Crawler & ETL Pipeline** — Phases 1-5 (shipped 2026-02-08)
- ✅ **v2.0 Dashboard Premium Redesign** — Phases 6-9 (superseded by Next.js)
- ✅ **v3.0 CRM de Vendas** — Phases 10-13 (shipped 2026-02-14)
- ✅ **v4.0 Projetos em Execucao** — Phases 14-17 (shipped 2026-03-30)
- 🚧 **v4.1 Distribuicao, Design & Performance** — Phases 18-21 (in progress)

## Phases

<details>
<summary>✅ v1.0 Crawler & ETL Pipeline (Phases 1-5) — SHIPPED 2026-02-08</summary>

- [x] Phase 1: Foundation (5/5 plans) — completed 2026-02-05
- [x] Phase 2: Operational Maturity (4/4 plans) — completed 2026-02-05
- [x] Phase 4: Client Qualification (3/3 plans) — completed 2026-02-08
- [x] Phase 5: Data Dashboard (4/4 plans) — completed 2026-02-08
- [ ] Phase 3: Production Excellence — optional, triggered by need

</details>

<details>
<summary>✅ v2.0 Dashboard Premium Redesign (Phases 6-9) — SUPERSEDED</summary>

- [x] Phase 6: Visual Foundation & Component System (2/2 plans) — completed 2026-02-09
- [x] Phase 7: Data Visualization & Charts (3/3 plans) — completed 2026-02-10
- [x] Phase 8: Lead Profile & Enhanced Navigation (5/5 plans) — completed 2026-02-10
- [ ] Phase 9: Polish & Production Readiness — superseded by Next.js migration

</details>

<details>
<summary>✅ v3.0 CRM de Vendas (Phases 10-13) — SHIPPED 2026-02-14</summary>

- [x] Phase 10: Auth & CRM Foundation (3/3 plans) — completed 2026-02-12
- [x] Phase 11: Lead Management & Contact Tracking (5/5 plans) — completed 2026-02-12
- [ ] Phase 12: Pipeline Kanban — not started
- [x] Phase 13: Comissoes (2/2 plans) — completed 2026-02-14

</details>

<details>
<summary>✅ v4.0 Projetos em Execucao (Phases 14-17) — SHIPPED 2026-03-30</summary>

- [x] Phase 14: Data Audit & Foundation (2/2 plans) — completed 2026-03-18
- [x] Phase 15: ETL Sync & Validation (2/2 plans) — completed 2026-03-18
- [x] Phase 16: API & Business Logic (2/2 plans) — completed 2026-03-18
- [x] Phase 17: UI & Navigation (2/2 plans) — completed 2026-03-18

**Quick tasks (8):** execution tags, BrasilAPI enrichment, CRM status column, Rendimento tag rules, dashboard pipeline split, BI redesign with Aprovacao/Execucao tabs

Full details: [milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md)

</details>

### 🚧 v4.1 Distribuicao, Design & Performance (In Progress)

**Milestone Goal:** Equalize lead distribution in the execution pipeline, add a TGov analytics dashboard for gestores, optimize proposta sync memory usage, and apply the Projete brand identity.

- [x] **Phase 18: Lead Distribution** — Equalization engine with advisory lock, client-tag routing, and manual trigger UI (completed 2026-03-30)
- [ ] **Phase 19: TGov Dashboard** — New /tgov page with approval/execution analytics, donut charts, KPI cards, and filters
- [ ] **Phase 20: Performance Optimization** — Instrument heap usage per sync step and reduce proposta sync memory peak
- [ ] **Phase 21: Design Refresh** — Full Projete brand identity (colors, fonts, logo, favicon, design tokens) *(blocked on client brand guide delivery)*

## Phase Details

### Phase 18: Lead Distribution
**Goal**: Leads in the execution pipeline are automatically and fairly distributed to vendedores, with race-condition protection and a manual trigger for gestores
**Depends on**: Nothing (independent)
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Leads tagged "cliente" are assigned to the coordenador (Paulo) automatically and never appear in the distribution queue
  2. A new lead in execucao without a vendedor from the approval pipeline is assigned to the vendedor with the fewest total leads in execucao
  3. Concurrent cron auto-distribution and manual trigger cannot assign the same lead to two different vendedores
  4. A gestor can press "Distribuir Automaticamente" in the /distribuir page and see a per-vendedor before/after count in the result modal
**Plans:** 2/2 plans complete
Plans:
- [x] 18-01-PLAN.md — Advisory lock + client-routing in distribute-execucao.ts + API route update
- [x] 18-02-PLAN.md — Execution distribution button + result modal on /distribuir page

### Phase 19: TGov Dashboard
**Goal**: Gestores have a dedicated /tgov analytics page replicating the key Power BI views for approval and execution pipeline intelligence
**Depends on**: Nothing (independent)
**Requirements**: TGOV-01, TGOV-02, TGOV-03, TGOV-04, TGOV-05
**Success Criteria** (what must be TRUE):
  1. /tgov is accessible via the sidebar for gestor role and returns 403 for all other roles
  2. The Aprovacao tab shows a donut chart of situacao distribution, a total KPI card, and a paginated detail table (ID Proposta, Data, CNPJ, Proponente, Situacao)
  3. The Execucao tab shows the same structure (donut + KPI + table) using execution project data
  4. Ano, Tipo (Meus Proponentes / Outros), Status, and UF do Proponente filters correctly narrow both tabs
  5. The detail table can be filtered inline by Proponente name and Numero Proposta
**Plans**: TBD

### Phase 20: Performance Optimization
**Goal**: The proposta sync cron function has a measured heap baseline and a streaming fix that reduces peak memory well below the Vercel Pro 2 GB default
**Depends on**: Nothing (independent; instrument first, fix second within the phase)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. After the first instrumented cron run, each step in syncLeadsFromRepo logs its heap usage so the peak allocation source is precisely identified
  2. After the streaming fix is deployed, the peak heap during proposta sync is measurably lower than the pre-fix baseline as seen in cron logs
  3. The end-to-end cron duration does not regress by more than 30 seconds compared to the pre-fix baseline
**Plans**: TBD

### Phase 21: Design Refresh
**Goal**: The application reflects the full Projete brand identity — colors, typography, logo, favicon, and a consistent token system — with zero remaining arbitrary hex color classes
**Depends on**: Phase 18 complete (logical ordering); **BLOCKED on client delivering Projete brand guide** (external dependency — no brand work beyond CSS custom property scaffolding can begin until the guide is received)
**Requirements**: DESIGN-01, DESIGN-02, DESIGN-03, DESIGN-04
**Success Criteria** (what must be TRUE):
  1. The app palette matches the Projete brand guide — all 229 arbitrary bg-[#...] / text-[#...] / border-[#...] classes are eliminated and grep returns 0 matches
  2. The logo and favicon display the Projete assets on every page and browser tab
  3. Body and heading text renders using the Projete typefaces loaded via next/font/google (no CDN import, no layout shift)
  4. All brand colors are defined as CSS custom properties in globals.css :root and mapped through tailwind.config.ts — a future color change is a one-line edit in one file
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 5/5 | Complete | 2026-02-05 |
| 2. Operational Maturity | v1.0 | 4/4 | Complete | 2026-02-05 |
| 3. Production Excellence | v1.0 | 0/TBD | Optional | - |
| 4. Client Qualification | v1.0 | 3/3 | Complete | 2026-02-08 |
| 5. Data Dashboard | v1.0 | 4/4 | Complete | 2026-02-08 |
| 6. Visual Foundation | v2.0 | 2/2 | Complete | 2026-02-09 |
| 7. Data Visualization | v2.0 | 3/3 | Complete | 2026-02-10 |
| 8. Lead Profile & Nav | v2.0 | 5/5 | Complete | 2026-02-10 |
| 9. Polish | v2.0 | - | Superseded | - |
| 10. Auth & CRM | v3.0 | 3/3 | Complete | 2026-02-12 |
| 11. Lead Management | v3.0 | 5/5 | Complete | 2026-02-12 |
| 12. Pipeline Kanban | v3.0 | 0/TBD | Not started | - |
| 13. Comissoes | v3.0 | 2/2 | Complete | 2026-02-14 |
| 14. Data Audit | v4.0 | 2/2 | Complete | 2026-03-18 |
| 15. ETL Sync | v4.0 | 2/2 | Complete | 2026-03-18 |
| 16. API & Logic | v4.0 | 2/2 | Complete | 2026-03-18 |
| 17. UI & Navigation | v4.0 | 2/2 | Complete | 2026-03-18 |
| 18. Lead Distribution | 1/2 | 2/2 | Complete    | 2026-03-30 |
| 19. TGov Dashboard | v4.1 | 0/TBD | Not started | - |
| 20. Performance Optimization | v4.1 | 0/TBD | Not started | - |
| 21. Design Refresh | v4.1 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-04*
*Last phase number: 21*
*v4.0 archived: 2026-03-30*
*v4.1 roadmap added: 2026-03-30*
