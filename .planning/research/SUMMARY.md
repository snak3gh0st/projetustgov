# Project Research Summary

**Project:** CRM v4.1 — Distribuicao, Design & Performance
**Domain:** CRM SaaS — lead distribution equalization, brand identity refresh, memory optimization
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

This is a subsequent milestone added to a fully-shipped Next.js 14 + Supabase CRM (v4.0). All three v4.1 features have significant scaffolding already in place: the round-robin distribution algorithm exists and is wired into the daily cron, the Tailwind v3.4 design token system is in place with a `sigma.*` palette ready to be swapped, and the memory root cause has been precisely identified as a single line in `repo-sync.ts`. This milestone is completion and polish, not greenfield development.

The recommended approach treats the three features as independent work streams that can proceed in parallel, but with strict sequencing within each stream. Distribution must handle a CNPJ normalization audit and advisory lock before any code ships. Design refresh requires the client to deliver the Projete brand guide before any token work begins, and all 229 arbitrary hex color classes must be migrated in the same commit as the config change or production will ship with a visually inconsistent mixed palette. Memory optimization must instrument heap usage per-step first, apply the streaming fix second, and verify both memory and cron timing before merging.

The key risk across all three features is invisible partial completion: distribution that silently assigns the wrong vendedor due to CNPJ format mismatch, a brand refresh that updates config but not 229 arbitrary-value classes, or a "streaming fix" that pipes through Node.js streams but still buffers the full ZIP via `res.arrayBuffer()` inside the helper. Each pitfall looks complete from the outside while the core problem remains. Prevention requires explicit pre-deployment verification queries and instrumented metrics for each area.

---

## Key Findings

### Recommended Stack

The existing stack handles all three features without any new required dependencies. The one optional addition is `unzipper` (^0.10.14, MIT, 3M weekly downloads) to replace the hand-written ZIP header parser in `_parseZipBuffer` when implementing streaming ZIP downloads. If adding an npm package is undesirable, Node.js 18+ built-ins (`Readable.fromWeb` + `createInflateRaw`) achieve the same result with more custom code.

The font migration from CDN `@import` to `next/font/google` requires creating `web/src/app/fonts.ts` — a new file but no new package, as `next/font/google` ships with Next.js 14. All other changes are modifications to existing files. No new directories are needed.

**Core technologies:**
- `unzipper` ^0.10.14 (optional): Streaming ZIP parser — eliminates the full-buffer ZIP download and the hand-written header parsing code in `_parseZipBuffer`
- `next/font/google` (built-in to Next.js 14): Self-hosted font loading — removes the Google Fonts CDN DNS lookup at render time and eliminates layout shift via `size-adjust`
- `Readable.fromWeb` (Node.js 18+ built-in): Web Streams to Node Streams bridge — required to pipe `fetch` response body through Node.js `createInflateRaw` without buffering
- `pg` multi-row parameterized INSERT: Batch upsert pattern (500 rows per call) — replaces N individual DB round-trips, caps live memory to 500 lead objects simultaneously

**Critical version note:** Vercel Pro default memory is 2 GB / 1 vCPU (not 1 GB as noted in legacy project docs). The 4 GB / 2 vCPU maximum is available via the Vercel dashboard only — it cannot be set in `vercel.json` for Next.js App Router routes. The 1300 MB peak does not currently crash the function but wastes cost and leaves no headroom for CSV file growth.

### Expected Features

**Must have (table stakes):**
- Distribution: Manual "Distribuir Agora" button in `/distribuir` page calling existing API, with post-distribution report modal showing before/after counts per vendedor
- Distribution: Cron auto-distribution wired into `sync-execucao` (code path exists — verify it fires correctly in Vercel production logs)
- Distribution: Skip inactive vendedores and skip CNPJs already assigned from the approval pipeline
- Brand: Replace `sigma.*` color tokens in `tailwind.config.ts` with Projete palette (blocked on client brand guide delivery)
- Brand: Swap logo, favicon, page title, and font imports in `layout.tsx`; update `Sidebar.tsx` wordmark
- Memory: Set `memory: 3008` in Vercel config immediately as mitigation while streaming rewrite ships
- Memory: Replace `Buffer.from(await res.arrayBuffer())` with true streaming pipeline in `repo-sync.ts`
- Brand: Update `NewsBanner.tsx` with bumped version and brand announcement (required per project memory rules)

**Should have (differentiators):**
- Distribution: Equity stats view showing current lead count balance per vendedor before triggering distribution
- Distribution: Advisory lock (`pg_advisory_lock(42)`) preventing race condition between cron and manual trigger
- Brand: Full audit and migration of 229 arbitrary `bg-[#...]` / `text-[#...]` Tailwind classes across 24 files
- Memory: Batch DB upserts (500 rows per call) to reduce DB round-trips and cap in-flight object count

**Defer to v2+:**
- Tailwind v4 migration — separate milestone; v4 requires new config format, Oxide engine, plugin migration
- Weighted lead distribution by seniority or performance — requires a performance metrics system not yet built
- Two-pass streaming with Set-based CNPJ filter to reduce `propostaMap` size — only needed if streaming fix leaves peak above 1 GB

### Architecture Approach

All changes modify existing files. No new directories are needed. The design token system follows the CSS custom properties pattern: define brand colors in `globals.css` `:root {}`, map them via `tailwind.config.ts` to Tailwind utility classes — a future brand color change becomes a one-line edit in one file with zero component changes. The streaming memory fix changes only the internals of `downloadAndStreamCSV()` without altering its public signature, leaving all callers (`syncLeadsFromRepo`, `syncProjetosExecucao`) untouched. The distribution UI exposes one new tiny `/api/execucao/distribute` route that is a direct call into the existing `distributeUnassignedExecucao()` function.

**Major components and their changes:**
1. `repo-sync.ts` / `downloadAndStreamCSV` — MODIFY: replace full-buffer ZIP download with streaming pipeline; highest technical risk in the milestone
2. `tailwind.config.ts` + `globals.css` — MODIFY: replace `sigma.*` with Projete CSS custom properties and token mapping
3. `/distribuir/page.tsx` + `/api/execucao/distribute` — MODIFY/ADD: manual distribution trigger with result modal
4. `distribute-execucao.ts` — MODIFY: add advisory lock; verify equalization count targets execution context only
5. `src/app/fonts.ts` (NEW) + `layout.tsx` — ADD/MODIFY: self-hosted font loading via `next/font/google`
6. `Sidebar.tsx` — MODIFY: swap wordmark, active and hover colors to Projete brand
7. `NewsBanner.tsx` — MODIFY: bump version, add brand announcement item

### Critical Pitfalls

1. **CNPJ format mismatch silently re-distributes already-owned leads** — Before deploying any distribution code, run `SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` and clean any non-zero result. This is a one-way door: distribution running first against mismatched data permanently assigns CNPJs to the wrong vendedor.

2. **Race condition between cron auto-distribution and manual trigger** — Wrap `distributeUnassignedExecucao()` with `SELECT pg_try_advisory_lock(42)` at entry and `SELECT pg_advisory_unlock(42)` on exit. Both the cron path and the manual API path call this function; without a lock, concurrent calls read the same unassigned list and assign different vendedores to the same CNPJ.

3. **Brand refresh deploys with 229 arbitrary color classes unchanged** — The `tailwind.config.ts` token change has zero effect on `bg-[#050B1F]` / `text-[#FD225C]` style classes. Config update and all 24-file migrations must ship in the same commit. Run `grep -r "bg-\[#\|text-\[#\|border-\[#" src/ | wc -l` after migration — target is 0.

4. **Streaming fix still materializes the full ZIP buffer inside the helper** — A streaming refactor that changes the outer `res.body` call but leaves `_parseZipBuffer` intact still accumulates ~200 MB in heap. Instrument `process.memoryUsage().heapUsed` before and after the download step specifically. If peak is unchanged after the fix, the buffer is still materializing inside the helper.

5. **Streaming ZIP fix adds 30-60 seconds to cron runtime, exhausting the BrasilAPI enrichment budget** — After deploying the streaming change, check `duration_ms` in `cron_sync_log`. If it increases by more than 30 seconds, the enrichment time-budget guard (`elapsed > 200000ms`) must be adjusted downward. Never deploy a memory optimization without a full end-to-end timing run.

---

## Implications for Roadmap

Based on combined research, the three features map to two implementation phases. The distribution feature ships first (zero external dependencies, lowest risk). The design and memory features share a second phase with a hard external dependency gate (brand guide from client) and a required instrumentation step before any memory code changes.

### Phase 1: Lead Distribution — Manual Trigger and Race Condition Safety

**Rationale:** All required code already exists (`distribute-execucao.ts`, cron wiring, auth pattern). This phase adds only the UI surface and the safety guard. It has zero external dependencies, making it the ideal first ship. The advisory lock and CNPJ normalization audit must be part of the initial implementation — both are one-way doors if skipped.

**Delivers:** A "Distribuir Automaticamente" button in `/distribuir` with a result modal showing per-vendedor before/after lead counts. Advisory lock in `distributeUnassignedExecucao()` preventing double-assignment from concurrent cron and manual trigger. Verification that cron auto-distribution fires correctly in production.

**Addresses:** Distribution table-stakes features (manual trigger, result modal, skip inactive vendedores, skip approval-pipeline leads)

**Avoids:** Pitfall 1 (CNPJ normalization audit runs before any distribution code deploys), Pitfall 2 (advisory lock is part of initial implementation, not a follow-up), Pitfall 3 (equalization count must target execution context only — definition pinned before the count query is written)

**Pre-deployment gate:** Run `SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')`. Result must be 0. If not, run CNPJ cleanup migration before continuing.

### Phase 2: Design Refresh and Memory Optimization

**Rationale:** Design refresh is blocked on the Projete brand guide from the client — an external dependency that cannot be accelerated. Memory optimization requires a measured baseline before the fix can be verified. Both sub-tracks can start in parallel once the brand guide arrives and the instrumentation deployment is live. The immediate memory mitigation (`memory: 3008`) ships independently of both.

**Delivers:** Full Projete visual identity (colors, fonts, logo, favicon, page title, NewsBanner brand announcement) plus memory peak reduced from ~1300 MB to target below 600 MB for the proposta sync cron function.

**Uses:** `next/font/google` (built-in), optional `unzipper` package, CSS custom properties pattern in `globals.css`, `Readable.fromWeb` + `createInflateRaw` streaming pipeline for ZIP downloads

**Avoids:** Pitfall 5 on design (arbitrary colors not migrated — config change and all file migrations ship in one commit), Pitfall 6 (font update touches both `globals.css` import and `tailwind.config.ts` fontFamily atomically), Pitfall 7 (NewsBanner version bump is the final step of design refresh deployment), Pitfall 4 (instrument first to confirm ZIP buffer is the actual allocation before fixing), Pitfall 8 (verify streaming fix eliminates buffer inside `_parseZipBuffer`, not just at the call site), Pitfall 9 (verify end-to-end cron timing does not regress after streaming change)

**Sub-ordering within Phase 2:**

- Step 2a: Deploy `memory: 3008` to Vercel function config — 1-line change, no dependencies, ships immediately
- Step 2b: Add per-step heap instrumentation to `syncLeadsFromRepo` — deploy and wait for one cron run to establish the baseline before any fix is written
- Step 2c (parallel with 2b): Receive brand guide from client; add CSS custom properties to `globals.css`, Projete tokens to `tailwind.config.ts`, update `Sidebar.tsx`
- Step 2d: Full arbitrary-color audit and file-by-file migration; remove `sigma.*` namespace — all in one commit with the config change
- Step 2e: Font migration (`fonts.ts` creation, `layout.tsx` update, remove `@import` from `globals.css`)
- Step 2f: `NewsBanner.tsx` version bump and brand announcement item — last step before design refresh deployment
- Step 2g: Implement streaming ZIP fix in `downloadAndStreamCSV` — after baseline from Step 2b is established and the fix can be compared to it
- Step 2h: Implement batch DB upserts — after Step 2g is verified stable, as an additional cost optimization

### Phase Ordering Rationale

- Distribution ships first because it has zero external dependencies and existing code handles 90% of the work. The client sees immediate value.
- Design refresh is gated on client brand guide delivery. Starting it before the guide arrives produces rework. The memory mitigation (Step 2a) can ship the moment Phase 1 is complete regardless of brand guide status.
- Memory optimization is last within Phase 2 because it carries the highest technical risk (rewriting the custom ZIP header parser), requires a measured baseline to be credible, and is independent of both distribution and design refresh.

### Research Flags

Phases likely needing deeper investigation during planning:
- **Phase 2 / Memory optimization — ZIP streaming:** The `_parseZipBuffer` function uses custom byte-offset parsing of the ZIP local file header, tightly coupled to the `Buffer` approach. Before writing the streaming implementation, confirm the compression method used in the actual `siconv_proposta.csv.zip` file (Deflate vs Store, i.e., bytes 8-9 of the local file header). This is a 5-second check (`xxd proposta.zip | head`) that eliminates a class of implementation risk.
- **Phase 2 / Design refresh — arbitrary color surface area:** Before the brand guide arrives, run the full grep audit (`grep -r "bg-\[#\|text-\[#\|border-\[#" src/`) and document every file and hex value that needs migration. 229 classes across 24 files is a large surface — the audit output becomes the migration checklist and prevents surprise scope expansion mid-phase.

Phases with well-documented patterns (skip additional research):
- **Phase 1 / Distribution UI and API:** The `distributeUnassignedExecucao()` function signature, auth pattern (`getApiSession` + role check), and page structure are fully documented from codebase inspection. No new patterns needed.
- **Phase 2 / Font migration:** `next/font/google` with CSS variable bridge to Tailwind is the canonical Next.js 14 pattern. Import name (`Space_Grotesk` with underscore) and variable option are verified from official docs. No research gap.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All conclusions from direct codebase inspection plus official Vercel, Next.js, and Node.js docs verified 2026-03-30. One optional dependency (`unzipper`) assessed from npm registry data and GitHub. No assumptions about unread files. |
| Features | HIGH | Root causes and existing code confirmed by direct inspection of live codebase. Vercel memory limits verified against official docs (2 GB default, not the 1 GB figure in legacy PROJECT.md). Only the Projete brand guide content is unknown — that is an external input, not a research question. |
| Architecture | HIGH | All component responsibilities confirmed from live code. `distribute-execucao.ts` confirmed wired into `sync-execucao` cron at lines 32-33. ZIP buffer allocation confirmed at `repo-sync.ts` line 202. No architectural assumptions. |
| Pitfalls | HIGH | CNPJ mismatch, race condition, and ZIP buffer pitfalls verified against actual code patterns. Arbitrary color count of 229 across 24 files is from a real grep audit of the codebase. |

**Overall confidence:** HIGH

### Gaps to Address

- **Projete brand guide content:** Colors, font families, logo files, and favicon assets are unknown until the client delivers the brand guide. No brand work beyond CSS custom property scaffolding can proceed before delivery. The roadmap must include an explicit "receive brand guide" gate between Phase 1 completion and Phase 2 design work.

- **Government ZIP compression method:** The streaming rewrite must handle both Deflate (method 8) and Store (method 0) ZIP entries. Research confirms the government uses Deflate, but this must be re-verified against the actual `siconv_proposta.csv.zip` file header before writing the streaming implementation. One `xxd` command resolves this immediately.

- **`gestor_vendedor` role in distribution:** The distribution query filters for `u.active = true` and the `vendedor` role. If any active users have the `gestor_vendedor` role and also handle execution leads, they are excluded from equalization. The production DB was not audited for this edge case. Confirm in the production database before deploying Phase 1.

- **Current production cron behavior:** Whether the existing `sync-execucao` cron is successfully calling `distributeUnassignedExecucao()` post-sync can only be confirmed from Vercel function logs. The code path exists and was verified at lines 32-33 of the cron route. Production behavior should be confirmed from logs before Phase 1 begins, to avoid building a feature that is already working.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection, 2026-03-30)

- `web/src/lib/repo-sync.ts` — ZIP buffer allocation at line 202, `_parseZipBuffer` structure, sequential upsert loop at lines 706-722
- `web/src/lib/distribute-execucao.ts` — full round-robin implementation, CNPJ normalization in query, N-loop INSERT/UPDATE pattern
- `web/src/app/api/cron/sync-execucao/route.ts` — `distributeUnassignedExecucao()` called at lines 32-33 (confirmed wired into cron)
- `web/src/lib/execucao-sync.ts` — `memory_peak_mb` instrumentation, 900 MB guard at line 220
- `web/tailwind.config.ts` — `sigma.*` color namespace, `fontFamily.heading` and `fontFamily.body` keys
- `web/src/app/globals.css` — CDN font `@import` URL, confirmed no CSS custom properties today
- `web/src/app/distribuir/page.tsx` — manual assignment UI, confirmed no auto-distribute button present
- `web/src/components/Sidebar.tsx` — PROJETUS gradient wordmark, `sigma.neon` / `sigma.magenta` active and hover state usage
- `web/vercel.json` — confirmed dual `sync-leads` cron entries (12:30 and 18:00 UTC); `sync-execucao` must be audited to confirm it appears exactly once
- Grep audit — 229 arbitrary color classes in 24 files; 424 standard Tailwind color references across codebase

### Primary (HIGH confidence — official external documentation, verified 2026-03-30)

- `https://vercel.com/docs/functions/limitations` — Pro default 2 GB / 1 vCPU, max 4 GB / 2 vCPU
- `https://vercel.com/docs/functions/configuring-functions/memory` — memory not settable per-route in `vercel.json` for Next.js App Router; must use Vercel dashboard
- `https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts` — `next/font/google`, `Space_Grotesk` import name (underscore), CSS variable approach for Tailwind
- Node.js 18 release notes + `https://nodejs.org/api/stream.html` — `Readable.fromWeb` available in Node.js 18+

### Secondary (MEDIUM confidence)

- `https://tailwindcss.com/blog/tailwindcss-v4` — confirmed v3 vs v4 scope difference, migration complexity
- `https://tailwindcss.com/docs/theme` — Tailwind v3 arbitrary value class behavior (not affected by `theme.extend.colors` changes)
- npm `unzipper` ^0.10.14 — 3M weekly downloads, last release 2024, MIT license
- LeanData / LeadAngel round-robin distribution blog posts — fewest-first vs strict round-robin tradeoffs (consistent with implemented code behavior)

---

*Research completed: 2026-03-30*
*Ready for roadmap: yes*
