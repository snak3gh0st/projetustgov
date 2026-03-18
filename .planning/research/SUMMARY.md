# Project Research Summary

**Project:** Projetos em Execução — Post-Sale Intelligence Tab (v4.0)
**Domain:** CRM extension — government grant execution monitoring for Brazilian OSC clients
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

This is a milestone feature addition to an existing, production Next.js 14 + PostgreSQL (Supabase) CRM. The Projetos em Execução tab is a read-only intelligence view for gestores and coordenadores that surfaces post-sale portfolio health by cross-referencing two new government CSV sources (`siconv_convenio.csv.zip` and `siconv_proposta.csv.zip`) from `repositorio.dados.gov.br`. The feature aggregates active grant convênios by proponent CNPJ, computes financial execution metrics, and links them to existing CRM contacts. The stack requires zero new dependencies — every capability (streaming ZIP+CSV parsing, CNPJ normalization, cron ETL, role guards, DB upsert patterns) already exists and is proven in production.

The recommended approach is a purpose-built `projetos_execucao` table populated by a dedicated sync function (`execucao-sync.ts`) on a separate cron schedule from the existing lead sync. The UI follows established patterns from `/leads` and `/monitoramento`: server-component role guard, `useEffect`/`fetch` data loading, CNPJ-grouped rows with expandable detail, reused `KPICard` components, and the same alert badge pattern already in place. The entire feature is read-only — no workflow, no status mutations, no new role types.

The primary risks are all data-integrity risks that can be neutralized before any code is written: NULL `proposta_id` values in `convenios` causing silent join drops, CNPJ zero-padding inconsistencies between the old Python ETL tables and the CRM, and FLOAT-based financial columns producing rounding artifacts. All three must be audited and resolved in Phase 1 before the API or UI are built. The financial scale risk (187MB proposta CSV) is handled by the existing streaming parser with an early-return filter — no new tooling required.

---

## Key Findings

### Recommended Stack

The existing stack handles all requirements. Zero new dependencies are needed. Live codebase inspection confirmed that `repo-sync.ts` already implements the exact streaming ZIP+CSV parsing pattern needed for both new source files, `dal.ts` provides all required role guard helpers, and `db.ts` provides the shared pg.Pool. The only new artifacts are one new database table, one new lib file (`execucao-sync.ts`), one new dedicated cron route, one new API route, one new page, and one new slide-over component.

**Core technologies:**
- Next.js 14 App Router — pages and API routes — no change, existing pattern
- PostgreSQL via `pg` ^8.13.0 — one new `projetos_execucao` table using `NUMERIC(18,2)` for financial columns (correct; existing tables use FLOAT incorrectly)
- Tailwind CSS ^3.4.0 — reuse existing alert badge classes and progress bar patterns
- Auth.js v5 ^5.0.0-beta.30 — role guard via `verifySession()` + `getApiSession()` from `dal.ts`; no new middleware
- Recharts ^2.12.0 — available for % execução visualization; already installed

**Critical data sources (verified 2026-03-18):**
- `siconv_convenio.csv.zip` — 15MB, daily update at `repositorio.dados.gov.br/seges/detru/` — financial state and situacao per convênio
- `siconv_proposta.csv.zip` — 187MB, daily update — proponent CNPJ, nome, objeto, vigência dates
- Join key: `id_proposta` (convenio side) → `ID_PROPOSTA` (proposta side) to derive proponent CNPJ per convênio

### Expected Features

**Must have (table stakes — P1):**
- Filtered list of active OSC projects (situacao contains "execu" AND modalidade contains "osc")
- CNPJ-level aggregation showing count of active fomentos per organization as the primary "big number"
- Financial columns per CNPJ: total desembolso, saldo em conta, % execução, data fim vigência, dias restantes
- Desembolso alert highlight logic — client must confirm exact business rule before implementation
- Header KPI cards: clientes qualificados (distinct CNPJs), total fomentos, valor total em execução
- Contact indicator badge (CNPJ present in `lead_contacts` or `vendedor_projetos`)
- Access restricted to gestor + coordenador roles (server-component redirect + API 401)
- Sidebar navigation entry visible only to gestor role

**Should have (differentiators — P2):**
- % execução visual progress bar (reuse `/monitoramento` pattern)
- Expand/collapse per-CNPJ to show individual convênios
- Sort controls (by saldo, % exec, vigência)
- UF/estado filter
- Text search by org name or CNPJ
- Data freshness indicator showing last sync timestamp from `cron_sync_log`

**Defer to v2+:**
- Historical disbursement trend chart (desembolsos table sparsely populated — insufficient data)
- Vigência expiration push notifications (requires cron wiring beyond scope)
- Post-sale assignment workflow (entirely separate feature; new data model + roles)
- Export to CSV

### Architecture Approach

The architecture follows the established CRM pattern precisely: a new top-level route (`/execucao`), a new API route (`/api/execucao`), a new dedicated cron route (`/api/cron/sync-execucao`), a new lib ETL file (`execucao-sync.ts`), and a new isolated database table. The ETL streams `siconv_proposta.csv.zip` with an OSC-only filter to build an in-memory Map keyed by `id_proposta`, then streams `siconv_convenio.csv.zip` with an "em execução" filter and joins to the Map, then upserts into `projetos_execucao`. The cron runs on a separate schedule to avoid competing for the pg.Pool's 5 connections. Contact data is surfaced via SQL LEFT JOIN on CNPJ to `lead_contacts` (with `vendedor_projetos` as fallback) — the same pattern used in `/api/leads`.

**Major components:**
1. `projetos_execucao` (DB table) — isolated from CRM tables; UNIQUE constraint on `nr_convenio`; all financial fields in `NUMERIC(18,2)`
2. `execucao-sync.ts` — ETL: stream-filter proposta (OSC only), stream-filter convenio ("em execução" only), in-memory join, upsert; entirely separate from `repo-sync.ts`
3. `/api/cron/sync-execucao/route.ts` — dedicated cron with `maxDuration = 300` and its own `vercel.json` entry offset from the lead sync
4. `/api/execucao/route.ts` — role-guarded GET; GROUP BY CNPJ query with LEFT JOINs for contact data and configurable filter parameters
5. `/execucao/page.tsx` + `ExecucaoSlideOver.tsx` — client page with CNPJ grouping (`useMemo` same as `/leads`), alert highlighting, slide-over financial detail

**Confirmed build order:**
DB migration → `execucao-sync.ts` (validated with one-off test script) → `/api/execucao/route.ts` → cron endpoint wired and tested → `/execucao/page.tsx` + slide-over → Sidebar update.

### Critical Pitfalls

1. **Sync contamination via imprecise UPSERT key** — Use `ON CONFLICT (nr_convenio) DO UPDATE`; never `ON CONFLICT (cnpj)` alone (causes duplicates). Document which fields the sync must never overwrite. Never truncate `projetos_execucao`. This mirrors the STEP 7c production bug (commit `9e20d04`) caused by a missing grouping scope.

2. **Cross-source join silently drops projects (NULL proposta_id)** — Run `SELECT COUNT(*) FROM convenios WHERE proposta_id IS NULL AND situacao ILIKE '%execu%'` before writing any API code. If count > 0, use LEFT JOIN with a logged `join_miss_count` in sync stats. An INNER JOIN silently loses legitimate projects with no error signal.

3. **FLOAT financial columns causing precision errors** — Old ETL tables (`convenios`, `propostas`) use `FLOAT`. Cast all financial fields to `NUMERIC(15,2)` at the query layer: `CAST(c.valor_desembolsado AS NUMERIC(15,2))`. New `projetos_execucao` stores everything as `NUMERIC(18,2)`. Never compute percentages in JavaScript.

4. **CNPJ zero-padding mismatch between old ETL tables and the CRM** — Run `SELECT COUNT(*) FROM proponentes WHERE LENGTH(cnpj) < 14` before building any cross-table join. If > 0, apply `UPDATE ... SET cnpj = LPAD(cnpj, 14, '0')`. All join conditions must normalize via `LPAD(REGEXP_REPLACE(cnpj, '\D', '', 'g'), 14, '0')` on both sides.

5. **Cron timeout cascade from appending execution sync to the existing lead sync** — The existing lead sync consumes up to ~250s of the 300s Vercel Pro budget. Adding execution sync to the same handler causes 504 failures that corrupt both syncs. Mandatory: a dedicated `/api/cron/sync-execucao` endpoint with its own `vercel.json` entry at an offset time.

6. **Role gate omitted on the new API route** — NextAuth middleware only verifies session existence, not role. Both the server component (`verifySession()` + redirect) and the API route (`getApiSession()` + 401) must independently enforce the gestor/coordenador restriction. A vendedor can call the API directly regardless of UI redirection.

7. **Alert business rule implemented as a guess** — Government `valor_desembolsado` is always positive. "Desembolso negativo" is a business signal, not a mathematical negative number. Confirm the exact condition with the client by inspecting known-problematic convênios in the DB before writing alert logic.

---

## Implications for Roadmap

Based on combined research, 4 phases are recommended. The ordering is driven by data-integrity dependencies: audits must complete before any query code is written; the ETL must be validated before the UI consumes it; the UI is the last artifact to build.

### Phase 1: Data Audit and Foundation

**Rationale:** Three of the eight critical pitfalls are data-quality issues that must be resolved before a single line of API code is written. Building the join first and discovering NULL `proposta_id` or CNPJ mismatches in production means some execution records will silently be missing — a defect that is hard to scope after the fact. This phase produces zero UI but eliminates the highest-risk unknowns.

**Delivers:** DB migration (`projetos_execucao` table + indexes), CNPJ normalization audit with one-time fix migration if needed, NULL `proposta_id` count documented with gap-handling strategy confirmed in writing, UPSERT key and never-overwrite field list documented before any sync code is written.

**Addresses:** Pitfall 1 (sync contamination), Pitfall 2 (join gaps), Pitfall 5 (CNPJ normalization)

**Avoids:** Silent data loss discovered only when gestores report missing clients in production

**Research flag:** Standard patterns — SQL diagnostic queries and LPAD migrations are straightforward; no additional research needed.

### Phase 2: ETL Sync and Data Validation

**Rationale:** The entire intelligence view rests on ETL data quality. The 187MB proposta CSV is the largest file this system has ever processed. Validating the streaming filter-and-join algorithm against real data before building the UI eliminates the risk of an architecture pivot after the UI is complete.

**Delivers:** `execucao-sync.ts` with streaming OSC filter on proposta, "em execução" filter on convenio, in-memory id_proposta join, upsert with `ON CONFLICT (nr_convenio)`; a one-off test script that populates `projetos_execucao` against the live DB; sync stats including `join_miss_count`; validated row counts matching the expected "em execução + OSC" universe.

**Uses:** `downloadAndStreamCSV`, `cleanCNPJ`, `parseBRNumber`, `fixText` from `repo-sync.ts`; `getPool()` from `db.ts`

**Avoids:** Pitfall 1 (UPSERT discipline), Pitfall 6 (separate cron endpoint planned and created here), Pitfall 8 (enrichment queue uses `ON CONFLICT DO NOTHING` — no duplicate BrasilAPI calls)

**Research flag:** Approach fully specified in STACK.md and ARCHITECTURE.md. If OSC-filtered Map exceeds Vercel memory limits, the documented fallback is a two-pass approach (Set of needed IDs → second stream pass). No additional research needed.

### Phase 3: API Route and Business Logic

**Rationale:** With validated data in `projetos_execucao`, the API can be built against real rows. The alert business rule (Pitfall 7) must be confirmed with the client at the start of this phase before the query is written. CAST-to-NUMERIC for financial precision (Pitfall 3) is established here as a code-review requirement for all queries.

**Delivers:** `/api/execucao/route.ts` with role guard, GROUP BY CNPJ query with all financial columns cast to `NUMERIC(15,2)`, LEFT JOIN `lead_contacts`/`vendedor_projetos` for contact data, filter parameters (search, uf, alert_only), client-confirmed alert logic with named constants and mutually exclusive alert states, cron endpoint wired and verified within 300s budget.

**Implements:** Pattern 3 (gestor-only route guard), Pattern 4 (CNPJ as cross-table integration key), dedicated cron entry in `vercel.json`

**Avoids:** Pitfall 3 (financial precision via CAST), Pitfall 4 (role gate on both page and API), Pitfall 7 (alert logic confirmed with client before implementation)

**Research flag:** Alert business rule requires client clarification — this is a domain question, not a research question. All other patterns are established.

### Phase 4: UI and Navigation

**Rationale:** Build the UI last — after the data layer is validated — to avoid UX iterations on a broken foundation. All UI patterns have direct analogs in existing pages. Risk here is low and execution is straightforward.

**Delivers:** `/execucao/page.tsx` (server component with role guard + client component with `useEffect`/`fetch`), CNPJ-grouped list with expandable per-convênio rows, alert badge highlighting for problematic projects, header KPI cards (clientes qualificados, total fomentos, valor total em execução), `ExecucaoSlideOver.tsx` with full financial detail per CNPJ, % execução progress bar, data freshness timestamp from `cron_sync_log`, Sidebar.tsx update with gestor-only `/execucao` nav entry.

**Reuses:** `KPICard` component, priority badge pattern from `/monitoramento`, CNPJ grouping `useMemo` from `/leads`, progress bar from `/monitoramento`, slide-over pattern from `/leads`, debounced filter pattern from `/monitoramento`

**Avoids UX pitfalls:** Show `dias_em_execucao` alongside % execução to avoid misleading "0% = stalled" signal for new projects; mutually exclusive alert/verificar-saldo states with defined priority; freshness indicator visible in tab header; redirect vendedores to a "sem permissão" page (not `/login`)

**Research flag:** All patterns are direct copies of existing pages. Skip research-phase.

### Phase Ordering Rationale

- Data audit before ETL: CNPJ normalization and NULL `proposta_id` are one-way doors — building the join before auditing bakes the bug into the architecture, not just the query.
- ETL before API: The API needs real rows to validate correctness of GROUP BY logic and contact joins. An empty table hides correctness issues.
- API before UI: The UI is a consumer of the API contract. Changing the API shape after the UI is built requires two coordinated changes.
- Separate cron endpoint decided in Phase 2, wired in Phase 3: The existing lead sync's ~250s runtime leaves no safe budget for an appended execution sync.

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (Data Audit):** PostgreSQL diagnostic queries and LPAD migrations are well-understood. No ambiguity.
- **Phase 2 (ETL):** Algorithm fully specified. Fallback (two-pass approach for memory) is documented. No research gap.
- **Phase 4 (UI):** All component patterns are direct copies of `/leads` and `/monitoramento`. No novel patterns.

Phases needing targeted clarification (not research, but client input):
- **Phase 3 (Alert Logic):** The desembolso alert business rule requires client confirmation before implementation. This is one meeting/query, not a research task.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase inspection of all relevant files on 2026-03-18; zero new dependencies; existing patterns verified as directly applicable |
| Features | HIGH | Schema.sql analysis confirmed all required columns exist in `convenios` and `propostas`; client spec (PROJECT.md v4.0) provides explicit KPI and aggregation requirements |
| Architecture | HIGH | All patterns drawn from direct inspection of `repo-sync.ts`, `dal.ts`, `db.ts`, `leads/page.tsx`, `monitoramento/page.tsx`, `vercel.json`; build order confirmed by dependency analysis |
| Pitfalls | HIGH | Primary evidence from documented production incidents (commits `9e20d04`, `f81fe04`, `63328eb`) and direct schema inspection confirming FLOAT columns, NULL constraints, and missing indexes |

**Overall confidence:** HIGH

### Gaps to Address

- **Desembolso alert business rule:** The client has not confirmed what "desembolso negativo" means as a database condition. Before Phase 3 begins, the client must identify at least 3 convênios that should show the alert and 3 that are healthy. The developer then inspects those records to derive the exact condition. Do not ship alert logic as a guess.
- **NULL proposta_id scope:** The diagnostic query has not been run yet. The count could be 0 (no problem) or significant (requires a LEFT JOIN fallback path). Run in Phase 1 before any architecture decisions for the ETL are locked.
- **Proposta CSV OSC subset size in memory:** It is estimated that OSC propostas are a small fraction of the 187MB file, but this has not been measured. Instrument memory usage in the Phase 2 test script. If the OSC Map exceeds Vercel's 1GB serverless limit, switch to the documented two-pass approach.
- **Total cron duration with both syncs active:** The execution sync is projected at 30-60s additional runtime. Since it runs on a separate endpoint, the 300s budget is not shared, but DB connection pool saturation during overlapping windows has not been measured. Monitor on the first combined run.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection, 2026-03-18)

- `web/src/lib/repo-sync.ts` — ETL pattern, streaming ZIP+CSV, `downloadAndStreamCSV`, `_parseZipBuffer`, `parseBRNumber`, `cleanCNPJ`, `fixText`, UPSERT discipline, enrichment queue (`ON CONFLICT DO NOTHING`)
- `web/src/lib/dal.ts` — `getApiSession()`, `verifySession()`, `isAdmin()`, role guard patterns
- `web/src/lib/db.ts` — `pg.Pool` singleton, `max: 5`, `statement_timeout: 30000`, `query()` helper
- `web/schema.sql` — `convenios`, `propostas`, `proponentes` table structure; FLOAT vs NUMERIC mismatch; NULL constraints; existing indexes
- `web/src/app/api/leads/route.ts` — GROUP BY aggregation, `lead_contacts` correlated subquery pattern
- `web/src/app/api/leads/[cnpj]/instruments/route.ts` — existing INNER JOIN on `proposta_id` (the silent-drop risk pattern)
- `web/src/app/api/cron/sync-leads/route.ts` — cron auth, `maxDuration = 300`, manual trigger, sequential structure
- `web/src/app/leads/page.tsx` — CNPJ grouping `useMemo`, slide-over invocation, alert border styling
- `web/src/app/monitoramento/page.tsx` — priority badge pattern (`PRIORITY_COLORS`), progress bar, debounced filter
- `web/src/components/Sidebar.tsx` — gestor nav block (lines 53-59), role-conditional nav items
- `web/vercel.json` — cron schedule (12:30 UTC + 18:00 UTC), `maxDuration: 300`
- `web/package.json` — confirmed installed packages and exact versions

### Primary (HIGH confidence — external sources, verified 2026-03-18)

- `https://repositorio.dados.gov.br/seges/detru/` — `siconv_convenio.csv.zip` (15MB, 2026-03-18 08:56) and `siconv_proposta.csv.zip` (187MB, 2026-03-18 08:58) confirmed present and daily-updated

### Primary (HIGH confidence — production incidents)

- `.planning/debug/contacted-status-regression.md` — STEP 7c vendedor_id filter bug (commit `9e20d04`); canonical example of sync contamination via missing grouping scope in UPSERT
- `.planning/debug/commission-sales-flow.md` — FLOAT precision issues in financial calculations
- `.planning/debug/duplicate-lead-cnpj.md` — CNPJ deduplication failure from a weak UPSERT conflict key

### Secondary (MEDIUM confidence)

- `.planning/PROJECT.md` v4.0 section — client milestone spec: data flow, KPI requirements, column references, alert logic intent (alert business rule not yet confirmed as exact DB conditions)
- `web/src/components/KPICard.tsx` — confirmed reusable component for header KPI cards

---

*Research completed: 2026-03-18*
*Ready for roadmap: yes*
