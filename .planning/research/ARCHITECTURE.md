# Architecture Research

**Domain:** Lead distribution, design refresh, and memory optimization integrated into existing Next.js 14 CRM
**Researched:** 2026-03-30
**Confidence:** HIGH — all findings based on direct inspection of live codebase

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React 18)                                │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐ │
│  │  Sidebar.tsx      │  │  /distribuir page │  │  All existing pages   │ │
│  │  MODIFY: rebrand  │  │  MODIFY: add auto-│  │  MODIFY: token swap   │ │
│  │  Projete colors   │  │  distribute btn   │  │  (CSS var replace)    │ │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│                  Next.js 14 App Router (Server + Client)                 │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  /api/cron/sync-execucao  │  │  /api/leads (existing)              │  │
│  │  MODIFY: auto-distribute  │  │  UNCHANGED                          │  │
│  │  already wired (live)     │  │                                     │  │
│  └───────────────────────────┘  └─────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│                        lib/ (shared)                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐  │
│  │  distribute-execucao│  │  repo-sync.ts        │  │  execucao-sync  │  │
│  │  EXISTS: round-robin│  │  MODIFY: streaming   │  │  UNCHANGED      │  │
│  │  for execucao       │  │  buffer refactor     │  │                 │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│                     Supabase PostgreSQL                                  │
│  ┌───────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  vendedor_projetos        │  │  vendedor_projetos (approval leads)  │ │
│  │  UNCHANGED: lead CRM data │  │  projetos_execucao (execution)       │ │
│  └───────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                          │
│  globals.css + tailwind.config.ts                                        │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  ADD: CSS custom properties for Projete brand tokens              │  │
│  │  MODIFY: tailwind.config.ts extend colors to reference CSS vars   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `tailwind.config.ts` | Color/font token definitions | MODIFY — add Projete brand palette |
| `globals.css` | CSS custom properties for theme | MODIFY — add `--color-*` variables |
| `Sidebar.tsx` | Navigation + brand wordmark | MODIFY — swap PROJETUS gradient for Projete logo/colors |
| All page components | Use brand tokens via Tailwind classes | MODIFY — grep/replace hardcoded hex values |
| `distribute-execucao.ts` | Round-robin assignment for unassigned execucao CNPJs | EXISTS — already works, wired into cron |
| `/distribuir/page.tsx` | Manual distribution UI | MODIFY — expose auto-distribute trigger |
| `/api/cron/sync-execucao/route.ts` | Cron: sync + auto-distribute | EXISTS — distribution already called post-sync |
| `repo-sync.ts` | Lead sync ETL from government CSVs | MODIFY — replace `Buffer.from(arrayBuffer())` with true streaming |
| `downloadAndStreamCSV()` | ZIP download + streaming CSV parse | MODIFY — eliminate the full-buffer step |
| `db.ts` | pg.Pool singleton | UNCHANGED |
| `dal.ts` | Session / auth helpers | UNCHANGED |

## Recommended Project Structure

No new files or directories needed for any of the three features. All changes are modifications to existing files:

```
web/src/
├── app/
│   ├── globals.css              # MODIFY: add CSS custom properties for Projete tokens
│   ├── distribuir/
│   │   └── page.tsx             # MODIFY: add auto-distribute trigger button
│   └── [all other pages]        # MODIFY: swap hardcoded hex → Tailwind token classes
├── components/
│   └── Sidebar.tsx              # MODIFY: rebrand wordmark + active/hover colors
└── lib/
    └── repo-sync.ts             # MODIFY: streaming buffer refactor (memory fix)
web/
└── tailwind.config.ts           # MODIFY: add Projete brand color tokens
```

Database: no migrations required for any of the three features.

### Structure Rationale

- **No new files:** All three features (distribution, design, memory) are enhancements to existing modules. Adding new files would fragment behavior that already has a clear home.
- **CSS custom properties in globals.css:** This is the single place where the design system lives. Tailwind reads the tokens from here via `theme.extend.colors`. Changing a brand color later requires editing one line in one file, not grep-replacing 200 components.
- **distribute-execucao.ts untouched:** The logic already exists and works. The only work is making the result visible in the UI and possibly adding a "distribute approval leads" variant for the approval pipeline.

## Architectural Patterns

### Pattern 1: CSS Custom Property Token System

**What:** Define brand colors as CSS variables in `:root {}` inside `globals.css`. Reference them in `tailwind.config.ts` as `'var(--color-brand-primary)'`. Then use `bg-brand-primary` in components.

**When to use:** Whenever the codebase has hardcoded hex values scattered across components that must be globally swappable.

**Trade-offs:** Adds one indirection layer (class → CSS var → computed color). Zero runtime cost. Enables future dark-mode or client white-labeling with zero component changes. The existing `tailwind.config.ts` already has a `sigma` color namespace — the Projete tokens extend this pattern rather than replacing it.

**Example:**
```css
/* globals.css — add under @tailwind base */
:root {
  --color-brand-primary: #0072F7;   /* Projete primary — TBD from brand guide */
  --color-brand-accent:  #FD225C;   /* Projete accent  — TBD from brand guide */
  --color-sidebar-bg:    #050B1F;   /* sidebar background */
}
```

```typescript
// tailwind.config.ts — extend existing sigma object
colors: {
  projete: {
    primary: 'var(--color-brand-primary)',
    accent:  'var(--color-brand-accent)',
  },
  sigma: { /* keep existing for backward compat during migration */ }
}
```

### Pattern 2: Stream-Without-Buffer for Large ZIP Downloads

**What:** The current `downloadAndStreamCSV()` does `Buffer.from(await res.arrayBuffer())`, which loads the entire compressed file into a `Buffer` before any parsing begins. For the 187MB proposta ZIP, this contributes ~200MB to peak heap. Replace with `res.body` piped through the inflate stream directly, so the buffer is never fully materialized.

**When to use:** Any government CSV download where the compressed file exceeds ~50MB.

**Trade-offs:** The custom ZIP header parser in `_parseZipBuffer` needs rewriting because it currently reads byte offsets from a fully-loaded `Buffer`. The alternative is to use Node.js's built-in `stream/pipeline` with a writable passthrough that reads the ZIP local file header incrementally. This is the highest-risk change in the milestone — the custom ZIP parser is tightly coupled to the buffer approach. The safest refactor is to use `node-fetch` response body streaming through a Transform stream that handles the local file header manually.

**Example (current problem):**
```typescript
// CURRENT — full buffer in memory
const zipBuffer = Buffer.from(await res.arrayBuffer())  // ~200MB for proposta
return await _parseZipBuffer(zipBuffer, url, onRow)     // another ~200MB subarray
```

**Example (target approach):**
```typescript
// TARGET — stream directly through inflate, never buffer the full ZIP
import { pipeline } from 'stream/promises'
const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
// Skip the ZIP local file header bytes (30 + filenameLen + extraLen)
// then pipe body.readable -> skip header bytes -> InflateRaw -> readline -> onRow
```

The exact implementation depends on whether the government ZIPs use Deflate (method 8) or Store (method 0). Current code handles both — the streaming refactor must too.

### Pattern 3: Existing Round-Robin Distribution (Already Implemented)

**What:** `distribute-execucao.ts` already implements least-loaded round-robin: query active vendedores with their current execucao lead count, get unassigned CNPJs, assign each to the vendedor with fewest leads, upsert into `vendedor_projetos`. This is called automatically by the `sync-execucao` cron.

**When to use:** Only when new execution projects arrive via cron (automatic). A manual re-run button in `/distribuir` calls the same function via an API endpoint.

**Trade-offs:** The current implementation processes assignments one row at a time in a loop (N individual UPDATE/INSERT queries). At a few hundred CNPJs this is fine. At thousands of newly-synced CNPJs it adds latency to the cron. A bulk INSERT with a CTE would be faster but adds complexity. For the current 8,793-project dataset, the row-at-a-time approach is acceptable.

**Existing flow:**
```
sync-execucao cron completes
    |
    v
distributeUnassignedExecucao()
    |
    +-- SELECT active vendedores with current_count
    +-- SELECT projetos_execucao CNPJs with no vendedor_projetos entry
    +-- Round-robin: assign each to min-count vendedor
    +-- For each assignment: UPDATE existing or INSERT new vendedor_projetos row
    |
    v
Returns { distributed, updated, inserted, vendedores[] } summary
```

### Pattern 4: Manual Distribution Trigger via API + UI

**What:** The `/distribuir` page already lets gestores manually assign approval-pipeline leads. Adding a "Distribuir Execucao Automaticamente" button calls a new `/api/execucao/distribute` endpoint which calls `distributeUnassignedExecucao()` and returns the summary. The response is rendered as a confirmation table showing each vendedor's before/after counts.

**When to use:** When the gestor wants to manually re-run distribution without waiting for the cron, or when new vendedores are added after a sync has already run.

**Trade-offs:** The endpoint must be gestor/coordenador only (same auth pattern as all other mutation endpoints). It is idempotent — calling it multiple times only assigns truly unassigned CNPJs.

**Example:**
```typescript
// /api/execucao/distribute/route.ts (NEW small file)
export async function POST(request: Request) {
  const session = await getApiSession()
  if (!session || !['gestor', 'coordenador'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await distributeUnassignedExecucao()
  return NextResponse.json(result)
}
```

## Data Flow

### Memory Flow During Proposta Sync (Current Problem)

```
GET siconv_proposta.csv.zip (187MB compressed)
    |
    v
res.arrayBuffer()                              <- allocates ~200MB Buffer A
    |
    v
Buffer.from(...)                               <- copy into zipBuffer (~200MB Buffer B)
    |
    v
zipBuffer.subarray(dataOffset, ...)            <- compressedData slice (~180MB, shared)
    |
    v
createInflateRaw().pipe(readline)              <- streams decompressed (~500-700MB peak)
    |                                             while propostaMap accumulates
    v
propostaMap: Map<id, {cnpj, nome, ...}>        <- ~300-500MB for 1.1M OSC rows at peak
    |
    v
leads array: LeadData[]                        <- ~100-200MB additional for built records

PEAK: ~1300MB heap with all in-flight simultaneously
```

### Memory Flow After Refactor (Target)

```
GET siconv_proposta.csv.zip
    |
    v
res.body (ReadableStream)                      <- never buffered
    |
    v
Skip ZIP local file header bytes (incremental) <- ~100 bytes, no allocation
    |
    v
InflateRaw stream                              <- decompress chunk by chunk
    |
    v
readline (line-by-line)                        <- one row in memory at a time
    |
    v
propostaMap: Map<id, {cnpj, nome, ...}>        <- same as before, unchanged
                                                  but: zipBuffer never exists
PEAK: ~300-500MB (propostaMap only, no zipBuffer overhead)
```

**Realistic target:** Eliminating the full `Buffer.from(arrayBuffer())` step removes ~200MB of peak allocation. The propostaMap itself accounts for the remaining 300-500MB and is harder to reduce without a two-pass approach (first pass: collect OSC IDs; second pass: build minimal Map for only those IDs). Two-pass doubles download time but halves Map size.

### Distribution Flow (Daily Cron)

```
Vercel Cron 13:00 UTC triggers GET /api/cron/sync-execucao
    |
    v
syncProjetosExecucao()        <- stream proposta + convenio, upsert projetos_execucao
    |                            ~30-60s, 8,793+ rows
    v
distributeUnassignedExecucao()
    |
    +-- SELECT vendedores with current_count (single query)
    +-- SELECT unassigned execucao CNPJs (single query)
    +-- Loop: assign round-robin, N individual queries
    |
    v
Returns summary logged to Vercel console
```

### Design Token Swap Flow (One-Time Migration)

```
1. Define CSS vars in :root (globals.css)
2. Map Tailwind color names to CSS vars (tailwind.config.ts)
3. Grep for hardcoded hex values (#FD225C, #0072F7, #7A4BAC, etc.)
4. Replace with Tailwind token classes (text-projete-accent, bg-projete-primary)
5. Test in browser — Sidebar wordmark, active nav color, button colors, KPI highlights
6. Brand guide delivery from client -> update CSS var values -> instant propagation
```

### Key Data Flows

1. **Distribution idempotency:** `distributeUnassignedExecucao()` only acts on CNPJs that have no `vendedor_projetos` entry with a non-null `vendedor_id`. Running it twice is safe — the second run finds zero unassigned CNPJs.

2. **Approval lead distribution (existing):** The `repo-sync.ts` already implements round-robin for approval leads (STEP 5 in the ETL). New CNPJs get the least-loaded vendedor. Existing CNPJs keep their assignment. The `/distribuir` page exposes manual reassignment for the approval pipeline. This is already shipped — no changes needed unless the client requests a separate manual re-run button for approval leads.

3. **Brand token propagation:** After the CSS var → Tailwind mapping is in place, updating the Projete primary color requires changing one line in `globals.css`. All components using `bg-projete-primary` reflect the change on next build.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (~50 vendedores, ~9k execucao projects) | Row-at-a-time distribution loop is fine. Single query for unassigned list. |
| 10k+ unassigned at once | Replace N individual queries in `distributeUnassignedExecucao()` with a single bulk INSERT via CTE — saves 10-30s of cron time. |
| Memory > 1GB during sync | Switch from single-buffer ZIP parsing to true streaming (Pattern 2). If propostaMap still exceeds 1GB, implement two-pass: first pass collects OSC ID_PROPOSTA into a Set, second pass builds only matched records. |

### Scaling Priorities

1. **Memory (immediate):** The 1300MB peak is the most urgent concern. Vercel Pro default is 2GB (confirmed from official docs as of 2026), so the current 1300MB does NOT crash the function. However, the 1300MB claim in PROJECT.md may have been measured against an older 1GB default. The refactor is still worthwhile to create headroom for CSV growth.

2. **Distribution loop (deferred):** Current N-query loop is fine for <1000 unassigned CNPJs. Only optimize when the cron timing report shows distribution taking >30s.

## Anti-Patterns

### Anti-Pattern 1: Replacing Tailwind Classes With Inline Styles for Brand Colors

**What people do:** Add `style={{ color: brandGuide.primary }}` to components because it's faster than setting up CSS tokens.

**Why it's wrong:** Inline styles bypass Tailwind's JIT compilation. They can't be overridden by utility classes, don't participate in responsive/hover/focus variants, and make the codebase unmaintainable when brand colors change.

**Do this instead:** Define the color once in `globals.css` as a CSS custom property, map it in `tailwind.config.ts`, and use it as a Tailwind class everywhere. One line in `globals.css` to update the brand color, zero component changes.

### Anti-Pattern 2: Downloading the ZIP to Disk Then Reading It

**What people do:** `fs.writeFileSync('/tmp/file.zip', buffer)` then `fs.createReadStream('/tmp/file.zip')` to avoid the in-memory buffer problem.

**Why it's wrong:** Vercel serverless functions have 512MB `/tmp` storage. A 187MB compressed ZIP that inflates to ~1GB would overflow this limit. Vercel's ephemeral filesystem is also not shared across function invocations — the file is gone on the next cron run.

**Do this instead:** True streaming from the HTTP response body directly through the inflate transform, never touching disk.

### Anti-Pattern 3: Calling distributeUnassignedExecucao() on Every Lead Page Load

**What people do:** To show "how many unassigned" in the UI, they call the distribution function on the client side on every page load.

**Why it's wrong:** The function runs N database writes. Calling it from the frontend converts a read-only page load into a mutation, creates race conditions if multiple gestores are online simultaneously, and inflates Supabase query counts.

**Do this instead:** Separate the read (SELECT COUNT of unassigned CNPJs) from the write (POST to trigger distribution). Show the count on the page via a cheap SELECT. The mutation only happens when the gestor explicitly clicks "Distribuir".

### Anti-Pattern 4: Hardcoding Projete Colors Next to the Existing PROJETUS Colors

**What people do:** Add a new `projete` key to `tailwind.config.ts` with hex values directly, keep the old `sigma` key, and use both throughout components — half the app is one brand, half is the other.

**Why it's wrong:** During the migration period, two conflicting brand systems coexist. The migration never fully completes. The `sigma` colors become dead code that no one dares remove.

**Do this instead:** Decide on the canonical color names for the new brand. Migrate all usages of `sigma.*` to `projete.*` in one pass. Delete the `sigma` namespace from `tailwind.config.ts` after migration. Purging dead tokens is the only way the design system stays clean.

### Anti-Pattern 5: Two-Pass Streaming That Downloads the Proposta ZIP Twice

**What people do:** To reduce Map size, they implement a two-pass approach: first streaming pass collects OSC IDs into a Set, second pass builds the full Map — but they download the ZIP twice.

**Why it's wrong:** The government server is unreliable (already requires 3-attempt retry logic in `downloadAndStreamCSV`). Downloading the 187MB proposta ZIP twice doubles the risk of timeout and doubles the government server load. It also doubles the cron time for STEP A.

**Do this instead:** If two-pass is needed, implement it with a single download into a streaming buffer that can be rewound — OR make the first pass more selective so the Set-based filter brings Map memory low enough without a second download. Alternatively, accept the memory cost of the full propostaMap since Vercel Pro now gives 2GB by default.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `repositorio.dados.gov.br` | HTTP GET ZIP → stream inflate → readline — existing `downloadAndStreamCSV` helper | Memory refactor changes the internals of this helper. The call sites (`syncLeadsFromRepo`, `syncProjetosExecucao`) are unchanged — they use the same `onRow` callback API. |
| Supabase PostgreSQL | `pg.Pool` via `getPool()` — unchanged | No schema changes. Distribution writes to existing `vendedor_projetos` table. |
| Google Fonts | CSS `@import` in `globals.css` — existing Space Grotesk + Inter | If Projete brand specifies different fonts, add to the existing import. The `fontFamily` in `tailwind.config.ts` already has `heading` and `body` keys to swap. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `distribute-execucao.ts` → `db.ts` | Uses `query()` helper for reads, `getPool().connect()` not needed | Current implementation uses `query()` correctly — each SELECT/INSERT/UPDATE is a separate auto-released connection. No pool starvation risk. |
| `/api/execucao/distribute` → `distribute-execucao.ts` | Direct import + call | New tiny route file. Same auth pattern as all other mutation routes (`getApiSession`, role check). |
| `repo-sync.ts` → streaming ZIP | Internal refactor of `downloadAndStreamCSV` | The function's public signature (`url: string, onRow: callback`) does not change. Only the internal implementation changes. All callers (`syncLeadsFromRepo`, `syncProjetosExecucao`) are unaffected. |
| `globals.css` → `tailwind.config.ts` | CSS vars defined in globals, referenced in config via `var(--color-*)` | Standard Tailwind + CSS custom property pattern. Supported in Tailwind v3 and v4. |
| `Sidebar.tsx` → Projete brand | Props unchanged. Internal color classes and wordmark text/logo updated | Single file change. The `layout.tsx` renders Sidebar unchanged — it only passes `user` prop. |

## Build Order

Build in this dependency order to minimize risk:

**Phase A — Lead Distribution (lowest risk, already partly implemented)**

Step A1: Add `/api/execucao/distribute` route (POST, calls `distributeUnassignedExecucao()`).
- Depends on: nothing new — `distribute-execucao.ts` already exists and works
- Risk: zero — purely additive

Step A2: Add "Distribuir Automaticamente" button to `/distribuir` page.
- Depends on: Step A1
- Risk: low — UI addition to existing page

Step A3: Validate auto-distribution is running correctly in existing cron.
- Depends on: existing code inspection + Vercel cron logs
- Risk: none — already deployed, just need to verify

**Phase B — Design Refresh (medium effort, medium blast radius)**

Step B1: Collect Projete brand guide from client (colors, fonts, logo). Block until received.

Step B2: Add CSS custom properties to `globals.css` `:root {}` block.
- Depends on: Step B1
- Risk: zero until components reference the vars

Step B3: Add Projete color namespace to `tailwind.config.ts`.
- Depends on: Step B2
- Risk: zero — additive, existing `sigma` colors still work

Step B4: Update `Sidebar.tsx` — wordmark, active color, brand gradient.
- Depends on: Step B3
- Risk: low — single component, visually obvious if wrong

Step B5: Grep and replace hardcoded hex values across all page components.
- Depends on: Step B3
- Risk: medium — large surface area. Use targeted grep for the 3-4 known hex values (`#FD225C`, `#0072F7`, `#7A4BAC`, `#050B1F`). Review each occurrence before replacing.

Step B6: Remove `sigma.*` color tokens from `tailwind.config.ts` once all references are gone.
- Depends on: Step B5 fully complete
- Risk: low — `tsc` and Tailwind purge will catch any missed references

**Phase C — Memory Optimization (highest technical risk, defer until last)**

Step C1: Add memory instrumentation to `syncLeadsFromRepo()`.
- Log `process.memoryUsage().heapUsed` after each major step (after ZIP download, after Map build, after leads array build).
- Deploy and run cron. Get real numbers before changing anything.
- Depends on: nothing
- Risk: zero — logging only

Step C2: Refactor `downloadAndStreamCSV` to avoid full-buffer ZIP materialization.
- Replace `Buffer.from(await res.arrayBuffer())` with `res.body` pipe chain.
- The custom ZIP local file header parser needs rewriting for streaming.
- Depends on: Step C1 data (know exactly how much memory to save)
- Risk: HIGH — this is the most complex change. The ZIP header parsing is custom and tightly coupled to Buffer byte offsets. Test with all three government ZIP files before deploying.

Step C3: If memory is still >1GB after Step C2, consider limiting the propostaMap.
- Option: filter more aggressively at the row level (check if CNPJ already in `neededCnpjs` set before adding to propostaMap in execucao-sync).
- Option: implement a minimal two-pass that avoids double download by caching only the IDs in pass 1.
- Depends on: Step C2 + measurement
- Risk: medium — logic change inside the ETL hot path

## Sources

- Direct code inspection: `web/src/lib/repo-sync.ts` — `downloadAndStreamCSV` buffer logic at lines 199-216, `_parseZipBuffer` at 218-267, ZIP Buffer allocation pattern
- Direct code inspection: `web/src/lib/execucao-sync.ts` — `memory_peak_mb` instrumentation at lines 217-219, existing 900MB guard at line 220
- Direct code inspection: `web/src/lib/distribute-execucao.ts` — full round-robin implementation, already wired into cron
- Direct code inspection: `web/src/app/api/cron/sync-execucao/route.ts` — `distributeUnassignedExecucao()` already called at lines 32-33
- Direct code inspection: `web/src/components/Sidebar.tsx` — current PROJETUS gradient wordmark at line 87, `sigma.neon` color at line 106, `sigma.magenta` used for active state
- Direct code inspection: `web/tailwind.config.ts` — existing `sigma` color namespace, `fontFamily.heading` and `fontFamily.body` keys
- Direct code inspection: `web/src/app/globals.css` — existing Space Grotesk + Inter import, no CSS custom properties today
- Direct code inspection: `web/src/app/distribuir/page.tsx` — existing manual assignment UI, no auto-distribute button
- Vercel official docs: `https://vercel.com/docs/functions/configuring-functions/memory` — Pro default is 2GB (not 1GB), confirmed 2026. The 1GB figure in PROJECT.md is outdated.
- Node.js official: `https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory` — Buffer lives off-heap; V8 heap pressure from large Map<string, object> entries
- Web search: "Node.js streaming CSV memory optimization large files 2026" — streaming over full-buffer is 200x less memory for large files; for-await-of async iterator pattern handles backpressure

---
*Architecture research for: v4.1 Lead Distribution + Design Refresh + Memory Optimization*
*Researched: 2026-03-30*
*Confidence: HIGH — all patterns based on direct inspection of live codebase; Vercel memory limits verified against official docs*
