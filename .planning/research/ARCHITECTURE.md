# Architecture Research

**Domain:** Post-sale intelligence tab (Projetos em Execução) integrated into existing Next.js CRM
**Researched:** 2026-03-18
**Confidence:** HIGH — based on direct code inspection of all relevant existing files

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React 18)                            │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │  /leads page     │  │  /execucao page  │  │  Sidebar.tsx      │   │
│  │  (existing)      │  │  (NEW)           │  │  (MODIFY nav)     │   │
│  └────────┬─────────┘  └────────┬─────────┘  └───────────────────┘   │
├───────────┼────────────────────┼──────────────────────────────────────┤
│                  Next.js 14 App Router (Server + Client)              │
├───────────┼────────────────────┼──────────────────────────────────────┤
│  ┌────────▼─────────┐  ┌───────▼──────────┐  ┌──────────────────┐    │
│  │  /api/leads      │  │  /api/execucao   │  │  /api/cron/      │    │
│  │  (existing)      │  │  (NEW)           │  │  sync-leads      │    │
│  │                  │  │                  │  │  (EXTEND)        │    │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘    │
├───────────┼────────────────────┼──────────────────────┼───────────────┤
│                        lib/ (shared)                                  │
│  ┌────────┴───────────────────┴──────────────────────┴───────────┐   │
│  │  db.ts  │  dal.ts  │  repo-sync.ts  │  execucao-sync.ts (NEW) │   │
│  └──────────────────────────────────────────────────────────────┘    │
├───────────────────────────────────────────────────────────────────────┤
│                     Supabase PostgreSQL                               │
│  ┌─────────────────────────────────┐  ┌────────────────────────────┐  │
│  │  vendedor_projetos (existing)   │  │  projetos_execucao (NEW)   │  │
│  │  lead_contacts (existing)       │  │  isolated, no CRM state    │  │
│  │  users, commission_config, etc. │  │                            │  │
│  └─────────────────────────────────┘  └────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `Sidebar.tsx` | Navigation with role-based item visibility | MODIFY — add /execucao for gestor only |
| `/execucao/page.tsx` | Read-only intelligence view, CNPJ-grouped list | NEW |
| `ExecucaoSlideOver.tsx` | Detail panel with financial metrics per CNPJ | NEW |
| `/api/execucao/route.ts` | Serve projetos_execucao, join lead_contacts | NEW |
| `execucao-sync.ts` | ETL: download convenio + proposta CSVs, join, upsert | NEW |
| `/api/cron/sync-leads/route.ts` | Cron trigger — call execucao sync after leads sync | MODIFY |
| `projetos_execucao` (DB table) | Stores execution-phase projects, isolated from CRM | NEW |
| `repo-sync.ts` | Existing CRM lead sync | UNCHANGED |
| `dal.ts` | Auth helpers — `isAdmin()` / `getApiSession()` already present | UNCHANGED |
| `db.ts` | pg.Pool singleton, max 5 connections | UNCHANGED |

## Recommended Project Structure

New files only — existing structure unchanged:

```
web/src/
├── app/
│   ├── execucao/
│   │   └── page.tsx                  # NEW: gestor-only page (server + client)
│   └── api/
│       └── execucao/
│           └── route.ts              # NEW: GET /api/execucao
├── components/
│   └── ExecucaoSlideOver.tsx         # NEW: financial detail slide-over
└── lib/
    └── execucao-sync.ts              # NEW: ETL for convenio + proposta CSVs
```

Database migration (run once in Supabase before any deploy):

```sql
CREATE TABLE projetos_execucao (
  id                   SERIAL PRIMARY KEY,
  cnpj                 VARCHAR(20) NOT NULL,
  nome                 TEXT,
  nr_convenio          VARCHAR(50),
  id_proposta          BIGINT,
  situacao             VARCHAR(100),
  tipo_instrumento     VARCHAR(100),
  orgao_concedente     TEXT,
  uf                   VARCHAR(2),
  municipio            VARCHAR(100),
  -- financial columns
  valor_global         NUMERIC(18,2),
  valor_repasse        NUMERIC(18,2),
  valor_desembolsado   NUMERIC(18,2),
  saldo_em_conta       NUMERIC(18,2),
  percentual_execucao  NUMERIC(5,2),
  -- vigência
  dt_inicio_vigencia   DATE,
  dt_fim_vigencia      DATE,
  -- audit
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX projetos_execucao_cnpj_convenio_idx
  ON projetos_execucao (cnpj, COALESCE(nr_convenio, ''));

CREATE INDEX projetos_execucao_cnpj_idx ON projetos_execucao (cnpj);
```

### Structure Rationale

- **`execucao-sync.ts` as a separate file:** Keeps ETL for execucao completely isolated from `repo-sync.ts`. The existing sync already occupies close to the 300s Vercel Pro limit. A separate file allows independent testing and independent failure — a convenio sync crash cannot corrupt the CRM lead sync.
- **`projetos_execucao` as a new dedicated table:** The milestone spec mandates isolation from `vendedor_projetos`. These are post-sale operational records, not prospective leads. Mixing them would corrupt CRM lead counts, status dashboards, and commission calculations. The CNPJ is the join key when contact data is needed.
- **`/execucao/page.tsx` as a new route:** Matches the established pattern — each major feature is a top-level page (`/leads`, `/comissoes`, `/monitoramento`, `/bi`). Role guard at the server component level redirects non-gestors before any data is fetched.
- **`/api/execucao` as a new route directory:** Follows `app/api/[name]/route.ts` convention used throughout the codebase.

## Architectural Patterns

### Pattern 1: Cron-Driven ETL With Sequential Isolation

**What:** The new function `syncExecucaoFromRepo()` mirrors the structure of the existing `syncLeadsFromRepo()` — download ZIP, stream CSV, build in-memory map, upsert into dedicated table. It is called from the existing cron handler immediately after `syncLeadsFromRepo()` completes.

**When to use:** Any new government CSV source that must enter the system on the same daily schedule.

**Trade-offs:** Adding more work to an already long-running cron is a risk. The proposta CSV is 187MB — the largest file the system has ever processed. Early filtering inside the `onRow` callback is mandatory to avoid memory exhaustion. If total cron duration exceeds 300s, the execucao sync moves to a dedicated second cron path in `vercel.json`.

**Example:**
```typescript
// /api/cron/sync-leads/route.ts — MODIFIED (addition only)
import { syncLeadsFromRepo } from '@/lib/repo-sync'
import { syncExecucaoFromRepo } from '@/lib/execucao-sync'   // NEW

export async function GET(request: Request) {
  // ... auth check unchanged ...
  const leadStats = await syncLeadsFromRepo()        // existing, unchanged
  const execStats = await syncExecucaoFromRepo()     // NEW, sequential
  return NextResponse.json({ success: true, leads: leadStats, execucao: execStats })
}
```

### Pattern 2: Cross-Reference Via id_proposta (In-Memory Join)

**What:** The convenio CSV contains `id_proposta` and the financial columns (desembolso, saldo, situacao). The proposta CSV contains `id_proposta`, `cnpj_proponente`, and `tipo_instrumento`. The join key is `id_proposta`. The ETL streams proposta first, building a Map keyed by `id_proposta`. Then it streams convenio and enriches each row from the Map before upserting.

**When to use:** Whenever two government CSVs must be joined to produce one database record. The convenio file alone does not contain the proponent CNPJ — it is required from proposta.

**Trade-offs:** The proposta CSV at 187MB is large. Loading every proposta row into a Map is an OOM risk on Vercel's 1GB serverless limit. Filter to OSC only inside the `onRow` callback before adding to the Map. Typical OSC subset is a small fraction of all propostas.

**Example:**
```typescript
// execucao-sync.ts — key ETL structure
const propostaMap = new Map<string, { cnpj: string; tipo: string }>()

// STEP A: stream proposta, keep only OSC
await downloadAndStreamCSV(ZIP_FILES.proposta, (row) => {
  const tipo = row.TIPO_INSTRUMENTO || ''
  if (!tipo.toLowerCase().includes('osc')) return   // discard early
  const cnpj = cleanCNPJ(row.CNPJ_PROPONENTE)
  if (!cnpj) return
  propostaMap.set(row.ID_PROPOSTA, { cnpj, tipo })
})

// STEP B: stream convenio, join, filter "em execução", upsert
await downloadAndStreamCSV(ZIP_FILES.convenio, (row) => {
  const situacao = (row.SITUACAO_CONVENIO || '').toLowerCase()
  if (!situacao.includes('execu')) return            // discard early
  const proposta = propostaMap.get(row.ID_PROPOSTA)
  if (!proposta) return                              // no OSC proposta match
  // build upsert record and write to projetos_execucao
})
```

### Pattern 3: Gestor-Only Route Guard (Existing Pattern)

**What:** The `/execucao` page checks session role server-side and redirects non-gestors. The API route also checks role and returns 401 for non-gestors. Both use existing helpers from `dal.ts`.

**When to use:** Any feature restricted to gestor role. The codebase has no `middleware.ts` for role-based routing — all guards live in route/page files. This is consistent with how `/upload`, `/distribuir`, `/monitoramento`, and the sync cron are already protected.

**Example:**
```typescript
// /execucao/page.tsx (server component)
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function ExecucaoPage() {
  const session = await verifySession()
  if (session.role !== 'gestor') redirect('/')
  return <ExecucaoClientPage />
}

// /api/execucao/route.ts
const session = await getApiSession()
if (!session || session.role !== 'gestor') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Pattern 4: CNPJ as Integration Key for Contact Data

**What:** Contact data (telefone, email from `lead_contacts`) is retrieved by joining on `cnpj`. The `/api/execucao` query LEFT JOINs `projetos_execucao` with `lead_contacts` on `pe.cnpj = lc.lead_cnpj`, using the same ordering already established in `/api/leads` (`principal DESC, created_at ASC`). If `lead_contacts` has no entry, it falls back to `vendedor_projetos.telefone/email`.

**When to use:** Any new table that needs to surface contact info for an organization. CNPJ is the stable cross-table key in this system.

**Example:**
```sql
SELECT
  pe.*,
  COALESCE(
    (SELECT lc.telefone FROM lead_contacts lc
     WHERE lc.lead_cnpj = pe.cnpj
     ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1),
    vp.telefone
  ) AS telefone_contato,
  COALESCE(
    (SELECT lc.email FROM lead_contacts lc
     WHERE lc.lead_cnpj = pe.cnpj
     ORDER BY lc.principal DESC, lc.created_at ASC LIMIT 1),
    vp.email
  ) AS email_contato,
  COUNT(*) OVER (PARTITION BY pe.cnpj) AS fomento_count
FROM projetos_execucao pe
LEFT JOIN (
  SELECT DISTINCT ON (cnpj) cnpj, telefone, email
  FROM vendedor_projetos ORDER BY cnpj, updated_at DESC
) vp ON vp.cnpj = pe.cnpj
ORDER BY pe.cnpj, pe.valor_global DESC NULLS LAST
```

### Pattern 5: CNPJ Grouping on the Frontend (Existing Pattern)

**What:** The leads page (`/leads/page.tsx`) already implements CNPJ-level grouping in a `useMemo`: it reduces the flat array of rows into groups keyed by CNPJ, then derives aggregate values (total valor, emenda count). The execucao page uses the same pattern: group by CNPJ, show fomento count as the "big number", expand to show individual convênios.

**When to use:** Any list view where one organization can have multiple rows in the DB (multiple convênios for the same CNPJ).

## Data Flow

### Sync Flow (Daily Cron at 12:30 UTC / 18:00 UTC)

```
Vercel Cron triggers GET /api/cron/sync-leads
    |
    +---> syncLeadsFromRepo()  [unchanged]
    |         download siconv_programa.csv.zip   (small)
    |         download siconv_emenda.csv.zip     (medium)
    |         download siconv_proponentes.csv.zip (medium)
    |         upsert vendedor_projetos (CRM leads)
    |         BrasilAPI enrichment queue
    |         ~200-250s total
    |
    +---> syncExecucaoFromRepo()  [NEW]
              download siconv_proposta.csv.zip  (187MB, filter OSC in-stream)
              download siconv_convenio.csv.zip  (15MB, filter "em execução" in-stream)
              in-memory join: convenio -> proposta via id_proposta
              upsert projetos_execucao ON CONFLICT (cnpj, nr_convenio)
              ~30-60s target
```

### Query Flow (Gestor Visits /execucao)

```
Gestor navigates to /execucao
    |
    v
/execucao/page.tsx (server component)
    verifySession() -> role check -> redirect if not gestor
    renders <ExecucaoClientPage /> (client component)
    |
    v
useEffect -> GET /api/execucao?search=...&uf=...&alert_only=...
    |
    v
/api/execucao/route.ts
    getApiSession() -> role guard (401 if not gestor)
    SELECT from projetos_execucao
      LEFT JOIN lead_contacts ON cnpj (for contact info)
      LEFT JOIN vendedor_projetos ON cnpj (fallback contact)
      WHERE (search, uf, alert_only filters)
    returns flat JSON array
    |
    v
Client page
    groups rows by CNPJ (same useMemo pattern as /leads)
    big number: fomento_count per CNPJ
    alert highlight: valor_desembolsado < 0 (red border-l-2)
    click row -> ExecucaoSlideOver opens with full financial detail
```

### Key Data Flows

1. **Alert detection:** `valor_desembolsado < 0` is computed in the DB (raw column value). The API returns it as-is. The frontend reads it and applies `border-l-2 border-l-red-500` (same visual pattern as `is_max_priority` on the leads page). Positive desembolso with low saldo triggers an "amber" check-saldo indicator.
2. **Contact surfacing:** `lead_contacts` principal contact is joined at the API layer via correlated subquery. If none exists, `vendedor_projetos` phone/email is the fallback (COALESCE). The frontend renders the same contact display as the leads table.
3. **Fomento count:** `COUNT(*) OVER (PARTITION BY pe.cnpj)` in the SQL query computes the count per CNPJ without a separate aggregation query. Returned on every row; the frontend reads it from the first row of each group.
4. **Vigência days:** `EXTRACT(DAY FROM NOW() - dt_inicio_vigencia)::INT` computed in SQL. No client-side date math needed.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (gestor-only, dozens to hundreds of execution-phase orgs) | Single SQL query with window function is fine. No caching needed. Full table fits in one response. |
| 1k+ projetos_execucao rows | Add `LIMIT` and search filtering to `/api/execucao`. The "em execução + OSC" filter on the source data naturally bounds the result set. |
| Cron timeout risk (>300s total) | If both syncs together exceed 300s, add a second cron path for execucao at `30 14 * * *` in `vercel.json`. The two syncs are fully independent (separate tables, separate functions). |

### Scaling Priorities

1. **First bottleneck — proposta CSV memory:** 187MB compressed, estimated 1-2GB uncompressed. Filter OSC rows in the `onRow` callback before building the Map. If the OSC subset is still too large, switch to a two-pass approach: first pass extracts only OSC `id_proposta` values into a Set, second pass streams the full CSV again and only builds the Map for those IDs.
2. **Second bottleneck — cron duration:** The sync must complete within Vercel's 300s function timeout. Instrument `syncExecucaoFromRepo()` with step-level timing logs from the start. If it approaches 60s, the cron has headroom; if it exceeds 60s consistently, move it to its own cron.

## Anti-Patterns

### Anti-Pattern 1: Merging Execution Projects Into vendedor_projetos

**What people do:** Add columns (`situacao_execucao`, `desembolso`) to the existing `vendedor_projetos` table and populate them from the convenio CSV.

**Why it's wrong:** `vendedor_projetos` has CRM constraints — the UPSERT deliberately never overwrites `status_contato`, `vendedor_id`, `comissao_*`. Mixing execution-phase financial data into this table forces the CRM sync to distinguish lead vs. project records. It also inflates lead counts, corrupts status dashboards, and breaks commission reports.

**Do this instead:** Separate table `projetos_execucao`. Join on CNPJ at query time when contact data is needed.

### Anti-Pattern 2: Loading the Entire proposta CSV Into Memory

**What people do:** Buffer all rows of `siconv_proposta.csv.zip` into a Map, then filter to OSC afterward.

**Why it's wrong:** The proposta file is 187MB compressed — likely 1-2GB in memory. Vercel serverless functions are limited to 1GB RAM on Pro. Loading all rows causes OOM crashes.

**Do this instead:** Filter `tipo_instrumento` for OSC inside the `onRow` streaming callback. The `return` inside the callback discards the row without adding it to any Map. The existing streaming ZIP parser in `repo-sync.ts` supports this — `onRow` fires per row, early return costs only the row parsing overhead.

### Anti-Pattern 3: Role Guard Only on the Frontend

**What people do:** Check `session.role === 'gestor'` in a `useEffect`, hide the UI if not gestor, but leave the API route open.

**Why it's wrong:** API routes are reachable by any authenticated user who constructs the URL. Vendedores can call `/api/execucao` directly and see all financial data.

**Do this instead:** Guard both the server component (redirect on page load) and the API route (401 for non-gestors). Use `verifySession()` in the server component and `getApiSession()` in the API route — both are already in `dal.ts`.

### Anti-Pattern 4: Calling Both Syncs in Parallel

**What people do:** `await Promise.all([syncLeadsFromRepo(), syncExecucaoFromRepo()])` to save time.

**Why it's wrong:** Both syncs share the same `pg.Pool` with `max: 5` connections (`db.ts` line 7). The existing `syncLeadsFromRepo()` holds a pool client for the entire duration of STEP 5-9 (several minutes). A concurrent second sync competes for the remaining 4 connections, causing connection timeout errors and potential pool exhaustion.

**Do this instead:** Sequential calls. `await syncLeadsFromRepo()` then `await syncExecucaoFromRepo()`. The total duration is additive (~30-60s more) — acceptable within the 300s budget.

### Anti-Pattern 5: Using percentual_execucao From the Repo Without Validation

**What people do:** Display the `PERC_EXEC_FINANC` field from the convenio CSV directly as "% de execução."

**Why it's wrong:** Government CSVs sometimes contain `null`, `0`, or stale values for this field. If `valor_global` is available, recomputing the percentage from `valor_desembolsado / valor_global * 100` is more reliable than trusting the pre-computed column.

**Do this instead:** Store the raw repo value in `percentual_execucao`. In the API query or frontend, prefer `(valor_desembolsado / valor_global * 100)` when both values are non-null and non-zero; fall back to the stored `percentual_execucao` otherwise.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `repositorio.dados.gov.br` | HTTP GET + ZIP streaming — same `downloadAndStreamCSV` helper as existing sync | Two new files: `siconv_convenio.csv.zip` (15MB) and `siconv_proposta.csv.zip` (187MB). Both are at `REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'` already defined in `repo-sync.ts`. Copy the constant or import it. |
| Supabase PostgreSQL | `pg.Pool` via `getPool()` from `db.ts` | Shared pool, sequential access only. New table `projetos_execucao` lives in the same Supabase DB. No schema changes to any existing table. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `execucao-sync.ts` -> `db.ts` | Imports `getPool()`, acquires client, runs queries, releases in `finally` | Identical pattern to `repo-sync.ts` STEP 5+. |
| `/api/execucao` -> `db.ts` | Imports `query()` helper | Same pattern as `/api/leads/route.ts`. |
| `/api/execucao` -> `dal.ts` | Imports `getApiSession()` | Role check: `session.role !== 'gestor'` returns 401. |
| `/api/cron/sync-leads` -> `execucao-sync.ts` | `import { syncExecucaoFromRepo }` | Called sequentially after `syncLeadsFromRepo()` in the same handler file. |
| `Sidebar.tsx` -> session role | Receives `user.role` prop from `layout.tsx` | Add `/execucao` nav item to the gestor-only block (currently lines 53-59 of `Sidebar.tsx`). The coordenador block does NOT get this item per the milestone spec. |
| `projetos_execucao` -> `lead_contacts` | SQL LEFT JOIN on `cnpj = lead_cnpj` | Read-only join. The execucao sync never writes to `lead_contacts`. |
| `projetos_execucao` -> `vendedor_projetos` | SQL LEFT JOIN on `cnpj` as fallback contact | Used only when `lead_contacts` has no entry for a CNPJ. Read-only. |

## Build Order

Build in this exact dependency order:

**Step 1 — DB migration** (prerequisite for all other steps)
Run the `CREATE TABLE projetos_execucao` + indexes SQL in Supabase. No app code deploys yet. Table is empty — no impact on existing system.

**Step 2 — `execucao-sync.ts`** (depends on Step 1, no UI dependency)
Implement `syncExecucaoFromRepo()`. Test by calling it directly from a one-off script (`web/scripts/test-execucao-sync.mjs`) against the live Supabase DB. Validate that the CSV join produces records and that the upsert populates `projetos_execucao`. Do NOT wire into cron yet.

**Step 3 — `/api/execucao/route.ts`** (depends on Step 1; can be built in parallel with Step 2)
Implement the GET endpoint with role guard, SQL query, LEFT JOINs, and filter parameters. Test via `curl -H "Cookie: ..." http://localhost:3000/api/execucao`. Returns empty array until Step 2 populates the table — that is acceptable.

**Step 4 — Extend cron handler** (depends on Step 2)
Add `syncExecucaoFromRepo()` call to `/api/cron/sync-leads/route.ts`. Trigger manually via `curl` with `CRON_SECRET`. Verify both syncs run sequentially and the total runtime stays within 300s. Check Supabase for populated rows.

**Step 5 — `/execucao/page.tsx` + `ExecucaoSlideOver.tsx`** (depends on Steps 3 and 4)
Build the read-only frontend. The page pattern is identical to `/leads/page.tsx`: fetch on mount, group by CNPJ, rows expand, slide-over for detail. Add alert highlighting for `valor_desembolsado < 0`.

**Step 6 — `Sidebar.tsx` update** (depends on Step 5, lowest risk)
Add the `/execucao` nav item to the gestor-only nav block. One-line change. Ship last to avoid a nav item pointing to a page that does not yet exist.

## Sources

- Direct code inspection: `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/repo-sync.ts` — ETL pattern (STEP 1-9), ZIP streaming, shared `downloadAndStreamCSV`, pool acquisition
- Direct code inspection: `web/src/app/api/leads/route.ts` — API pattern, role filtering, contact subquery structure
- Direct code inspection: `web/src/app/leads/page.tsx` — CNPJ grouping useMemo, expand/collapse, slide-over invocation, alert styling
- Direct code inspection: `web/src/lib/dal.ts` — `getApiSession`, `verifySession`, `isAdmin` helpers
- Direct code inspection: `web/src/lib/db.ts` — pool config: `max: 5`, shared singleton, retry logic
- Direct code inspection: `web/src/components/Sidebar.tsx` — gestor nav block at lines 53-59, role branching
- Direct code inspection: `web/vercel.json` — cron schedule (12:30 UTC + 18:00 UTC), `maxDuration: 300`
- Direct code inspection: `web/src/lib/types.ts` — VendedorProjeto type fields including `nr_convenio`, `saldo_conta`, `situacao`
- Repo directory listing: `https://repositorio.dados.gov.br/seges/detru/` confirmed on 2026-03-18 — `siconv_convenio.csv.zip` (15MB), `siconv_proposta.csv.zip` (187MB), both dated 2026-03-18

---
*Architecture research for: Projetos em Execução intelligence tab integration into existing CRM*
*Researched: 2026-03-18*
*Confidence: HIGH — all patterns based on direct inspection of the live codebase*
