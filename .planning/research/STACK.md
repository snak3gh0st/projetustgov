# Stack Research — v4.1 Distribution, Design & Performance

**Domain:** CRM SaaS — lead distribution, design system refresh, memory optimization
**Researched:** 2026-03-30
**Confidence:** HIGH (all conclusions based on direct codebase inspection + official documentation verification)

---

## Context

This is a subsequent-milestone addition to an existing Next.js 14 + PostgreSQL (Supabase) CRM already at v4.0.
The three new features are:

1. **Lead distribution with equalization** — round-robin assignment for Execucao pipeline
2. **Brand refresh (Projete identity)** — swap `sigma.*` colors and Google Fonts CSS import for Projete palette + `next/font`
3. **Memory optimization** — reduce proposta sync peak from ~1300MB to under 1GB on Vercel Pro

Current observed memory peak in `repo-sync.ts`:
- `res.arrayBuffer()` on line 202 buffers the **entire ZIP** in RAM before parsing
- `leads: LeadData[]` array on line 463 accumulates **all processed rows** before any DB writes
- Each upsert is a single-row `client.query()` inside a for-loop — N round trips to DB for N leads

---

## Feature 1: Lead Distribution (Execucao)

### Stack Assessment

**No new dependencies needed.** The equalization logic already exists.

`/web/src/lib/distribute-execucao.ts` implements least-loaded round-robin as a pure TypeScript module using the existing `query()` helper from `db.ts`. It is called by `sync-execucao` cron and also has a manual-trigger UI at `/distribuir`.

The v4.1 requirement says "roleta automatica para leads novos sem vendedor da aprovacao, priorizando vendedores com menos leads totais na execucao." This is exactly what `distributeUnassignedExecucao()` already does — query active vendedores with their CNPJ count, iterate unassigned CNPJs, assign to minimum-count vendedor.

What may be missing is **equalization at sync time** (i.e., triggering distribution automatically after `sync-execucao` completes) rather than only on manual trigger. This is a one-line call addition to `sync-execucao/route.ts`, not a new library.

| Component | Status | Action needed |
|-----------|--------|--------------|
| Round-robin algorithm | Done in `distribute-execucao.ts` | Verify it is called from `sync-execucao` cron |
| Manual trigger UI | Done at `/distribuir` | Verify Execucao tab exists alongside Aprovacao tab |
| Equalization (least-loaded) | Done — `counts.get(v.id)` comparison | No change |
| Vendedor CNPJ count query | Done — REGEXP_REPLACE join | No change |

---

## Feature 2: Design System / Brand Refresh

### Stack Assessment

**One change to font loading, zero new packages.**

#### Current Setup (problematic for production)

`globals.css` imports Google Fonts via CDN:
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
```

This causes:
- External DNS lookup at render time (privacy leak to Google)
- No build-time font subsetting (larger font payload)
- Layout shift risk during page load (fonts load after HTML)

#### Recommended: Replace with `next/font/google`

Next.js 14 includes `next/font/google` which self-hosts fonts at build time, removes the external Google request, and eliminates layout shift via `size-adjust`. This is the Next.js team's explicit recommendation for all Google Font usage.

**Implementation:**

Create `web/src/app/fonts.ts`:
```typescript
import { Inter, Space_Grotesk } from 'next/font/google'

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})
```

Update `layout.tsx` to attach CSS variables, then reference via Tailwind config's `fontFamily` extension using `var(--font-inter)` and `var(--font-space-grotesk)`. Remove the `@import` line from `globals.css`.

Note: `Space Grotesk` imports as `Space_Grotesk` (underscore for multi-word names per Next.js docs).

#### Color Palette Swap

The current Tailwind config uses `sigma.*` tokens (navy, neon, magenta). The Projete brand refresh replaces these with new token names and values. This is a pure `tailwind.config.ts` edit — no new package.

The pattern: rename `sigma` namespace to `projete` (or update values in-place), update all usages in JSX files from `bg-sigma-navy` to the new class names. Because Tailwind purges unused classes at build time, every color reference must be updated before the old classes are removed.

| Change | File | Action |
|--------|------|--------|
| New color tokens | `tailwind.config.ts` | Replace `sigma.*` values/names with Projete palette |
| Remove CDN font import | `globals.css` | Delete `@import url(https://fonts.googleapis.com...)` |
| Add next/font setup | `src/app/fonts.ts` (new file) | Create with `Inter` + `Space_Grotesk` exports |
| Attach font variables to `<html>` | `src/app/layout.tsx` | Add `className={...inter.variable} ${spaceGrotesk.variable}}` |
| Update Tailwind font references | `tailwind.config.ts` | Point `fontFamily.heading` and `fontFamily.body` to CSS vars |
| Logo asset | `public/` | Drop new SVG/PNG, reference from Sidebar |

**Install command: none.**

---

## Feature 3: Memory Optimization

### Root Cause Analysis

`repo-sync.ts` uses two memory-intensive patterns:

**Problem A — Full ZIP buffer** (line 202):
```typescript
const zipBuffer = Buffer.from(await res.arrayBuffer())
```
This buffers the entire downloaded ZIP in Node.js heap before decompression starts. For the proposta sync ZIP (the largest file, basis for the ~1300MB peak), this means the compressed bytes + the decompressed stream + the parsed rows all coexist in heap.

**Problem B — Full leads array** (lines 463–495):
```typescript
const leads: LeadData[] = []
// ... fill array from emendasMap
for (const lead of leads) {
  await client.query(UPSERT_SQL, values) // sequential, 1 per row
}
```
All N leads are materialized in RAM before any DB write. On Vercel, this array can hold tens of thousands of objects simultaneously. Combined with the ZIP buffer overhead, this is where ~1300MB accumulates.

**Problem C — Sequential single-row upserts** (lines 706–722):
Each lead is upserted individually via `client.query()`. This is slow (N round-trips) and extends the time both the leads array and the DB connection are live together, keeping all allocations in scope longer.

### Recommended Stack Additions

#### Option A: Streaming pipeline without new libraries (preferred)

Use `Readable.fromWeb()` (Node.js 18+ built-in, available on Vercel's Node 20 runtime) to convert the fetch response's Web API `ReadableStream` into a Node.js `Readable`, then pipe directly through `zlib.createInflateRaw()` and `readline.createInterface()`. This eliminates the ZIP buffer entirely.

```typescript
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
if (!res.ok) throw new Error(...)

// Convert Web ReadableStream -> Node.js Readable (no buffer)
const nodeReadable = Readable.fromWeb(res.body as ReadableStreamDefaultReader)
const inflateStream = createInflateRaw()
// pipe nodeReadable -> inflateStream -> readline
```

This approach:
- Eliminates `Buffer.from(await res.arrayBuffer())` — the largest single allocation
- Works with the existing `readline`-based CSV parser in `_parseZipBuffer`
- Requires zero new npm packages
- `Readable.fromWeb` is Node.js 18+ (Vercel Pro uses Node 20 — confirmed available)

**Confidence:** HIGH — `Readable.fromWeb` is in the Node.js 18 release notes and Node.js 20 stream documentation. The `Readable.fromWeb` + `createInflateRaw` + `createInterface` pipeline is a standard Node.js streams composition pattern.

**One caveat:** The current `_parseZipBuffer` manually parses the ZIP local file header to find the compressed offset. Streaming from fetch body skips the buffer, so the ZIP header parsing step must be replaced with a streaming ZIP parser that can handle the ZIP format on-the-fly (the local file header precedes the compressed data, so it is readable as a stream). The built-in approach remains feasible: read the first 30+ bytes as a small header, then pipe the rest to `createInflateRaw`. Alternatively, use `unzipper` (see Option B).

#### Option B: `unzipper` library for streaming ZIP (recommended if Option A proves complex)

`unzipper` (npm) accepts any Node.js Readable stream and emits ZIP entries without buffering the archive. It supports piping from HTTP responses directly.

```typescript
import unzipper from 'unzipper'

const res = await fetch(url, ...)
const nodeStream = Readable.fromWeb(res.body)
nodeStream
  .pipe(unzipper.Parse())
  .on('entry', (entry) => {
    const rl = readline.createInterface({ input: entry })
    rl.on('line', (line) => { /* parse CSV row */ })
    entry.autodrain() // required if not consuming all entries
  })
```

`unzipper` at ^0.10.x is actively maintained (last release 2024). Weekly downloads: ~3M. It handles large archives designed for streaming without accumulating zip entries in memory. It is the community-standard streaming ZIP library.

**Recommendation:** Use Option B (unzipper) because it eliminates the manual ZIP header parsing code that currently exists in `_parseZipBuffer`, reducing custom code surface area. Option A is viable as a zero-dependency alternative if adding unzipper is undesirable.

#### Batch upsert to eliminate the leads array

Replace the current pattern of: accumulate all leads → sequential single-row upserts.

New pattern: upsert in batches of 500 rows using multi-row `VALUES` clauses.

```typescript
// Process leads in streaming fashion — no full array accumulation
const BATCH_SIZE = 500
const batch: LeadData[] = []

for (const lead of leadsIterable) {
  batch.push(lead)
  if (batch.length >= BATCH_SIZE) {
    await upsertBatch(client, batch)
    batch.length = 0 // release memory
  }
}
if (batch.length > 0) await upsertBatch(client, batch)
```

Multi-row upsert reduces N DB round-trips to N/500 round-trips and, more importantly, means only 500 lead objects exist in memory at any time instead of all N.

**Note:** `pg` (node-postgres) supports multi-row parameterized inserts. The `UPSERT_SQL` currently uses `$1..$17` for one row. A batch version uses `($1,$2,...,$17),($18,$19,...,$34),...` with dynamic parameter numbering. This is pure TypeScript — no new library.

**`pg-copy-streams` is NOT recommended here.** The UPSERT requires `ON CONFLICT ... DO UPDATE` with column-level COALESCE logic that the PostgreSQL COPY command does not support. COPY is append-only. The batch parameterized INSERT/ON CONFLICT approach is the right tool.

### Summary of Memory Changes

| Change | Impact | New Dependency |
|--------|--------|---------------|
| Replace `res.arrayBuffer()` with streaming (`Readable.fromWeb` + pipe) | Eliminates ZIP buffer from heap (~biggest allocation) | None (Option A) or `unzipper` (Option B) |
| Replace full `leads` array with streaming batch upsert | Max N/500 objects in memory at once | None |
| Batch size = 500 rows per upsert | Reduces DB round-trips by 500x | None |

Expected outcome: peak heap drops from ~1300MB to approximately 200–400MB (the maps for programas/emendas/proponentes still exist, but they are bounded by the filtered dataset size, not the raw CSV size).

### Vercel Memory Configuration (safety net)

Per Vercel documentation (verified 2026-03-30), Vercel Pro functions default to **2 GB / 1 vCPU** and can be upgraded to **4 GB / 2 vCPUs** via the dashboard (Settings → Functions → Advanced Settings → Function CPU). This cannot be set in `vercel.json`.

The optimization above should bring the peak under 1GB, making the 2GB default more than sufficient. The 4GB option exists as a fallback if profiling reveals the estimate is off. Do NOT increase memory as the primary fix — fix the root cause first.

---

## Recommended Stack Changes Summary

### New Dependencies

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `unzipper` | ^0.10.14 | Streaming ZIP parser for HTTP response body | Eliminates `res.arrayBuffer()` ZIP buffer. Standard streaming ZIP library, 3M weekly downloads, actively maintained 2024. Zero custom ZIP header parsing code needed. |

**Everything else — zero new packages.**

### Removed Dependencies

None. No packages are being removed.

### Configuration Changes

| File | Change | Why |
|------|--------|-----|
| `web/tailwind.config.ts` | Replace `sigma.*` color tokens with Projete palette | Brand refresh |
| `web/src/app/globals.css` | Remove `@import url(https://fonts.googleapis.com/...)` | Replace with next/font self-hosting |
| `web/src/app/layout.tsx` | Add CSS variable classes from `fonts.ts` to `<html>` element | Wire next/font variables into DOM |
| `web/vercel.json` | Verify `sync-execucao` cron calls `distributeUnassignedExecucao` | Ensure auto-distribution fires post-sync |

### New Files

| File | Purpose |
|------|---------|
| `web/src/app/fonts.ts` | Font instances for Inter and Space_Grotesk via `next/font/google` |

---

## Installation

```bash
# Only if using Option B for ZIP streaming (recommended)
npm install unzipper
npm install -D @types/unzipper
```

No other packages to install.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `unzipper` for streaming ZIP | `yauzl` | yauzl has a more complex API requiring manual stream handling; only prefer it if needing fine-grained control over ZIP entry metadata. unzipper's simpler pipe API is better here. |
| `unzipper` for streaming ZIP | Node.js built-in (`Readable.fromWeb` + manual ZIP header parse + `createInflateRaw`) | Use this zero-dependency path if adding any npm package is prohibited. Requires replacing the manual ZIP header parsing code (30 bytes of local file header) — feasible but more error-prone. |
| Batch multi-row INSERT | `pg-copy-streams` COPY command | Only viable for append-only inserts. COPY does not support `ON CONFLICT ... DO UPDATE` with COALESCE logic. Not applicable here. |
| `next/font/google` for fonts | Continue with `@import` CSS CDN | Only acceptable in pure prototype/staging environments. For production, next/font eliminates Google's DNS visibility and improves LCP. |
| Tailwind `tailwind.config.ts` color tokens | CSS variables in `globals.css` with Tailwind 4 `@theme` | Tailwind 4 is not installed; upgrading to Tailwind 4 for a design refresh is more risk than reward. Stay on Tailwind 3. |
| Keep existing `pg` + multi-row parameterized upsert | Switch to Supabase JS client bulk upsert | The project uses raw `pg` throughout. Introducing the Supabase JS client for one operation creates two query patterns with no benefit. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `adm-zip` | Loads entire archive into memory — this is the same problem we're solving | `unzipper` (streaming) |
| `csv-parse` or `papaparse` | The existing readline-based parser handles the governo CSV quirks (BOM, encoding artifacts, pipe-delimiter variants). A generic parser would lose `fixText()` / `parseBRNumber()` and add a dependency for no gain | Existing custom parser in `repo-sync.ts` |
| Tailwind CSS v4 upgrade | Breaking changes in config format; design refresh does not require it; risk outweighs reward | Stay on Tailwind ^3.4.0 |
| `pg-copy-streams` | Does not support ON CONFLICT upsert — incompatible with the CRM state preservation requirement | Batched multi-row `INSERT ... ON CONFLICT DO UPDATE` via `pg` |
| React Query / SWR | The app uses `useEffect` + `fetch` consistently; new pages should follow the same pattern | `useEffect` + `fetch` (existing pattern) |
| BullMQ / Inngest for background jobs | Overkill; Vercel cron + `maxDuration = 300` (800s with fluid compute) covers the use case | Vercel cron (existing mechanism) |
| `sharp` or image optimization libraries | The design refresh involves color/font tokens, not image transformations | Next.js built-in `<Image>` for logo if needed |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `unzipper` ^0.10.14 | Node.js 18+, `pg` ^8.13.0, Next.js ^14.2.0 | Uses Node.js streams API; no framework coupling |
| `next/font/google` (built into Next.js 14) | Tailwind ^3.4.0 via CSS variable bridge | Use `variable` option on font constructor + reference `var(--font-name)` in tailwind.config |
| `Readable.fromWeb` | Node.js 18+ (Vercel Pro runs Node 20) | Available in Node.js 18 release. Vercel Pro confirmed at Node 20 runtime as of 2025. |

---

## Sources

- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/repo-sync.ts` — direct inspection of memory allocation patterns (arrayBuffer line 202, leads array line 463, sequential upsert loop lines 706–722)
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/distribute-execucao.ts` — direct inspection of existing round-robin algorithm
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/tailwind.config.ts` — current sigma.* color tokens
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/globals.css` — CDN font import
- `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/package.json` — exact installed versions
- `https://vercel.com/docs/functions/limitations` — Vercel Pro memory limits (2GB default, 4GB max) verified 2026-03-30 — HIGH confidence
- `https://vercel.com/docs/functions/configuring-functions/memory` — memory configuration via dashboard only (not vercel.json) verified 2026-03-30 — HIGH confidence
- `https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts` — next/font/google API, Space_Grotesk import name, CSS variable approach for Tailwind — HIGH confidence
- Node.js 18 release notes + `https://nodejs.org/api/stream.html` — `Readable.fromWeb` availability in Node 18+ — HIGH confidence
- npm-compare.com `unzipper` vs `yauzl` comparison — MEDIUM confidence (secondary source, consistent with GitHub inspection)

---

*Stack research for: v4.1 Distribution, Design & Performance milestone*
*Researched: 2026-03-30*
*Scope: Stack additions/changes only — existing validated stack not re-researched*
