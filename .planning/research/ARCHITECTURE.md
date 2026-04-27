# Architecture Patterns

**Domain:** CRM + Customer Success integration into Next.js 14 App Router
**Researched:** 2026-04-27
**Confidence:** HIGH — based on direct codebase inspection

---

## Verified Facts From Codebase

### What exists today

- `propostas` table: transfer_gov_id, nr_proposta, titulo, situacao, valor_global, valor_repasse, valor_contrapartida, proponente_cnpj, estado, municipio, modalidade, orgao_superior, orgao_vinculado, data_publicacao, data_inicio/fim_vigencia. **No budget line items stored.**
- `projetos_execucao` table: financial aggregates (valor_global, valor_repasse, valor_desembolsado, saldo_conta, rendimento_aplicacao, ingresso_contrapartida, pct_execucao), plus execution tags (tag_lobby, tag_desembolso, tag_rendimento) computed in SQL inside `/api/execucao`.
- ETL downloads 10 SICONV CSV files: siconv_proposta, siconv_convenio, siconv_desembolso, siconv_programa, siconv_programa_proposta, siconv_proponentes, siconv_emenda, siconv_apoiadores_emendas_programas, siconv_historico_situacao. **No `siconv_plano_aplicacao_detalhado.csv` in the downloader.**
- `tgov_projetos_execucao` and `tgov_propostas` mirror tables exist for TGov-only clients (non-CRM).
- `Sidebar.tsx` is a `'use client'` component, fixed width `w-56`, receives `user` prop from the server layout. No collapse state or toggle exists.
- `layout.tsx` is a server async component. Calls `auth()`, passes `user` to `<Sidebar>`, hardcodes `ml-56` margin on `<main>`. No client state wrappers.
- `csm` role exists in `dal.ts` Role type, `next-auth.d.ts`, and Sidebar nav arrays. CSM currently sees: TGov Pipeline, TGov Dashboard, TGov BI — same as projetista. No dedicated `/csm` page exists.
- `/api/tgov/pipeline` serves a unified view of aprovacao + execucao by tab (donut chart data).
- `/api/execucao` serves per-CNPJ aggregated execution data with tags (for sales team).
- `canReadTgov()` in `dal.ts` includes `csm`. `canWriteTgov()` does NOT include `csm` (read-only by default).
- Python ETL runs on sigmadb systemd timers. Memory peaks at ~1300MB during proposta sync.

---

## Question 1: CSM Pipeline API — New vs Extend

**Verdict:** Create a new `/api/csm/pipeline` route. Do NOT extend `/api/execucao` or `/api/tgov/aprovacao`.

### Why not extend existing routes

`/api/execucao` is a CNPJ-grouped CRM view with vendedor isolation joins, contact lookups, and sales tags. It groups by CNPJ for the sales execution pipeline. Adding CSM priority levels would couple two semantically different views and break the existing sort logic.

`/api/tgov/aprovacao` and `/api/tgov/execucao` are TGov-scoped, whitelist-filtered views for the product team (aprovacao/execucao/PC tabs). Adding CSM priority logic there would contaminate the whitelist-driven filtering with business priority scoring.

### Recommended new routes

```
/api/csm/pipeline     GET  — 5-level priority list spanning propostas + projetos_execucao
/api/csm/[cnpj]       GET  — per-client detail: proposals + convenios + CRM status + tags
/api/csm/budget-refresh  POST  — lazy fetch + cache from TransfereGov (see Q2)
```

### Pipeline query shape

The CSM pipeline query combines data from both tables using UNION ALL with a CASE-computed `priority_level` column:

```sql
-- Priority 1: Em Execução + saldo > 0 (active, high-value)
-- Priority 2: Em Execução + rendimento_aplicacao > 5000 (investment income)
-- Priority 3: Em Execução + valor_desembolsado = 0 (tag_lobby — blocked)
-- Priority 4: Aprovacao stage (from propostas whitelist — pre-execution upsell)
-- Priority 5: Prestação de Contas stage (closing)
SELECT cnpj, nome_proponente, situacao, saldo_conta, valor_desembolsado,
  CASE
    WHEN situacao ILIKE 'Em Execu%' AND saldo_conta > 0 AND valor_desembolsado > 0 THEN 1
    WHEN situacao ILIKE 'Em Execu%' AND rendimento_aplicacao > 5000 THEN 2
    WHEN situacao ILIKE 'Em Execu%' AND valor_desembolsado = 0 THEN 3
    WHEN ... aprovacao stage THEN 4
    WHEN situacao ILIKE '%Prestação%' THEN 5
    ELSE 6
  END AS priority_level
FROM projetos_execucao
WHERE cnpj IN (SELECT REGEXP_REPLACE(cnpj,'[^0-9]','','g') FROM vendedor_projetos)
UNION ALL
SELECT ... FROM propostas WHERE nr_proposta = ANY($whitelist)
ORDER BY priority_level, saldo_conta DESC NULLS LAST
```

Reuses `APROVACAO_NR_PROPOSTAS` and `EXECUCAO_NR_PROPOSTAS` whitelist constants from `tgov.ts`. The whitelist identifies Projetus clients across both tables.

### Auth gate — add to dal.ts

```typescript
export function canCsm(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'csm'
}
```

---

## Question 2: Budget Items (Plano de Aplicacao Detalhado)

**Verdict: NOT in the database. Requires a new data source.**

The `propostas` table contains only aggregate financial columns. There are no line item tables. The Python ETL downloader in `repository_downloader.py` downloads exactly 10 SICONV CSV files — none is `siconv_plano_aplicacao_detalhado.csv`. STATE.md explicitly states: "Plano de Aplicacao Detalhado: disponivel em propostas/convenios via TransfereGov — precisa de nova API/join para expor itens orcamentarios."

### Option A — Fetch from TransfereGov API at read time (recommended for v6.0)

TransfereGov exposes proposal detail via:
```
https://transferegov.sistema.gov.br/api/v1/proposta/{idProposta}/planoAplicacaoDetalhado
```
where `idProposta` is `propostas.transfer_gov_id`.

Fetch on demand from the Next.js API route when a CSM user opens a proposal that has no cache entry. Store the result in a new `csm_budget_cache` table (proposta_id, items JSONB, sales_tags JSONB, fetched_at TIMESTAMPTZ) with a 7-day TTL.

**Critical unknown:** TransfereGov API authentication requirements. Must verify manually whether this endpoint requires a bearer token or is publicly accessible. If auth is required, the fetch must be proxied through a server-side Next.js route — never expose tokens to the browser.

**Why Option A for v6.0:** Avoids a new ETL pipeline. Works within the existing sigmadb + Vercel architecture. Budget items are only needed when a CSM user actively inspects a proposal.

### Option B — New ETL sync (higher effort, needed for AI tags at scale)

Add `siconv_plano_aplicacao_detalhado.csv` to the sigmadb Python downloader and create a new `itens_orcamentarios` table. Not recommended for v6.0 — verify the CSV exists and has stable headers before committing. This enables batch AI tag inference across all proposals on sync.

**Recommendation:** Start with Option A. If AI tags must cover all proposals (not just ones the CSM has opened), escalate to Option B in v6.1.

---

## Question 3: AI Tag Inference Architecture

**Verdict:** Pre-compute on budget fetch, store in JSONB. Not per request, not real-time.

### Options evaluated

| Approach | Latency | Cost | Feasibility |
|----------|---------|------|-------------|
| Per-request inference | 500ms–3s added to page load | API credits per view | Not viable |
| Pre-compute on sync (ETL) | Background | Credits per proposal, once | Viable if ETL has budget data |
| Lazy compute on first access | Background, after cache miss | Credits per proposal, once | Viable with Option A |
| Embedding similarity (local) | Negligible at query time | One-time compute | Best long-term |

### Recommended approach — embedding similarity, pre-computed on budget fetch

1. Define a static list of Projetus service categories (e.g., "consultoria de projetos", "elaboração de plano de trabalho", "assessoria técnica", "capacitação", "gestão de convênios").

2. When `/api/csm/budget-refresh` fetches budget items from TransfereGov, for each `descricao` line item, compute cosine similarity against the service category embeddings using OpenAI `text-embedding-3-small`.

3. Store result in `csm_budget_cache.sales_tags` JSONB: `{"potencial": "alto", "categorias": ["consultoria", "gestão"]}`.

4. The CSM pipeline and detail pages read pre-computed tags — zero inference latency at query time.

### Where inference runs

Use OpenAI `text-embedding-3-small` from the Next.js `/api/csm/budget-refresh` server route, called lazily on first access. This keeps inference off the browser and avoids edge function constraints.

**Vercel timeout risk:** Embedding calls are fast (~100ms each) but batching 50+ line items per proposal could approach the 30s `maxDuration` if the TransfereGov fetch is slow. Mitigate by: (a) parallelizing embedding calls with `Promise.all`, (b) caching embeddings for the static service category list at module level so only the new line items need embedding.

**Scale threshold:** For <300 proposals, in-memory JS cosine similarity is sufficient. If budget item volume exceeds ~5,000 items, add pgvector extension (available on Supabase) and use `vector` columns with `<=>` cosine distance operator.

### Similarity implementation (in-memory, sufficient for v6.0)

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const normA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0))
  const normB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0))
  return dot / (normA * normB)
}
```

---

## Question 4: Sidebar Collapse State in App Router

**Verdict:** The sidebar must become controlled via a new client wrapper component (`LayoutShell`) inserted between the server layout and the sidebar.

### Current architecture (server layout + client sidebar)

```
layout.tsx (server async)
  auth() → user
  └── <Sidebar user={user} />   ← 'use client', already
  └── <main className="ml-56">  ← hardcoded, server-rendered
```

The server layout cannot hold `useState`. Collapse state cannot live there.

### Recommended pattern — LayoutShell client wrapper

```
layout.tsx (server) — unchanged, just passes user
  └── <LayoutShell user={user}>    ← NEW 'use client' component
        ├── <Sidebar user={user} collapsed={collapsed} onToggle={toggle} />
        └── <main className={collapsed ? "ml-16" : "ml-56"}>
              {children}
            </main>
```

The server layout passes only `user` (serializable) to `LayoutShell`. `LayoutShell` owns collapse state and dark mode state.

### State persistence via localStorage

```typescript
// LayoutShell.tsx
'use client'
const [collapsed, setCollapsed] = useState(false)
useEffect(() => {
  const saved = localStorage.getItem('sidebar-collapsed')
  if (saved === 'true') setCollapsed(true)
}, [])
const toggle = () =>
  setCollapsed(prev => {
    localStorage.setItem('sidebar-collapsed', String(!prev))
    return !prev
  })
```

Initial render uses default (expanded) — no server/client mismatch since `Sidebar` is already client-only and the margin is applied in `LayoutShell`.

### Collapsed sidebar behavior

- Width: `w-56` (expanded) → `w-16` (collapsed, icon-only)
- Main margin: `ml-56` → `ml-16`
- Labels hidden in collapsed mode via conditional `hidden` class
- Toggle button: chevron icon at sidebar bottom

### Dark mode

Add second state `isDark` to `LayoutShell`. Apply `dark` class to `<html>` via `document.documentElement.classList.toggle('dark', isDark)`. Persist in localStorage. Configure `darkMode: 'class'` in `tailwind.config.ts` (one-line addition — currently missing from config).

### Mobile

When `LayoutShell` detects screen width < `md`, auto-collapse sidebar to an overlay drawer. Detect via CSS media query or `window.innerWidth` check on mount. Sidebar closes on route change via `usePathname` effect.

---

## Component Boundaries

| Component | Responsibility | Status | Communicates With |
|-----------|---------------|--------|-------------------|
| `layout.tsx` (server) | Auth check, user prop extraction | MODIFY: delegate children to LayoutShell | Passes user to LayoutShell |
| `LayoutShell.tsx` (new, client) | Collapse + dark mode state | NEW | Sidebar, main content |
| `Sidebar.tsx` (client) | Navigation rendering | MODIFY: accept collapsed prop | Receives user + collapsed + onToggle |
| `/api/csm/pipeline` (new) | Priority-ranked unified view | NEW | projetos_execucao, propostas, tgov_whitelist |
| `/api/csm/[cnpj]` (new) | Per-client detail | NEW | projetos_execucao, propostas, vendedor_projetos |
| `/api/csm/budget-refresh` (new) | Lazy TransfereGov fetch + AI tags | NEW | TransfereGov external API, csm_budget_cache |
| `/csm/pipeline/page.tsx` (new) | CSM pipeline page | NEW | verifySession, /api/csm/pipeline |
| `CSMPipelineClient.tsx` (new) | Pipeline table + priority bands | NEW | GET /api/csm/pipeline |
| `dal.ts` | Auth helpers | MODIFY: add canCsm() | Used by all new API routes |

---

## Data Flow: CSM Pipeline

```
CSM user loads /csm/pipeline
  → CSMPipelineClient fetches GET /api/csm/pipeline
  → API: canCsm(session.role) check
  → SQL: UNION ALL projetos_execucao (Projetus filter via vendedor_projetos)
           + propostas (APROVACAO_NR_PROPOSTAS whitelist)
         with CASE-computed priority_level (1–5)
         ORDER BY priority_level, saldo_conta DESC
  → Returns rows: { cnpj, proponente, priority_level, situacao, saldo_conta,
                    valor_desembolsado, crm_status, tags[], idProposta }
  → UI renders priority bands (color-coded by level 1–5)

CSM opens proposal detail
  → Fetch GET /api/csm/[cnpj]
  → Check csm_budget_cache WHERE proposta_id = $id AND fetched_at > NOW() - interval '7 days'
  → IF cache hit: return items + sales_tags immediately
  → IF cache miss: return proposal data now, trigger background POST /api/csm/budget-refresh
      → budget-refresh: GET TransfereGov API → compute embeddings → INSERT csm_budget_cache
      → client polls or WebSocket notifies (simple: client re-fetches after 3s delay)
```

---

## Schema Changes Required

```sql
-- New table: lazy cache for budget items + AI tags
CREATE TABLE IF NOT EXISTS csm_budget_cache (
  proposta_id VARCHAR NOT NULL PRIMARY KEY,   -- propostas.transfer_gov_id
  items JSONB NOT NULL DEFAULT '[]',           -- raw budget line items from TransfereGov
  sales_tags JSONB NOT NULL DEFAULT '{}',      -- {"potencial": "alto", "categorias": [...]}
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_csm_budget_cache_fetched
  ON csm_budget_cache(fetched_at);
```

No changes to `propostas`, `projetos_execucao`, or any existing table.

One addition to `tailwind.config.ts`:
```typescript
darkMode: 'class',  // add this line
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Extending /api/execucao for CSM priority view
**What:** Adding priority_level CASE to the existing execucao route.
**Why bad:** Execucao route groups by CNPJ for sales team isolation (vendedor_projetos joins). CSM needs per-convenio rows for priority scoring — the grouping semantics are incompatible.
**Instead:** New `/api/csm/pipeline` with its own SQL.

### Anti-Pattern 2: Real-time AI inference per page load
**What:** Calling OpenAI API from `/api/csm/pipeline` on every request.
**Why bad:** API key exposure risk if not proxied, ~500ms–3s latency added, cost per view, Vercel 30s maxDuration risk at batch scale.
**Instead:** Pre-compute on budget fetch, store in `csm_budget_cache.sales_tags` JSONB.

### Anti-Pattern 3: Server component state for sidebar collapse
**What:** Cookie-based collapse state read in `layout.tsx` (server component).
**Why bad:** Forces full-page server re-render on every toggle, breaks React streaming. Also couples sidebar state to the server render critical path.
**Instead:** `LayoutShell` client wrapper holds state in `useState`, persisted in `localStorage`.

### Anti-Pattern 4: Fetching all budget items on pipeline load
**What:** On `/csm/pipeline` load, fetch TransfereGov budget data for all 300+ proposals.
**Why bad:** Blocks initial page render, risks Vercel timeout (30s maxDuration), external API rate limits.
**Instead:** Lazy per-proposal fetch on demand, with 7-day JSONB cache.

### Anti-Pattern 5: Adding CSM nav items without the LayoutShell
**What:** Adding `/csm/pipeline` to Sidebar before implementing collapse — sidebar grows longer with no way to collapse.
**Why bad:** Forces an awkward vertical scroll for roles with many nav items. Technical debt that must be retrofitted.
**Instead:** Build LayoutShell + collapse first (Phase 1), then add CSM nav items.

---

## Build Order Recommendation

Ordered by dependencies:

1. **LayoutShell + sidebar collapse + dark mode** — Pure UI, no data dependency. Must be done before adding new nav items or the sidebar becomes unwieldy for CSM. One Tailwind config change required.

2. **CSM nav items in Sidebar** — Add `/csm/pipeline` link for `csm` role (and gestor/admin). Blocked by LayoutShell being stable.

3. **`canCsm()` in dal.ts + `/api/csm/pipeline` route** — New SQL query, new auth gate. No external dependencies. Can be built and tested independently of UI.

4. **`/csm/pipeline` page + CSMPipelineClient** — Blocked by API route. Standard Next.js client page pattern.

5. **`csm_budget_cache` migration + `/api/csm/budget-refresh`** — Blocked by TransfereGov API endpoint verification. Prototype fetch manually first to confirm auth requirements.

6. **AI tags** — Blocked by budget data availability (step 5). Add embedding computation to the budget-refresh route.

7. **Mobile layout** — Can run parallel with steps 3–4. CSS breakpoints in LayoutShell, auto-collapse on route change.

---

## Scalability Considerations

| Concern | At current scale (~300 Projetus proposals) | At 1K proposals |
|---------|---------------------------------------------|-----------------|
| CSM pipeline query | UNION ALL, fast (<100ms). Indexes on cnpj, situacao already exist. | Add index on projetos_execucao(saldo_conta) for priority sort |
| Budget cache | JSONB per proposal, ~1–5KB each. 300 proposals = ~1.5MB total | Trivial |
| AI embeddings | In-memory JS cosine similarity, <10ms | Switch to pgvector if >5K line items |
| Sidebar collapse | localStorage + CSS width change, zero server impact | N/A |
| TransfereGov fetch | On-demand, ~300ms per proposal | Add rate limiting if CSM triggers bulk refresh |

---

## Sources

- Direct codebase inspection (HIGH confidence):
  - `web/schema.sql` — propostas table schema (no budget line items confirmed)
  - `web/src/app/api/execucao/route.ts` — CNPJ-grouped query shape + existing tags
  - `web/src/app/api/tgov/pipeline/route.ts` — existing unified pipeline, whitelist usage
  - `web/src/app/api/tgov/aprovacao/route.ts` — ALL_PROPOSTAS_CTE pattern, whitelist filter
  - `web/src/lib/tgov.ts` — APROVACAO_NR_PROPOSTAS, EXECUCAO_NR_PROPOSTAS whitelists
  - `web/src/lib/tgov-tables.ts` — tgov_propostas + tgov_projetos_execucao DDL
  - `web/src/lib/dal.ts` — canReadTgov, canWriteTgov, canCommentTgov helpers; csm role confirmed
  - `web/src/components/Sidebar.tsx` — 'use client', fixed w-56, csm nav items (TGov only)
  - `web/src/app/layout.tsx` — server component, ml-56 hardcoded, no client state
  - `src/crawler/repository_downloader.py` — 10 CSV files downloaded, no plano_aplicacao
  - `.planning/STATE.md` — explicit note: "Plano de Aplicacao Detalhado precisa de nova API/join"

- MEDIUM confidence (needs manual verification):
  - TransfereGov API endpoint format and authentication requirements for planoAplicacaoDetalhado
  - pgvector availability on Supabase free tier (documented as available on Pro; free tier unclear)
