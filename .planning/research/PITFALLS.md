# Pitfalls Research

**Domain:** CRM v4.1 — Lead distribution equalization, visual identity refresh, memory optimization
**Researched:** 2026-03-30
**Confidence:** HIGH (primary source: direct codebase analysis + verified against Vercel official docs + community patterns)

---

## Critical Pitfalls

### Pitfall 1: Approval-Pipeline Vendedor Not Inherited by Execution Distribution

**What goes wrong:**
When a CNPJ is already in `vendedor_projetos` with a non-null `vendedor_id` (assigned during the approval pipeline), `distributeUnassignedExecucao()` correctly skips it. But the check is done with `REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = pe.cnpj`. If any formatting inconsistency exists between the CNPJ stored in `vendedor_projetos` (14-digit, zero-padded) and in `projetos_execucao` (raw 14-digit from ETL), the REGEXP_REPLACE normalization on the LEFT side may not match the already-normalized RIGHT side, causing the condition to fail silently and treating the CNPJ as "unassigned." The lead then gets redistributed to a different vendedor, splitting ownership of the same organization across two people.

**Why it happens:**
`projetos_execucao.cnpj` is populated by `execucao-sync.ts` which calls `cleanCNPJ()` (always 14-digit, no special characters). `vendedor_projetos.cnpj` is populated by `repo-sync.ts` which also calls `cleanCNPJ()`, but older rows created manually or via spreadsheet import may contain formatted CNPJs like `12.345.678/0001-99`. The REGEXP_REPLACE on the LEFT side handles this, but only if the PostgreSQL function is applied consistently in EVERY query path used by the distribution. If someone adds a new check or JOIN that compares `vp.cnpj = pe.cnpj` without the REGEXP_REPLACE, a formatted CNPJ breaks the match. With 8,793 execution projects, even a 1% mismatch means ~87 organizations with split ownership.

**How to avoid:**
- Add a database-level normalized column: `cnpj_normalized VARCHAR(14) GENERATED ALWAYS AS (REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')) STORED` on `vendedor_projetos`, or run a one-time cleanup: `UPDATE vendedor_projetos SET cnpj = REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') WHERE cnpj ~ '[^0-9]'` before deploying distribution.
- Write a diagnostic query before deploying: `SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` — this count must be 0 or the cleanup must run first.
- Consider using a PostgreSQL function `normalize_cnpj(text)` to centralize the logic rather than inlining REGEXP_REPLACE in every query.

**Warning signs:**
- A gestor reports a client "appearing twice" — once in the execution pipeline under one vendedor, once in the approval pipeline under a different vendedor.
- `distributeUnassignedExecucao()` reports distributed > 0 for CNPJs that are already in `vendedor_projetos` with a vendedor_id.
- Running `SELECT vp.cnpj, vp.vendedor_id, pe.cnpj FROM vendedor_projetos vp JOIN projetos_execucao pe ON pe.cnpj = vp.cnpj WHERE vp.vendedor_id IS NOT NULL` returns 0 rows even though you expect matches.

**Phase to address:** Phase 1 (lead distribution implementation). Run the CNPJ normalization diagnostic and cleanup before writing any distribution logic. The cleanup is a one-way door — if distribution runs first with mismatched data, some CNPJs get permanently assigned to the wrong vendedor and must be manually corrected.

---

### Pitfall 2: Race Condition Between Cron Auto-Distribution and Manual Gesture

**What goes wrong:**
`distributeUnassignedExecucao()` runs automatically at the end of `sync-execucao` (daily at 13:00 UTC). Gestores can also trigger it manually via `POST /api/execucao/distribute`. If a gestor manually triggers distribution at the same moment the cron fires (or shortly after a manual sync), two concurrent calls to `distributeUnassignedExecucao()` run simultaneously. Both read the same "unassigned" list before either has written their assignments. Both then assign the same CNPJs to different vendedores — whichever INSERT/UPDATE commits last wins, producing a final assignment list that is neither balanced nor predictable.

**Why it happens:**
The current `distributeUnassignedExecucao()` is not wrapped in a transaction or advisory lock. The read-then-write pattern (SELECT unassigned CNPJs → compute assignments → UPDATE/INSERT per row) is a classic time-of-check/time-of-use race condition. With a pool max of 5 connections and two concurrent calls, each gets its own connection and each proceeds independently. The N individual `UPDATE`/`INSERT` statements are not atomic across the batch.

**How to avoid:**
- Wrap the distribution function in a PostgreSQL advisory lock: `SELECT pg_try_advisory_lock(42)` at the start, `SELECT pg_advisory_unlock(42)` at the end. If the lock cannot be acquired, return early with a "distribution already in progress" message rather than running a duplicate.
- Alternatively, use a single SQL `INSERT ... SELECT ... FOR UPDATE SKIP LOCKED` to atomically claim unassigned rows.
- Log a warning in the API response when distribution is skipped due to an active lock: gestores need visibility that their manual trigger was a no-op.
- The `vercel.json` has TWO `sync-leads` cron entries (12:30 and 18:00 UTC) — if the `sync-execucao` path is accidentally duplicated the same way, double auto-distribution fires daily. Audit `vercel.json` to confirm `sync-execucao` appears exactly once.

**Warning signs:**
- Vendedor lead counts in the execution tab are uneven immediately after distribution, then change when the page is refreshed (second write resolved later).
- Two vendedores are both assigned the same CNPJ — normally impossible, detectable with `SELECT cnpj, COUNT(DISTINCT vendedor_id) FROM vendedor_projetos WHERE vendedor_id IS NOT NULL GROUP BY cnpj HAVING COUNT(DISTINCT vendedor_id) > 1`.
- Vercel function logs show two concurrent requests to `/api/cron/sync-execucao` or `/api/execucao/distribute` within the same 10-second window.

**Phase to address:** Phase 1 (lead distribution). The advisory lock must be part of the initial implementation, not a follow-up. The cron double-entry audit must happen before deploying.

---

### Pitfall 3: Distribution Counts Approval-Pipeline Leads as Execution Leads, Skewing Equalization

**What goes wrong:**
The equalization algorithm counts each vendedor's "current execucao lead count" to decide who gets the next unassigned CNPJ. The count query in `distribute-execucao.ts` lines 19-27 counts `DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')` from `vendedor_projetos` where there is a matching row in `projetos_execucao`. This is correct for a fresh system. But if a vendedor has many approval-pipeline assignments for CNPJs that also happen to be in `projetos_execucao` (because those organizations both submitted a proposta AND have an active convênio), they appear to have more execution leads than they actually do. The least-loaded vendedor calculation is wrong — the vendedor with the most approval leads also appears "heavy" on execution, even if they have zero actual execution assignments. The result is uneven distribution from day one.

**Why it happens:**
`vendedor_projetos` is shared between both pipelines. A CNPJ being "in `projetos_execucao`" does not mean the vendedor is working it as an execution lead — it may just be a proposta lead that coincidentally has an active convênio. The current count conflates the two contexts.

**How to avoid:**
- Count only rows where the `vendedor_projetos` record was explicitly assigned for execution context. Options: (a) add a `pipeline` column to `vendedor_projetos` (`'aprovacao' | 'execucao'`) to disambiguate, or (b) for the count, only count CNPJs that appear in `projetos_execucao` AND do NOT also have a matching row in `vendedor_projetos` from the approval pipeline with a different `codigo_programa` pattern. Option (a) is cleaner and future-proof.
- At minimum, document the current behavior explicitly in `distribute-execucao.ts` with a comment explaining what the count measures and what bias it introduces.

**Warning signs:**
- After initial distribution, some vendedores receive many more CNPJs than others even though the algorithm is supposed to equalize.
- A vendedor with 50 approval-pipeline leads receives zero execution assignments while a vendedor with 10 approval leads receives 20 execution assignments.

**Phase to address:** Phase 1 (distribution design). The definition of "execucao lead count" must be pinned before any code is written. A wrong count produces permanently skewed distribution that must be manually corrected by the gestor.

---

### Pitfall 4: Memory Peak Not Caused by CSV Parsing — Wrong Fix Target

**What goes wrong:**
The 1300MB heap peak is attributed to "CSV processing" but the actual bottleneck in `repo-sync.ts` is `Buffer.from(await res.arrayBuffer())` at line 202. This loads the entire ZIP file into memory as a `Buffer` before any CSV parsing begins. For the siconv_proposta.csv.zip (187MB compressed, likely 800MB+ uncompressed), this single allocation is responsible for the majority of the peak. If the fix focuses on the CSV parsing (e.g., limiting batch size, processing in chunks) without addressing the ZIP download pattern, memory usage barely improves.

**Why it happens:**
The current implementation downloads the full ZIP as a `Buffer`, then manually parses the ZIP header to extract the deflate stream (`_parseZipBuffer`). This avoids external ZIP library dependencies but requires holding the entire compressed file in memory simultaneously with the streaming decompressor output. Developers see the streaming pipeline after `_parseZipBuffer` and assume the streaming is the primary memory-reduction mechanism — it is, for the parsing phase, but not for the download phase.

**How to avoid:**
- The fix must target the download step: stream the ZIP response body through a decompressor without buffering the entire ZIP first. Use `response.body` (a Web ReadableStream) piped through Node.js `Readable.fromWeb()` → `createInflateRaw()` → `readline`. This avoids ever holding the full ZIP in memory.
- Verify which file is causing the peak: add per-file memory logging before and after each `downloadAndStreamCSV()` call. The 187MB proposta ZIP is the suspect, not the 15MB convenio ZIP.
- After fix, the target is `heapUsed < 600MB` during the entire sync, leaving 1.4GB+ headroom under the Vercel Pro 2GB default (confirmed: Vercel Pro default is 2 GB / 1 vCPU as of 2026, maximum is 4 GB / 2 vCPU — the "1GB limit" noted in PROJECT.md reflects an outdated understanding of the platform).
- Do NOT attempt to fix by increasing Vercel function memory allocation in the dashboard. That delays the problem and increases cost. Fix the root cause first.

**Warning signs:**
- Memory peak does not drop significantly after adding CSV batch processing or row-count limits.
- Memory peak occurs early in the sync (during STEP 1 for `siconv_proposta.csv.zip`) before any database writes happen.
- Vercel function logs show `FATAL ERROR: Reached heap limit` or the function is killed mid-sync with no error returned.

**Phase to address:** Phase 2 (memory optimization). Must instrument memory at each step before attempting any fix, or the improvement is unverifiable. Target metric: peak heap < 600MB.

---

### Pitfall 5: Design Refresh Leaves 229 Arbitrary Color Classes Unchanged

**What goes wrong:**
The codebase uses `bg-[#XXXXXXXX]` and `text-[#XXXXXXXX]` arbitrary Tailwind color classes in 229 locations across 24 files. The `tailwind.config.ts` defines a `sigma.*` color palette (navy, neon, magenta, purple, tier.*) which will be replaced by Projete brand colors. After the brand refresh, the semantic tokens in `tailwind.config.ts` are updated, but all 229 arbitrary color instances remain — they are hardcoded hex values that Tailwind's purge/JIT ignores in config changes. The app appears half-refreshed: some components use the new colors, others use the old hardcoded hex values.

**Why it happens:**
Tailwind's JIT compiler generates utilities for arbitrary values directly from class names at build time. They are independent of the theme config — changing `theme.extend.colors` has zero effect on `bg-[#050B1F]`. Developers updating the config assume all colors are covered, not realizing the grep scope of arbitrary values in 24 files. Additionally, 424 standard Tailwind color classes (`bg-gray-*`, `bg-slate-*`, `bg-blue-*`, etc.) also remain unchanged and may clash with the new brand palette.

**How to avoid:**
- Before writing any brand change, run a comprehensive audit: `grep -r "bg-\[#\|text-\[#\|border-\[#" src/ | wc -l` (baseline: 229) and `grep -r "bg-gray-\|bg-slate-\|text-gray-\|text-slate-" src/ | wc -l` (baseline: ~424). Document which files need migration.
- Establish a semantic token strategy first: replace `sigma.*` tokens with `projete.*` tokens in `tailwind.config.ts`, then do a file-by-file migration of both arbitrary values and standard Tailwind colors to semantic tokens.
- Do NOT update the config first and ship — update config + migrate all files in the same commit, or the intermediate state is deployed to production with visible color inconsistencies.
- Use a migration checklist with file names from the grep audit. Each file gets checked off only after visual inspection (not just find/replace).

**Warning signs:**
- After deploying the theme config change, some cards/buttons/badges still show old Sigma navy (#050B1F) while new components use Projete colors.
- The login page (4 arbitrary color hits) or sidebar (2 hits) looks visually inconsistent with the rest of the app.
- Storybook or visual diff shows mixed palettes between components.

**Phase to address:** Phase 2 (design refresh). Comprehensive audit must precede ANY color change deployment. The audit output is the migration checklist — do not estimate, count exactly.

---

### Pitfall 6: Font Import Not Updated, Design Refresh Looks Wrong Despite Correct Colors

**What goes wrong:**
`globals.css` imports `Space Grotesk` and `Inter` from Google Fonts. The Projete brand guide specifies different fonts (e.g., a different primary heading font or a custom weight variant). If only colors are updated in `tailwind.config.ts` but the font import in `globals.css` is left unchanged, the app shows the new color palette with the old typeface. The brand refresh feels incomplete. If Projete uses a self-hosted font (common for Brazilian companies wanting to avoid Google Fonts CDN), the import mechanism changes entirely — from a single `@import url(...)` to `@font-face` declarations with local file paths.

**Why it happens:**
Font configuration is split across two files: `globals.css` (import URL) and `tailwind.config.ts` (font family names). Developers updating the theme config add new font family names but miss the import URL. Self-hosted fonts require adding font files to `/public/fonts/` and updating the import — a different type of change from simply swapping a URL.

**How to avoid:**
- Document the full font change as three steps: (1) obtain font files or confirm CDN URL, (2) update `globals.css` import, (3) update `tailwind.config.ts` fontFamily. All three must ship together.
- If using Google Fonts, test the CDN URL in isolation before deploying (`curl -I <url>` to verify it resolves and is not rate-limited).
- If self-hosting: add files to `public/fonts/`, add `@font-face` in `globals.css`, update config, and verify in Vercel preview deployment (local dev often masks font loading failures because the font is cached).

**Warning signs:**
- Color palette looks correct but typography is unchanged after deploying.
- Console error: `Failed to load font: <url>` in browser dev tools after deploying to preview.
- Vercel preview deployment shows the correct font locally but Times New Roman fallback in incognito mode (cache miss reveals the broken font path).

**Phase to address:** Phase 2 (design refresh). Font changes must be validated in a Vercel preview deployment, not just local dev.

---

### Pitfall 7: NewsBanner Version Not Bumped After Design Refresh

**What goes wrong:**
`NewsBanner.tsx` stores a `BANNER_VERSION` key in `localStorage` so users see it once per version. If the design refresh ships without bumping the banner version and adding an announcement item about the new look, returning users never see the change communicated. More critically, if design changes break the banner's own styling (it contains hardcoded colors and arbitrary hex values: 1 arbitrary hit), the banner silently disappears for users who have already dismissed it — a silent regression that's hard to detect after deployment.

**Why it happens:**
The memory note (`MEMORY.md`) instructs: "Always update NewsBanner.tsx (bump version + items) when deploying user-facing changes." The design refresh is a major user-facing change. In the focus of migrating 229 arbitrary color classes, the banner update is easy to miss. Additionally, the banner is only visible to users who haven't dismissed the current version — developers testing locally with a clean localStorage may miss that the banner's own colors need refreshing.

**How to avoid:**
- Add "Update NewsBanner.tsx" as an explicit checklist item in the design refresh task, not as an afterthought.
- After completing all color migrations, grep `NewsBanner.tsx` for arbitrary hex values and update them. Bump the version and add an announcement about the visual refresh.
- Test the banner by clearing localStorage in a browser tab after deploying to preview.

**Warning signs:**
- Production deployment of design refresh does not include a NewsBanner commit touching version or items.
- After deploying, the banner does not appear for users who had previously dismissed an older version.

**Phase to address:** Phase 2 (design refresh). The banner update is the last step of any user-facing visual change deployment.

---

### Pitfall 8: ZIP Stream Still Holds Two Large Buffers Simultaneously During Parsing

**What goes wrong:**
Even after switching from `Buffer.from(await res.arrayBuffer())` to a streaming approach for the download, the `_parseZipBuffer` structure creates a second large allocation. The ZIP format requires reading the local file header to find `compressedSize` before extracting the deflate stream. If the response is streamed but the ZIP header parsing requires knowing `compressedSize` upfront (to use `zipBuffer.subarray(dataOffset, dataOffset + compressedSize)`), the streaming approach must either: (a) buffer enough to read the header, then stream the data portion, or (b) parse as a stream without `subarray`. Approach (a) done naively still buffers the full ZIP. A "streaming fix" that only changes how the response body is consumed but still calls `subarray` on the full content has zero memory benefit.

**Why it happens:**
ZIP format is not designed for single-pass streaming — the central directory is at the end of the file. A naive streaming fix that pipes the response through inflateRaw may work for uncompressed stores (compressionMethod === 0) but silently falls back to full-buffer for Deflate-compressed entries (the government uses Deflate). The developer sees "streaming" in the code and assumes memory is managed, without verifying which code path actually executes.

**How to avoid:**
- Instrument with `process.memoryUsage().heapUsed` BEFORE and AFTER the download step and AFTER the parse step separately. A real fix shows lower peak after the download step, not just after the parse step.
- The most reliable fix for this specific case: use `node-stream-zip` library (MIT license, no native dependencies) which reads ZIP entries without loading the full archive. Or restructure to stream the deflate data through inflateRaw directly from the response body without buffering the ZIP container — this works for single-entry ZIPs (which the government files are).
- Validate the fix against the siconv_proposta.csv.zip specifically (187MB), not the smaller siconv_emenda.csv.zip (few MB) which would mask the problem.

**Warning signs:**
- Memory peak logging shows the same MB value before and after the "streaming fix" is deployed.
- Memory peaks at the point of ZIP extraction (after download), not at CSV parsing rows.
- Peak is reduced for small files (emenda, proponentes ZIPs) but unchanged for the large file (proposta ZIP).

**Phase to address:** Phase 2 (memory optimization). Instrument first. Fix second. Verify against the actual large file, not synthetic tests.

---

### Pitfall 9: Cron Budget Consumed by Memory Optimization Changes

**What goes wrong:**
Switching from in-memory buffer parsing to a streaming approach for the ZIP download changes the I/O pattern: instead of downloading the full ZIP then parsing, download + parse interleave. The total elapsed time may increase even though memory usage drops, because the streaming pipeline adds readline + inflateRaw backpressure that wasn't present when the full buffer was pre-loaded. If the streaming fix adds 30-60 seconds to the proposta download step, `syncLeadsFromRepo()` now runs close to or past the 300-second cron limit, causing a timeout that cuts off BrasilAPI enrichment (STEP 8).

**Why it happens:**
The current sync has a guard: enrichment stops if `elapsed > 200000ms`. This guard exists precisely because earlier steps already consume ~200s of the 300s budget. A streaming download that takes longer (due to backpressure) eats into this headroom. The developer celebrates the memory win without timing the full run end-to-end.

**How to avoid:**
- Time each step of the sync BEFORE and AFTER the streaming fix. Log `[repo-sync] STEP 1 elapsed: Xms` at the end of each step.
- If streaming adds more than 20s to STEP 1, adjust the enrichment time budget guard accordingly: `elapsed > 180000` instead of `200000`.
- If the total sync runtime exceeds 250s in testing, consider pre-computing some filtering (e.g., the program filter) rather than streaming the full programa CSV each time.
- Never deploy a memory optimization without first running the full sync end-to-end on a manual trigger and checking the total `duration_ms` in the cron log.

**Warning signs:**
- After deploying the streaming fix, cron logs show 504 timeout on `sync-leads`.
- `stats.enriched_api` drops to 0 after the fix (enrichment is being skipped due to time budget exhaustion).
- `duration_ms` in `cron_sync_log` increases from ~230,000ms to >280,000ms after the streaming change.

**Phase to address:** Phase 2 (memory optimization) must include end-to-end timing verification before merging.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Deploying brand color tokens to `tailwind.config.ts` before migrating arbitrary hex values | Faster visual preview of new palette on semantic components | 229 arbitrary-value classes remain old palette; app appears half-refreshed in production | Never — batch the config change with all file migrations |
| Increasing Vercel function memory to 4GB instead of fixing the ZIP buffering | Eliminates OOM risk immediately | Higher function execution cost; does not fix the root cause; leaves a 1300MB spike that wastes cost | Only acceptable as a temporary emergency fix while the real fix is in progress — must be reversed |
| Using `IN ('vendedor')` filter for distribution without including `gestor_vendedor` role consideration | Simpler query | If any user is a `gestor_vendedor` who also handles leads, they are excluded from equalization | Check if any `gestor_vendedor` users exist; if not, the filter is currently safe but must be documented as a known gap |
| Round-robin without advisory lock | No external dependency needed | Race condition between cron and manual trigger causes uneven distribution | Never in production — advisory locks are free and native to PostgreSQL |
| Replacing ALL Tailwind standard colors with semantic tokens in a single PR | Consistent design system | Risk of missing edge cases in 424+ color class occurrences; a single missed class breaks visual consistency | Acceptable if the PR includes per-file visual review, not just find-and-replace |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `REGEXP_REPLACE` CNPJ normalization in distribution query | Applied on `vendedor_projetos.cnpj` only, not verifying `projetos_execucao.cnpj` is already clean | Before deploying: confirm `SELECT COUNT(*) FROM projetos_execucao WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` = 0 |
| Google Fonts CDN in `globals.css` | Updating font family names in Tailwind config without updating the `@import url(...)` in globals.css | Font changes require updating both files atomically; validate in Vercel preview |
| Vercel function memory configuration | Attempting to set `memory` in `vercel.json` for Next.js App Router routes | Cannot set per-route memory in `vercel.json` for Next.js — configure globally in Vercel dashboard under project Settings → Functions → Advanced Settings |
| `distributeUnassignedExecucao` called from cron AND from manual API | No deduplication guard | Wrap with `pg_advisory_lock(42)` or similar idempotency key; document the lock ID |
| NewsBanner localStorage key | Forgetting to bump `BANNER_VERSION` after visual changes | Add banner update as final checklist item in every deployment that touches user-visible UI |
| ZIP response body streaming | Piping `response.body` directly through Node.js `pipeline()` | `response.body` is a Web Streams API `ReadableStream`; requires `Readable.fromWeb(response.body)` to convert to Node.js `Readable` before piping through `createInflateRaw()` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `Buffer.from(await res.arrayBuffer())` for 187MB ZIP | 1300MB heap spike during STEP 1 of proposta sync | Stream the response body through inflateRaw without buffering the ZIP container | Always — every sync run peaks at 1300MB; Vercel Pro 2GB default provides headroom but wastes cost |
| N individual `UPDATE`/`INSERT` statements in distribution loop (one per CNPJ) | Distribution for 8,793 CNPJs takes 5-10s of cron budget | Batch with `INSERT ... SELECT` or `UPDATE ... FROM (VALUES (...))` for the entire assignment set | Immediately — the current loop-per-row pattern is already present in `distribute-execucao.ts` lines 75-96 |
| Distribution reading entire `vendedor_projetos` assignment history for count | Slow count query with REGEXP_REPLACE on every row | Index `vendedor_projetos(vendedor_id)` exists; add functional index if REGEXP_REPLACE becomes a bottleneck | At >50,000 rows in `vendedor_projetos`; currently safe but will degrade as CRM scales |
| Tailwind JIT scanning 15,500+ LOC TypeScript for class changes | No direct symptom — but if new brand classes are defined in `tailwind.config.ts` but never referenced in source, they are purged from the build | Always test production build (`next build`) locally after color token changes; check that new brand classes appear in `.next/static/css/*.css` | Every production build; developer may see the class in dev but it is purged in production |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `/api/execucao/distribute` accessible to coordenador role | Distribution changes lead ownership across the team — only gestor should initiate; the current route correctly restricts to `gestor` but the restriction comment is implicit | Add `// RESTRICTED: gestor only — distribution is an irreversible ownership change` at top of the route handler |
| Logo or brand assets served from an external CDN without fallback | If the CDN goes down, the app renders without brand identity — CNPJ logos, SVG assets | Store all brand assets in `public/` directory under version control, not on external CDNs |
| Brand colors accidentally making accessible-contrast elements inaccessible | If Projete brand colors include low-contrast combinations (e.g., light text on medium background), buttons or form labels become unreadable for visually impaired users | Run WCAG AA contrast check on all new color pair combinations before finalizing palette mapping |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Distribution UI shows "0 distribuídos" when all are already assigned (not an error) | Gestor thinks distribution is broken | Show "X já atribuídos, 0 novos" with a success indicator, not a neutral empty state |
| No confirmation step before triggering distribution | Gestor accidentally triggers redistribution, causing lead ownership changes that vendors are not expecting | Add a summary preview: "Isso vai distribuir 47 CNPJs entre 3 vendedores. Confirmar?" before executing |
| Brand refresh deployed without notifying active users | Users mid-session see layout shift or color flash on the next page navigation | Deploy during low-traffic hours (not 09:00-11:00 BRT); use NewsBanner to announce the change |
| Distributing execution leads to a vendedor who already owns those CNPJs in the approval pipeline but under a different context | Vendedor receives "new" leads they are already working — confusion about whether it is a duplicate or a new context | Surface a clear distinction in the execution tab: "Já em Aprovação" tag on CNPJs where `vendedor_projetos.codigo_programa` exists |

---

## "Looks Done But Isn't" Checklist

- [ ] **Lead distribution — CNPJ normalization:** Run `SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` before deploying distribution — must return 0.
- [ ] **Lead distribution — race condition:** Confirm `pg_advisory_lock` or equivalent is in place; simulate concurrent cron + manual trigger and verify single assignment result.
- [ ] **Lead distribution — equalization accuracy:** After first distribution run, query `SELECT u.nome, COUNT(DISTINCT pe.cnpj) FROM projetos_execucao pe JOIN vendedor_projetos vp ON vp.cnpj = pe.cnpj JOIN users u ON u.id = vp.vendedor_id GROUP BY u.nome` — verify counts are within 1 of each other across vendedores.
- [ ] **Design refresh — arbitrary colors:** Run `grep -r "bg-\[#\|text-\[#\|border-\[#" src/ | wc -l` after migration — must be 0 (or document intentional exceptions).
- [ ] **Design refresh — font loaded:** Open Vercel preview URL in incognito mode and confirm the new brand font renders (not fallback serif/sans-serif).
- [ ] **Design refresh — NewsBanner:** Clear localStorage in a browser tab and confirm banner appears with updated version and brand announcement.
- [ ] **Memory optimization — instrumented peak:** After deploying streaming fix, confirm Vercel function logs show heap peak < 600MB for the next cron run.
- [ ] **Memory optimization — timing unchanged:** Confirm `duration_ms` in `cron_sync_log` does not increase by more than 30s after the streaming fix.
- [ ] **Memory optimization — production build:** Run `next build` locally after any streaming/dependency changes; confirm no build errors related to Node.js stream APIs (Web Streams vs Node Streams compatibility).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong vendedor assigned to execution lead (CNPJ normalization miss) | MEDIUM | Identify affected CNPJs via audit query; gestor manually reassigns via existing `/api/leads/assign`; add CNPJ cleanup migration and redeploy |
| Double distribution run (race condition) | LOW | Identify CNPJs with multiple `vendedor_projetos` rows having different `vendedor_id`; gestor picks correct owner; add advisory lock and redeploy |
| Design refresh ships with mixed palette (arbitrary colors not migrated) | LOW | Run full migration in a follow-up PR; deploy immediately; users experience a brief mixed-palette period |
| Memory optimization breaks sync timing (504 timeout) | MEDIUM | Roll back the streaming change; restore `Buffer.from(arrayBuffer)` pattern; increase timing guard in STEP 8; investigate alternative streaming approach with proper timing |
| Cron function OOM kill (1300MB exceeds runtime limit) | HIGH | Immediately increase Vercel function memory to 4GB in dashboard as emergency; simultaneously begin the streaming fix; reverse the memory increase after fix is deployed and verified |
| Font not loading in production | LOW | Add font files to `public/fonts/` or verify CDN URL; redeploy; users see fallback font briefly |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CNPJ normalization mismatch in distribution (Pitfall 1) | Phase 1: Pre-distribution audit | `SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj != REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` = 0 |
| Race condition between cron and manual distribution (Pitfall 2) | Phase 1: Distribution implementation | `pg_advisory_lock` present in `distribute-execucao.ts`; `vercel.json` has sync-execucao exactly once |
| Wrong equalization baseline (approval vs execution count) (Pitfall 3) | Phase 1: Distribution design | Lead count query isolates execution context; post-distribution counts within ±1 across vendedores |
| Memory fix targets wrong code (Pitfall 4) | Phase 2: Memory optimization — instrument first | Per-step heap logging added; peak measured BEFORE fix to establish baseline for comparison |
| ZIP still buffered after "streaming" fix (Pitfall 5 = Pitfall 8) | Phase 2: Memory optimization — validate against large file | Memory peak after fix < 600MB when measured against `siconv_proposta.csv.zip` specifically |
| Streaming fix adds cron budget time (Pitfall 9) | Phase 2: Memory optimization — timing check | `duration_ms` in cron log does not exceed 260,000ms after fix |
| Arbitrary colors not migrated in brand refresh (Pitfall 5) | Phase 2: Design refresh — audit first | `grep -r "bg-\[#" src/ \| wc -l` = 0 after migration |
| Font not updated (Pitfall 6) | Phase 2: Design refresh — font change | Vercel preview incognito test shows correct brand font |
| NewsBanner not bumped (Pitfall 7) | Phase 2: Design refresh — final step | Banner version bumped; localStorage cleared test shows new banner content |

---

## Sources

- Direct codebase analysis (HIGH confidence):
  - `web/src/lib/distribute-execucao.ts` — distribution logic, CNPJ normalization, N-loop INSERT/UPDATE pattern
  - `web/src/app/api/cron/sync-execucao/route.ts` — cron + manual distribution trigger paths
  - `web/src/lib/repo-sync.ts` — `Buffer.from(await res.arrayBuffer())` at line 202 (confirmed memory root cause)
  - `web/src/lib/execucao-sync.ts` — step-by-step memory logging, 900MB guard at line 220
  - `web/tailwind.config.ts` — current `sigma.*` color palette (will be replaced)
  - `web/src/app/globals.css` — font imports (Space Grotesk + Inter)
  - Grep audit: 229 arbitrary color classes in 24 files; 424 standard Tailwind color references
  - `web/vercel.json` — confirmed dual `sync-leads` cron entries (potential double-distribution risk if sync-execucao is duplicated the same way)
- Vercel official documentation (HIGH confidence):
  - [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) — confirmed Pro/Enterprise max memory is 4 GB / 2 vCPU; default is 2 GB / 1 vCPU (not 1GB as noted in PROJECT.md — that was the legacy pre-2019-11-08 Pro default)
  - [Configuring Memory for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/memory) — memory cannot be set per-route in `vercel.json` for Next.js; must use dashboard
- Community patterns (MEDIUM confidence, verified against codebase):
  - PostgreSQL advisory locks for idempotent cron jobs — `SELECT pg_try_advisory_lock()` pattern
  - `Buffer.from(await res.arrayBuffer())` memory behavior for large files — confirmed by Node.js Streams documentation
  - Tailwind arbitrary value `bg-[#...]` classes not affected by theme config changes — confirmed by Tailwind v3 documentation behavior

---
*Pitfalls research for: v4.1 — Lead distribution, design refresh, memory optimization*
*Researched: 2026-03-30*
