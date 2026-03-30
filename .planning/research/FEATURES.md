# Feature Research

**Domain:** CRM v4.1 — Lead distribution equalization, Design system brand refresh, Memory optimization
**Researched:** 2026-03-30
**Confidence:** HIGH (all three areas verified against official sources and existing codebase inspection)

---

## Context: Subsequent Milestone on Existing System

This research covers **only the new features** for v4.1. The baseline system (v4.0) is fully shipped:

- Manual lead assignment: `web/src/app/distribuir/page.tsx` + `/api/leads/assign`
- Automatic distribution logic: `web/src/lib/distribute-execucao.ts` — fewest-leads-first algorithm exists
- Cron already calls distribution: `sync-execucao` cron invokes `distributeUnassignedExecucao()` post-sync
- Tailwind v3.4 with `sigma.*` custom color palette: `web/tailwind.config.ts`
- CSV sync root cause: `web/src/lib/repo-sync.ts` line 202 — `await res.arrayBuffer()` loads full ZIP into heap

All three features have significant existing scaffolding. This milestone is completion + polish, not greenfield.

---

## Feature 1: Automatic Round-Robin Lead Distribution (Execucao)

### How This Works in Industry CRMs

Industry CRMs (Salesforce, HubSpot, LeanData) implement two variants of lead distribution:

- **Strict round-robin:** Cycle through reps in fixed order. Simple but drifts when reps are added/removed mid-cycle.
- **Load-balancing / fewest-first:** Assign each new lead to whichever rep currently has the fewest active leads. Self-corrects imbalances over time, handles team size changes gracefully.

The fewest-first variant is the recommended pattern for this use case because the team is small and new members may be added between cron runs.

### What Already Exists in This Codebase (Do Not Rebuild)

The core algorithm is fully implemented in `lib/distribute-execucao.ts`:

1. Query active vendedores + their current execucao lead counts
2. For each unassigned CNPJ: pick vendedor with lowest count, increment counter
3. UPSERT into `vendedor_projetos`

The `sync-execucao` cron already calls this automatically. The `distribuir/page.tsx` page exists for manual gestor assignment.

### Table Stakes

Features the gestor assumes exist when told "we added auto-distribution."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Manual "Distribuir Agora" button in distribuir/page.tsx | Gestor must run distribution outside cron schedule (e.g., when new vendedor joins) | LOW | Calls existing cron API endpoint with gestor auth |
| Post-distribution report modal | Confirmation of who got how many leads before and after | LOW | `distributeUnassignedExecucao()` already returns stats object with before/after counts |
| Skip inactive vendedores | Prevent leads going to reps on leave | LOW | Already filtered by `u.active = true` in query — verify this flag is maintained when gestor deactivates user |
| Leads from Aprovacao pipeline inherit vendedor | Execucao leads that came from Aprovacao must keep their original vendedor, not be re-distributed | MEDIUM | Distribution must skip CNPJs where `vendedor_projetos.vendedor_id IS NOT NULL` — query already includes this WHERE clause |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Distribution equity summary per vendedor | Gestor sees current lead count imbalance before running distribution | MEDIUM | Simple COUNT query per vendedor, display as table |
| Real-time count update in distribuir/page.tsx | Page reflects actual counts after distribution completes | LOW | Re-fetch vendedores after distribution API call |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fully automatic distribution without confirmation | "Less work for gestor" | Silent failures are unauditable; gestor loses oversight of who has which leads | Keep manual trigger with preview; cron auto-distribution for new CNPJs only |
| Weighted round-robin by seniority or performance | "Better leads to better reps" | Requires performance metrics system not yet built; demotivates junior reps; client has not requested this | Equal distribution first; add weights only if client explicitly requests |
| Re-distribute already-assigned leads | "Rebalance the whole team" | Destroys existing vendor relationships for leads already in contact | Distribute only unassigned CNPJs; manual reassignment for edge cases |

---

## Feature 2: Design System / Brand Refresh (Projete Visual Identity)

### How Tailwind v3 Brand Refreshes Work

**Current state (confirmed from codebase):** The app uses Tailwind v3.4 (devDependency `"tailwindcss": "^3.4.0"`) with a `sigma.*` custom color palette and `Space Grotesk` / `Inter` fonts defined in `tailwind.config.ts`.

The correct approach for a brand refresh on a Tailwind v3 app:

1. Replace token values in `tailwind.config.ts` — all components using `sigma.*` classes update automatically with zero code changes
2. Replace font families in `theme.extend.fontFamily`
3. Swap logo asset in `public/`, update `<img>` references
4. Audit and replace any hardcoded hex values (bypassed the token system) in TSX files
5. Update favicon, OG image, page title in `app/layout.tsx`

**Tailwind v4 is out of scope for this milestone.** v4 (released early 2026) requires migrating from `tailwind.config.ts` to a CSS `@theme` directive, uses a new Rust-based Oxide engine, and breaks plugins. It is a separate milestone. CONFIDENCE: HIGH — verified against official Tailwind v4 docs and migration guide.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Replace `sigma.*` color tokens with `projete.*` colors | All UI surfaces update to brand-accurate palette | LOW | Single file change in `tailwind.config.ts`; all 33+ component files using `sigma-*` classes update automatically |
| Replace fonts (Space Grotesk + Inter → Projete brand fonts) | Typography is a primary brand signal | LOW | Update `fontFamily` in `tailwind.config.ts` + `<link>` tags in `app/layout.tsx` |
| Replace logo / wordmark | Visual identity anchors on the logo | LOW | Swap asset in `public/`, update `<img src>` references (grep for `sigma` in image filenames) |
| Update favicon + OG image | Browser tab and link preview identity | LOW | Replace `favicon.ico`, `apple-touch-icon.png`, OG image in `public/` |
| Update page title and metadata | Tab title, SEO, brand consistency | LOW | `metadata` export in `app/layout.tsx` |
| Audit hardcoded hex values | Color tokens only work if used consistently — hardcoded values bypass the system | LOW | `grep -r '#[0-9A-Fa-f]\{3,6\}' web/src/` surfaces bypasses; spot-replace with token references |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| CSS variable approach for runtime theming | Enables future per-client branding without rebuild | MEDIUM | Requires moving token values to CSS custom properties; worthwhile only if multi-tenant branding is planned |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Migrate to Tailwind v4 as part of this refresh | "Modernize the entire stack" | v4 migration needs dedicated milestone — Oxide engine, new config format, plugin breaks, 20% of migration is manual | Stay on v3.4, change token values only |
| Full component rebuild | "Make it look completely new" | Breaks working UI, risks regressions across all pages | Targeted token swap + spot-fix non-token usages |
| Custom Tailwind plugin for brand components | "Reusable brand system" | Over-engineering for a single-tenant internal tool | Token values in config + component extraction via React components is sufficient |

---

## Feature 3: Memory Optimization for Proposta CSV Sync

### Root Cause (Confirmed from Codebase)

The ~1300MB memory spike is caused by this pattern in `lib/repo-sync.ts` at line 202:

```typescript
const zipBuffer = Buffer.from(await res.arrayBuffer())
// Loads the ENTIRE downloaded ZIP into a single Buffer before any parsing
```

The `siconv_proposta.csv.zip` source file is 187MB compressed. The uncompressed 1.1M-row CSV expands to ~600MB-1.2GB. Loading it fully into a Buffer before decompressing means peak heap simultaneously holds: the ZIP buffer + the inflated readline interface + the `propostaMap` being built.

**Critical finding from official Vercel docs:** Vercel Pro memory limit is **4GB maximum** with **2GB default**. CONFIDENCE: HIGH — source: [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations). The previous belief that the limit was 1GB was incorrect. The 1300MB peak exceeds the 2GB default only if no explicit memory configuration is set. The function is not crashing — it is near but likely within the default 2GB provisioning.

**Immediate mitigation available:** Set `"memory": 3008` in `vercel.json` function config to provision 3GB for the sync function. This is a one-line change that buys headroom while the streaming rewrite is prepared.

### Industry-Standard Fix: Streaming Without Full Buffer

Node.js Streams API (and the modern WHATWG Streams `ReadableStream`) allows processing HTTP response bodies chunk-by-chunk. The pattern to eliminate the ZIP buffer:

```
fetch() → res.body (ReadableStream) → pipeThrough(DecompressionStream) → TextDecoder → readline → onRow
```

This avoids `await res.arrayBuffer()` entirely. Memory stays flat regardless of file size. The trade-off: retries must re-issue the HTTP request from scratch rather than re-parsing a buffered response — acceptable since government CSV downloads are idempotent.

**DecompressionStream** is available natively in Node.js 18+ and in the Vercel edge runtime. No new npm dependency required.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Set `memory: 3008` in vercel.json for sync function | Immediate stability while streaming rewrite ships | LOW | One config line; 3008MB = ~3GB, within Vercel Pro 4GB max |
| Replace `await res.arrayBuffer()` with streaming pipeline | Eliminates ZIP buffer allocation (estimated saving: 200-400MB peak) | MEDIUM | Rewrite `downloadAndStreamCSV` to use `res.body` + `DecompressionStream` native API |
| Batch DB inserts in execucao-sync | Currently calls `query()` per row in a loop — accumulates open DB connections and unbounded Promise arrays | MEDIUM | Collect rows into batches of 500, UPSERT with UNNEST array syntax |
| Verify memory telemetry works | `memory_peak_mb` field already in `ExecucaoSyncStats` — confirm it is being logged and reported | LOW | Check cron response JSON for `memory_peak_mb` in production logs |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Separate sync into two sequential cron jobs (proposta-only + execucao join) | Smaller peak per invocation; each function stays within 2GB default | HIGH | Requires second cron slot + coordination logic; only worth it if streaming is insufficient |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pre-download CSVs to Supabase Storage | "Don't process in the function" | Government CSVs update daily — adds an ETL staging step, a new failure mode, storage costs, and a second cron job | Stream directly; cut in-memory footprint |
| Paginated CSV chunking | "Process 100K rows at a time" | Government CSVs are single monolithic files — you must download all of it to page through it; streaming achieves the same memory profile more simply | True streaming (chunk by chunk) is the correct abstraction |
| Worker threads for CSV parsing | "Offload CPU to secondary thread" | Complex in serverless — workers have separate heaps but the main thread still owns the network I/O; does not solve the buffering problem | Fix the buffering root cause first; worker threads are premature optimization |

---

## Feature Dependencies

```
[Distribution: Manual Trigger UI]
    └──requires──> [/api/cron/sync-execucao endpoint with gestor auth]  (already exists)
                       └──requires──> [distributeUnassignedExecucao()]  (already exists)

[Distribution: Post-distribution report modal]
    └──requires──> [distributeUnassignedExecucao() return stats]  (already returned)

[Brand Refresh: Color token swap]
    └──requires──> [Projete brand guide from client]  (external dependency)
    └──enhances──> [all components using sigma.* classes]  (zero code changes in components)

[Brand Refresh: Font swap]
    └──requires──> [Projete brand guide specifying font families]  (external dependency)
    └──requires──> [Google Fonts or self-hosted font files]

[Memory: configureMemory = 3008]
    └──independent of──> [streaming rewrite]
    └──enables──> [immediate stability while streaming ships]

[Memory: Streaming download rewrite]
    └──requires──> [Node.js 18+ DecompressionStream API]  (available on Vercel)
    └──conflicts with──> [current retry-via-reparse pattern]  (retries must re-download)
    └──reduces──> [peak heap by ~200-400MB estimated]

[Memory: Batch DB inserts]
    └──independent of──> [streaming rewrite]
    └──reduces──> [DB connection churn and Promise queue pressure]
```

### Dependency Notes

- **Brand refresh requires client brand guide:** Projete brand colors, fonts, and logo must be provided by the client before any design work starts. This is the only external blocking dependency across the three features.
- **Memory streaming conflicts with current retry logic:** Existing code retries by re-parsing the already-downloaded `zipBuffer`. With streaming, the buffer is gone — retries must re-issue the `fetch()` call. This is safe because government CSV downloads are idempotent.
- **`configureMemory` is a mitigation, not the fix:** Raising provisioned memory from 2GB to 3GB buys stability immediately. The streaming rewrite reduces actual heap usage so the function costs less on Vercel Pro billing (provisioned memory-time is billable).
- **Distribution manual trigger does not depend on brand refresh:** All three features are independent of each other and can be built in parallel by different developers.

---

## MVP Definition for v4.1

### Launch With

- [ ] **Distribution: Manual "Distribuir Agora" button** in `distribuir/page.tsx` — calls existing API, shows result modal
- [ ] **Distribution: Post-distribution report modal** — who got how many, before vs after counts
- [ ] **Brand: Color token swap** — replace `sigma.*` with `projete.*` in `tailwind.config.ts` (requires brand guide)
- [ ] **Brand: Font swap + logo + favicon** — update `layout.tsx` font imports, swap logo asset in `public/`
- [ ] **Memory: `memory: 3008` in vercel.json** — immediate mitigation for sync-execucao function
- [ ] **Memory: Replace `await res.arrayBuffer()` with streaming pipeline** — primary fix in `repo-sync.ts`

### Add After Validation

- [ ] **Memory: Batch DB inserts** in `execucao-sync.ts` — validate streaming was sufficient first, then optimize DB writes
- [ ] **Distribution: Equity stats view** — show lead-count balance per vendedor in distribuir/page.tsx header
- [ ] **Brand: Audit hardcoded hex values** — grep, fix any `#xxxxxx` literals that bypass token system

### Future Consideration

- [ ] **Tailwind v4 migration** — separate milestone; no v4 features needed for this brand refresh
- [ ] **Weighted lead distribution** — only if client explicitly requests it; performance metrics system must exist first
- [ ] **Worker thread CSV parsing** — only if streaming rewrite is proven insufficient by memory telemetry

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Distribution: Manual trigger + report modal | HIGH | LOW | P1 |
| Brand: Color token swap | HIGH | LOW | P1 — blocked by client brand guide |
| Brand: Font + logo + favicon | HIGH | LOW | P1 — blocked by client brand guide |
| Memory: configureMemory = 3008 | HIGH | LOW | P1 — 1-line mitigation |
| Memory: Streaming download rewrite | HIGH | MEDIUM | P1 |
| Brand: Audit hardcoded hex values | MEDIUM | LOW | P2 |
| Distribution: Equity stats view | MEDIUM | MEDIUM | P2 |
| Memory: Batch DB inserts | MEDIUM | MEDIUM | P2 |
| Distribution: Weighted distribution | LOW | HIGH | P3 |
| Tailwind v4 migration | LOW | HIGH | P3 |

**Priority key:**
- P1: Must ship in v4.1
- P2: Should ship when P1 is stable
- P3: Defer to future milestone

---

## Sources

- [Vercel Functions Limits (official docs)](https://vercel.com/docs/functions/limitations) — confirmed 4GB max / 2GB default for Pro plan (HIGH confidence)
- [LeanData: Round Robin Lead Distribution Best Practices](https://www.leandata.com/blog/round-robin-lead-distribution-best-practices/) — fewest-leads-first mechanism description (MEDIUM confidence)
- [LeadAngel: Round Robin Distribution](https://www.leadangel.com/blog/operations/round-robin-distribution-enhancing-lead-distribution-strategies/) — load-balancing vs round-robin distinction (MEDIUM confidence)
- [Tailwind CSS v4.0 announcement](https://tailwindcss.com/blog/tailwindcss-v4) — confirmed v3 vs v4 scope difference (HIGH confidence)
- [Tailwind CSS Theme Variables docs](https://tailwindcss.com/docs/theme) — token system behavior (HIGH confidence)
- [Tailwind CSS v4 Migration Guide](https://www.digitalapplied.com/blog/tailwind-css-v4-2026-migration-best-practices) — migration scope complexity (MEDIUM confidence)
- [How to Load Very Large CSV Files in Node.js](https://www.codegenes.net/blog/how-to-load-very-large-csv-files-in-nodejs/) — streaming approach (MEDIUM confidence)
- Codebase: `web/src/lib/repo-sync.ts` line 202 — confirmed root cause of memory spike (`await res.arrayBuffer()`) (HIGH confidence)
- Codebase: `web/src/lib/distribute-execucao.ts` — confirmed algorithm already exists and is wired to cron (HIGH confidence)
- Codebase: `web/tailwind.config.ts` — confirmed Tailwind v3.4 with `sigma.*` palette (HIGH confidence)
- Codebase: `web/package.json` — confirmed `"tailwindcss": "^3.4.0"` (HIGH confidence)

---

*Feature research for: v4.1 Distribuição, Design & Performance milestone*
*Researched: 2026-03-30*
