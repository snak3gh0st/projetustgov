# Project Research Summary

**Project:** PROJETUS v6.0 — CSM & Customer Success
**Domain:** CRM SaaS — Customer Success Management, AI-assisted tagging, UI/UX refresh
**Researched:** 2026-04-27
**Confidence:** MEDIUM

> **Note:** Of the 4 research files synthesized, ARCHITECTURE.md is dated 2026-04-27 and covers v6.0
> directly (HIGH confidence). STACK.md, FEATURES.md, and PITFALLS.md are dated 2026-03-30 and cover
> the v4.1 milestone (lead distribution, brand refresh, memory optimization) — a different feature set.
> The Stack, Features, and Pitfalls sections below draw primarily from the orchestrator's key-insight
> brief and ARCHITECTURE.md rather than from the stale research files. The roadmapper should be aware
> that a dedicated v6.0 stack/features/pitfalls research pass may be warranted before implementation.

---

## Executive Summary

PROJETUS v6.0 adds a Customer Success Management (CSM) layer on top of an existing Next.js 14 + PostgreSQL CRM. The CSM pipeline aggregates approval-stage (`propostas`) and execution-stage (`projetos_execucao`) Projetus clients into a 5-level priority view — without touching the existing vendedor-scoped execucao pipeline. The architecture decision is clear from codebase inspection: new routes under `/api/csm/*`, a new `canCsm()` auth gate in `dal.ts`, a new `csm_budget_cache` table for lazy budget-item caching, and a `LayoutShell` client wrapper to hold sidebar-collapse and dark-mode state. These changes are additive; no existing routes or tables are modified.

The most significant technical gap is that budget line items (Plano de Aplicacao Detalhado) are not in the database and are not downloaded by the current ETL. For v6.0, the recommended approach is lazy on-demand fetch from the TransfereGov API, cached in a `csm_budget_cache` JSONB table with a 7-day TTL. AI tags (mapping budget item descriptions to Projetus service categories) depend on this data being available; they are therefore a Phase 5 concern, not Phase 1. The TransfereGov API authentication requirements are a critical unknown that must be verified before Phase 4 begins.

The UI work (collapsible sidebar, dark mode, mobile drawer) is purely additive and well-understood. The highest-risk phase is AI tagging: combining an external API with uncertain auth, OpenAI embedding calls, and pgvector (or in-memory cosine similarity as a fallback) within Vercel's 30s maxDuration window. The build order must enforce RBAC before any CSM routes go live, and the budget ETL must be verified before AI tags are written.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 14 App Router, PostgreSQL on sigmadb, Tailwind v3, raw `pg` queries) requires only targeted additions for v6.0. No framework changes.

**Core technologies:**

- `next-themes`: dark mode toggle — integrates cleanly with Tailwind `darkMode: 'class'` config; eliminates manual `document.classList` management
- Cookie-based sidebar collapse state: server-readable on first render, prevents hydration mismatch from localStorage (the localStorage approach is viable but introduces a known FOUC risk on initial render — cookies are the safer alternative)
- `vaul`: mobile bottom-drawer for sidebar on small screens — purpose-built for React, composable with the existing Sidebar component
- `OpenAI text-embedding-3-small` + pgvector: AI tag inference via cosine similarity on budget item descriptions; keyword matching is the acceptable v6.0 fallback if pgvector is unavailable on sigmadb
- `csm_budget_cache` table (JSONB): lazy cache for TransfereGov budget items and computed sales tags, 7-day TTL

**Critical version note:** pgvector availability on the production sigmadb PostgreSQL instance must be verified before Phase 5. The sigmadb server is a dedicated Postgres instance (not Supabase) — the extension must be installed manually if not already present.

### Expected Features

**Must have (P1 — table stakes for CSM role):**

- CSM pipeline page (`/csm/pipeline`) with 5-level priority ranking across propostas + projetos_execucao — the core CSM workflow
- `canCsm()` RBAC gate in `dal.ts` + auth guard on all `/api/csm/*` routes — without this, CSM data is accessible to any authenticated session
- Budget items on-demand fetch (`/api/csm/budget-refresh`) with JSONB cache — CSM cannot assess proposal detail without line item data
- Collapsible sidebar + dark mode via `LayoutShell` — sidebar grows unwieldy for CSM role without collapse; must precede adding CSM nav items

**Should have (P2 — differentiators after P1 stable):**

- AI sales tags: OpenAI `text-embedding-3-small` embeddings matching budget descriptions to Projetus service categories, stored in `csm_budget_cache.sales_tags` — blocked by Phase 4 budget ETL
- Mobile layout: `vaul` drawer sidebar on small screens, auto-collapse on route change

**Defer to v6.1+:**

- Full ETL for `siconv_plano_aplicacao_detalhado.csv` (enables batch AI tagging across all proposals, not just ones the CSM has opened)
- Weighted lead distribution or CSM-side assignment features
- pgvector-backed similarity search at scale (in-memory cosine similarity is sufficient for <300 proposals)

### Architecture Approach

The CSM layer is purely additive to the existing codebase. A new `LayoutShell` client wrapper sits between the server `layout.tsx` and the Sidebar, owning collapse/dark-mode state. Three new API routes under `/api/csm/` handle the pipeline view, per-client detail, and lazy budget refresh. One new table (`csm_budget_cache`) stores cached budget items and computed AI tags. The existing `csm` role in `dal.ts` is already defined — it just lacks an auth gate and a dedicated UI.

**Major components:**

1. `LayoutShell.tsx` (new, client) — collapse + dark mode state; sits between server layout and Sidebar/main
2. `/api/csm/pipeline` (new) — UNION ALL query across `projetos_execucao` + `propostas`, CASE-computed priority_level 1–5, ordered by priority then saldo_conta
3. `/api/csm/budget-refresh` (new) — lazy TransfereGov fetch + OpenAI embedding inference + cache write
4. `csm_budget_cache` table (new) — proposta_id PK, items JSONB, sales_tags JSONB, fetched_at TIMESTAMPTZ, 7-day TTL
5. `dal.ts` + auth gates (modify) — add `canCsm()`, apply to all `/api/csm/*` routes

### Critical Pitfalls

1. **Hydration mismatch from localStorage sidebar state** — If collapse state is initialized from `localStorage` in a `useEffect`, the server renders expanded and the client flips on hydration, causing layout shift. Prevention: initialize `collapsed` from a cookie set server-side so `layout.tsx` can pass the correct initial value as a prop to `LayoutShell`.

2. **Dark mode FOUC + Radix portal scope** — Applying the `dark` class to `<html>` via `document.documentElement.classList` after mount causes a flash of unstyled content. Prevention: use `next-themes` which injects a blocking script before paint. Additionally, Radix UI portals (dropdowns, dialogs) render outside the component tree — confirm `ThemeProvider` wraps the root so portals inherit the `dark` class.

3. **CSM RBAC guard missing on `/api/csm/*` routes** — The `csm` role exists in `dal.ts` but has no dedicated auth gate. Any authenticated session can call the new CSM routes unless `canCsm()` is added and applied. Prevention: build `canCsm()` + apply it in the first commit of every CSM route. Never merge a `/api/csm/*` route without the auth gate.

4. **Real-time AI inference per request** — Calling OpenAI from `/api/csm/pipeline` on every load adds 500ms–3s latency and risks the Vercel 30s maxDuration. Prevention: pre-compute embeddings on budget fetch, store in `csm_budget_cache.sales_tags` JSONB; pipeline route reads only pre-computed tags.

5. **TransfereGov API auth unknown** — The `planoAplicacaoDetalhado` endpoint's authentication requirements have not been verified. If bearer auth is required, the fetch must be proxied through a server-side route. Prevention: manually test the endpoint before Phase 4 implementation begins. If auth blocks the API approach, escalate to full ETL (Option B) before writing any budget-refresh code.

---

## Implications for Roadmap

Based on ARCHITECTURE.md build order + feature dependencies, suggested 6-phase structure:

### Phase 1: CSM RBAC Foundation

**Rationale:** Auth gates must exist before any CSM data is accessible. Pure backend concern with no UI dependency. Unblocks all subsequent CSM route development.
**Delivers:** `canCsm()` in `dal.ts`; auth guard middleware pattern for all `/api/csm/*` routes; `csm` role confirmed in session type
**Addresses:** Must-have RBAC (P1); blocks Pitfall 3 (missing auth gate)
**Avoids:** Shipping any CSM route without an auth gate; this phase must complete before Phase 2 merges

### Phase 2: CSM Pipeline API + Page

**Rationale:** The pipeline view is the core CSM deliverable. Reuses existing execucao tags and whitelist constants from `tgov.ts` — no new external dependencies. Can be built and tested independently of the UI refresh.
**Delivers:** `/api/csm/pipeline` (UNION ALL query, priority 1–5), `/api/csm/[cnpj]` (per-client detail), `/csm/pipeline/page.tsx`, `CSMPipelineClient.tsx`
**Uses:** Existing `APROVACAO_NR_PROPOSTAS` / `EXECUCAO_NR_PROPOSTAS` whitelists; existing `projetos_execucao` tags (tag_lobby, tag_desembolso, tag_rendimento)
**Avoids:** Anti-pattern of extending `/api/execucao` (incompatible grouping semantics for CSM priority view)

### Phase 3: Sidebar Collapse + Dark Mode (LayoutShell)

**Rationale:** Required before adding CSM nav items — sidebar becomes unwieldy for multi-role users without collapse. Also required before mobile layout work (Phase 6). Dark mode is a companion concern since both states live in `LayoutShell`.
**Delivers:** `LayoutShell.tsx` (collapse + dark mode state), `Sidebar.tsx` updated to accept `collapsed` prop, `next-themes` integration, `darkMode: 'class'` in Tailwind config, CSM nav item added to Sidebar
**Uses:** `next-themes`, cookie-based initial state to prevent FOUC/hydration mismatch
**Avoids:** Pitfall 1 (hydration mismatch), Pitfall 2 (FOUC + Radix portal scope)
**Research flag:** Confirm `next-themes` interaction with existing Radix UI portal components before implementation

### Phase 4: Budget Items (On-Demand Fetch + Cache)

**Rationale:** Lazy TransfereGov fetch is the minimum viable approach for v6.0 budget data. Blocked by TransfereGov API auth verification — this must happen first. The `csm_budget_cache` schema must be migrated before Phase 5 can write to it.
**Delivers:** `csm_budget_cache` table migration, `/api/csm/budget-refresh` route (fetch + cache write), 7-day TTL cache-miss/cache-hit logic in `/api/csm/[cnpj]`
**Avoids:** Anti-pattern of fetching all 300+ budget items on pipeline load; real-time inference latency
**Research flag:** Needs manual TransfereGov API verification (curl test) before implementation. If auth blocks public access, Option B (full ETL) must be scoped as an alternative before this phase begins.

### Phase 5: AI Sales Tags

**Rationale:** Directly dependent on Phase 4 — budget item descriptions must be in `csm_budget_cache.items` before embeddings can be computed. OpenAI `text-embedding-3-small` runs inside the `/api/csm/budget-refresh` route, pre-computed on first access.
**Delivers:** Embedding computation in `budget-refresh` route, cosine similarity matching against Projetus service category embeddings, `sales_tags` JSONB written to cache, tags surfaced in CSM pipeline and detail pages
**Uses:** OpenAI `text-embedding-3-small`; in-memory JS cosine similarity (<300 proposals); pgvector as upgrade path
**Research flag:** Verify pgvector availability on sigmadb (`SELECT * FROM pg_extension WHERE extname = 'vector'`) before implementation. If unavailable, in-memory cosine similarity is the v6.0 implementation and pgvector escalates to v6.1.

### Phase 6: Mobile Layout

**Rationale:** Lowest dependency — requires LayoutShell (Phase 3) to be stable, but otherwise independent. Can run in parallel with Phase 4/5 if team capacity allows.
**Delivers:** `vaul` bottom drawer for sidebar on small screens; auto-collapse on route change via `usePathname`; responsive layout in `LayoutShell`
**Uses:** `vaul` library

### Phase Ordering Rationale

- Phases 1 → 2: auth-before-data. No CSM route ships without the RBAC gate in place.
- Phase 3 before CSM nav items: adding nav items before LayoutShell creates a non-collapsible sidebar (ARCHITECTURE.md anti-pattern 5).
- Phases 4 → 5: data-before-AI. AI tags cannot run without budget item data in `csm_budget_cache`.
- Phase 6 is the most independent and can slip without blocking core CSM functionality.

### Research Flags

**Needs `/gsd:research-phase` during planning:**
- **Phase 4:** TransfereGov API authentication requirements for `planoAplicacaoDetalhado` — critical unknown, blocks implementation
- **Phase 5:** pgvector availability on sigmadb dedicated Postgres — must be verified before embedding storage approach is finalized
- **Phase 3:** `next-themes` interaction with Radix UI portals — confirm `dark` class propagates to portal-rendered components

**Standard patterns (skip research-phase):**
- **Phase 1:** `canCsm()` RBAC helper — straightforward extension of existing `canReadTgov()`/`canWriteTgov()` pattern in `dal.ts`
- **Phase 2:** CSM pipeline SQL — UNION ALL + CASE priority is fully specified in ARCHITECTURE.md with exact query shape
- **Phase 6:** `vaul` mobile drawer — standard library with well-documented React integration

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Architecture | HIGH | ARCHITECTURE.md based on direct codebase inspection (2026-04-27); component boundaries, data flow, anti-patterns, and build order are well-specified |
| Stack | MEDIUM | v6.0 stack picks (next-themes, vaul, pgvector) came from orchestrator key-insight brief; no primary v6.0 STACK.md research file exists |
| Features | MEDIUM | Priority tiers from orchestrator brief; consistent with ARCHITECTURE.md but no dedicated v6.0 FEATURES.md research |
| Pitfalls | MEDIUM | Three named pitfalls from orchestrator brief; ARCHITECTURE.md anti-patterns corroborate them; no dedicated v6.0 PITFALLS.md |

**Overall confidence:** MEDIUM

### Gaps to Address

- **TransfereGov API auth:** Unknown whether `planoAplicacaoDetalhado` requires authentication. Must verify manually (curl test) before Phase 4. If auth-gated, a server-side proxy is required and the timeline extends.
- **pgvector on sigmadb:** The production DB is a dedicated Postgres instance, not Supabase. pgvector must be confirmed installed before Phase 5 work begins. In-memory cosine similarity is the verified fallback.
- **`next-themes` + Radix portal interaction:** Radix UI dialogs and dropdowns render in portals outside the ThemeProvider tree. Must confirm the `dark` class propagates correctly before dark mode is shipped.
- **Stale research files:** STACK.md, FEATURES.md, and PITFALLS.md in `.planning/research/` cover v4.1, not v6.0. Roadmapper should note these should be regenerated for v6.0 if deeper research is needed before implementation phases.

---

## Sources

### Primary (HIGH confidence)

- `.planning/research/ARCHITECTURE.md` (2026-04-27) — direct codebase inspection: `web/schema.sql`, `web/src/app/api/execucao/route.ts`, `web/src/app/api/tgov/pipeline/route.ts`, `web/src/lib/tgov.ts`, `web/src/lib/dal.ts`, `web/src/components/Sidebar.tsx`, `web/src/app/layout.tsx`, `src/crawler/repository_downloader.py`, `.planning/STATE.md`

### Secondary (MEDIUM confidence)

- Orchestrator key-insight brief — v6.0 stack picks (next-themes, cookie sidebar, vaul, OpenAI text-embedding-3-small + pgvector), feature priorities (P1/P2), top pitfalls, build order
- `.planning/research/STACK.md` (2026-03-30, v4.1) — streaming ZIP/memory patterns; not directly applicable to v6.0 but informs Vercel function timeout risk awareness
- `.planning/research/PITFALLS.md` (2026-03-30, v4.1) — advisory lock, CNPJ normalization, NewsBanner bump patterns; partially applicable as general project hygiene

### Tertiary (LOW confidence / needs validation)

- TransfereGov API endpoint format — referenced in ARCHITECTURE.md as `https://transferegov.sistema.gov.br/api/v1/proposta/{idProposta}/planoAplicacaoDetalhado`; authentication requirements unverified
- pgvector availability on sigmadb dedicated Postgres — documented as available on Supabase Pro; sigmadb status unconfirmed

---

*Research completed: 2026-04-27*
*Ready for roadmap: yes — with research flags for Phases 3, 4, 5*
