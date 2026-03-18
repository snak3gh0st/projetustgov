# Pitfalls Research

**Domain:** CRM extension — government project execution tracking (Projetos em Execução tab)
**Researched:** 2026-03-18
**Confidence:** HIGH (primary source: direct codebase analysis + documented production incidents)

---

## Critical Pitfalls

### Pitfall 1: Sync Contamination — New Table Repeats the STEP 7c Mistake

**What goes wrong:**
The `projetos_execucao` table will be populated by a sync function that reads from `convenios`. If that sync uses an UPSERT without a precise conflict key, or if a status-inheritance step is added later without scoping by the correct grouping dimension, it will silently overwrite gestor annotations or produce the same cross-contamination bug that hit `vendedor_projetos` in March 2026.

**Why it happens:**
TransferênciaGov deletes and reinserts emendas when data is updated (documented in `.planning/debug/contacted-status-regression.md`). The same pattern applies to convênios: a `situacao` change on the government side may trigger a delete + reinsert in the Python ETL, which then presents as a new row in `convenios`. If the new sync does a full truncate-and-reload from `convenios`, any gestor state stored in `projetos_execucao` is wiped. If it uses UPSERT without a precise conflict key (e.g., only `cnpj` instead of `(cnpj, nr_convenio)`), daily syncs produce duplicate rows. The STEP 7c bug — missing `vendedor_id` scoping in the status-inheritance query — is the canonical example: a single missing filter clause caused cross-vendor status contamination for every cron run.

**How to avoid:**
- Use `ON CONFLICT (cnpj, nr_convenio) DO UPDATE` as the UPSERT key, never `ON CONFLICT (cnpj)` alone.
- Document in the sync function which fields are NEVER updated by the sync (the same discipline as `repo-sync.ts` lines 26-27: "NEVER updates: vendedor_id, status_contato, ...").
- If a status-inheritance step is added (analogous to STEP 7c), always scope it by the grouping dimension (e.g., gestor annotations should be scoped per `nr_convenio`, not per `cnpj`).
- Never truncate `projetos_execucao` in the sync — use UPSERT only.
- Write the sync as a separate function, not an extension of `syncLeadsFromRepo()`.

**Warning signs:**
- `projetos_execucao` row count changes unexpectedly after a cron run.
- Gestor overrides or annotations disappear after a sync.
- The same CNPJ appears more than once in the execution tab.
- `nr_convenio IS NULL` count in `projetos_execucao` grows after syncs.

**Phase to address:** Phase 1 (DB schema and sync design). The UPSERT key and the field-level update policy must be defined in writing before any sync code is written.

---

### Pitfall 2: Cross-Source Join Silently Drops Projects (NULL proposta_id)

**What goes wrong:**
The join path `convenios.proposta_id → propostas.transfer_gov_id → propostas.proponente_cnpj` is the bridge between the two data sources. The `schema.sql` defines `proposta_id VARCHAR` with no NOT NULL constraint and no foreign key. The existing `instruments/route.ts` uses `INNER JOIN propostas ON c.proposta_id = prop.transfer_gov_id` — if `proposta_id` is NULL or blank in a `convenios` row, the INNER JOIN silently drops that convênio. The execution tab will appear to be working (no errors) but will be missing legitimate "em execução" projects.

**Why it happens:**
The Python ETL populates `convenios.proposta_id` from the government spreadsheet. The linkage is not always present in the source data — some convênios exist before the proposta is formally linked. The API that already queries this join (`instruments/route.ts`) has accepted this silent loss because it is used in the lead detail page where users notice individual missing records. In the execution tab, which is a management view of all active projects, this silent loss is much more dangerous.

**How to avoid:**
- Before writing any API code, run this diagnostic: `SELECT COUNT(*) FROM convenios WHERE proposta_id IS NULL AND situacao ILIKE '%execu%'`. Document the count.
- If the count is >0, add a fallback join path: when `proposta_id IS NULL`, try matching via `proponentes.cnpj` directly (requires knowing the proponente CNPJ from a different column on `convenios` if it exists).
- Use `LEFT JOIN` for the `propostas` join, and log/count rows where `prop.transfer_gov_id IS NULL` in the sync stats.
- Add a `join_miss_count` field to sync log output so gestores can see how many convênios could not be linked.

**Warning signs:**
- A gestor reports a known "em execução" client that does not appear in the tab.
- Direct `SELECT COUNT(*) FROM convenios WHERE situacao ILIKE '%execu%'` returns more rows than the tab shows.
- `proposta_id IS NULL` count in `convenios` is non-zero.

**Phase to address:** Phase 1 (data audit) — run the diagnostic query before writing a single line of API code. Phase 2 (API design) must handle NULL `proposta_id` explicitly with a logged fallback.

---

### Pitfall 3: Financial Precision Loss — FLOAT in Old Schema vs. NUMERIC in CRM

**What goes wrong:**
`schema.sql` defines all financial columns in `convenios`, `propostas`, and `desembolsos` as `FLOAT` (e.g., `valor_global FLOAT`, `valor_desembolsado FLOAT`, `saldo_conta FLOAT`). The CRM tables (`vendedor_projetos`) use `NUMERIC(15,2)`. When the execution tab computes `percentual_execucao = (valor_desembolsado / valor_global) * 100`, FLOAT arithmetic produces values like `99.9999999...` or `100.00000001`. These render incorrectly in the UI, break `=100%` comparisons, and confuse gestores.

**Why it happens:**
The Python ETL that populated the old schema used Python `float` for all numeric fields. The CRM was built later with `NUMERIC(15,2)` as the correct type for financial data. The mismatch was never resolved because the old tables were not part of the CRM originally. Developers building the execution tab will query these existing columns and assume PostgreSQL handles the arithmetic correctly — it does, but in floating-point, not fixed-point.

**How to avoid:**
- Cast all financial fields from old tables to `NUMERIC(15,2)` at the point of query: `CAST(c.valor_global AS NUMERIC(15,2))`.
- Compute `percentual_execucao` entirely in PostgreSQL: `ROUND(CAST(c.valor_desembolsado AS NUMERIC(15,2)) / NULLIF(CAST(c.valor_global AS NUMERIC(15,2)), 0) * 100, 1)`.
- Never pass raw FLOAT values to JavaScript and compute percentages there — browser floating-point rendering is inconsistent.
- The new `projetos_execucao` table (if created as a materialized cache) must store all financial fields as `NUMERIC(15,2)`, not `FLOAT`.

**Warning signs:**
- Percentual shows values like `99.9999999%` or `100.0000001%`.
- A sum of desembolsos for a CNPJ differs from `convenios.valor_desembolsado` by fractional amounts.
- `ROUND(percentual, 1)` in JavaScript produces different results than `ROUND(percentual, 1)` in PostgreSQL for the same value.

**Phase to address:** Phase 2 (API query design). Establish the CAST-to-NUMERIC rule as a code review requirement for all queries in the execution tab.

---

### Pitfall 4: Role Gate Omitted on New Routes — Execution Intelligence Leaks to Vendedores

**What goes wrong:**
The existing middleware (`middleware.ts`) checks only whether a session exists, not the user's role. Role enforcement is opt-in per route via `getApiSession()` + role check. If the new `/execucao` page or `/api/execucao` route is created without explicitly checking for `gestor` or `coordenador` role, vendedores can access post-sale financial intelligence (saldo em conta, desembolso rates, execution percentages) for all clients — including clients they do not own.

**Why it happens:**
Every existing route does its own role check (e.g., `setup-crm/route.ts`: `if (!session || session.role !== 'gestor')`). There is no centralized role enforcement for new routes. A route added in a fast iteration omits the check, or only adds authentication (`if (!session)`) without authorization (`if (session.role !== ...)`). The middleware does not catch this.

**How to avoid:**
- Add `requireGestorOrCoordenador(session)` as a helper in `dal.ts` that returns a 401/403 response object if the role is wrong, so it can be called as the first line of any new route.
- The page server component (`/execucao/page.tsx`) must call `verifySession()` and redirect vendedores before rendering anything — do not rely solely on the API returning 403, because the page will briefly render before the redirect.
- Add a comment at the top of every new route file: `// RESTRICTED: gestor + coordenador only`.
- Test role enforcement explicitly: verify `GET /api/execucao` returns 403 for a vendedor session token, not 200.

**Warning signs:**
- A vendedor can navigate to `/execucao` without being redirected to `/login`.
- `GET /api/execucao` returns 200 or data (not 401/403) when called with a vendedor JWT.
- The page renders briefly before redirecting.

**Phase to address:** Phase 2 (route creation). The role gate must be added at the same moment the route is created, not as a follow-up task.

---

### Pitfall 5: CNPJ Normalization Mismatch Between Old ETL Tables and CRM

**What goes wrong:**
`vendedor_projetos` stores CNPJs as 14-digit zero-padded strings (enforced by `cleanCNPJ()` in `repo-sync.ts`). The old Python ETL that populated `proponentes`, `propostas`, and `convenios` may have stored CNPJs without zero-padding (e.g., `2931950001005` instead of `02931950001005`). When the execution tab joins `convenios` data with `lead_contacts` (keyed by `lead_cnpj` which is 14-digit) or with `vendedor_projetos`, the join silently fails. The execution tab shows a project with no contact information, or a project that cannot be linked to the CRM record the vendedor has been working.

**Why it happens:**
Python's `str(int(cnpj))` drops leading zeros. If the ETL did `str(int(row['cnpj']))` for normalization, CNPJs starting with zero were stored as 13-digit strings. There is no FK constraint between the old ETL tables and `vendedor_projetos`, so the mismatch exists silently in the database. The CRM's `cleanCNPJ()` always zero-pads, but the old tables were populated before the CRM existed.

**How to avoid:**
- Before writing any join query, run: `SELECT COUNT(*) FROM proponentes WHERE LENGTH(cnpj) < 14` and `SELECT COUNT(*) FROM propostas WHERE LENGTH(proponente_cnpj) < 14`. Document results.
- If any count is >0, run a one-time migration: `UPDATE proponentes SET cnpj = LPAD(cnpj, 14, '0') WHERE LENGTH(cnpj) < 14`.
- In all API queries that join across old and new tables, normalize on both sides: `LPAD(REGEXP_REPLACE(p.cnpj, '\D', '', 'g'), 14, '0')`.
- The join to `lead_contacts` must use the same 14-digit normalized key: `lc.lead_cnpj = LPAD(REGEXP_REPLACE(conv_cnpj, '\D', '', 'g'), 14, '0')`.

**Warning signs:**
- A CNPJ visible in `vendedor_projetos` has no match in the execution tab even though `convenios` has a record for that organization.
- `lead_contacts` data does not appear on execution tab entries for some CNPJs.
- Direct `SELECT * FROM proponentes WHERE cnpj = '02931950001005'` returns 0 rows but `cnpj = '2931950001005'` returns 1 row.

**Phase to address:** Phase 1 (data audit + DB migration). Fix CNPJ normalization before writing any cross-table join. This is a one-way door — if the join is built first and the migration comes later, some execution records will appear correct and others broken, making it hard to identify the scope of the problem.

---

### Pitfall 6: New Sync Pushes Vercel Cron Past 300-Second Limit

**What goes wrong:**
The existing `syncLeadsFromRepo()` runs for up to ~200 seconds (the cron endpoint has `maxDuration = 300`, and STEP 8 has an `elapsed < 200000` guard). If the execution sync is added as a new STEP inside the same cron function, it extends the total runtime past 300 seconds. Vercel kills the function with a 504. This leaves `projetos_execucao` partially updated — some CNPJs updated, others stale. The CRM lead sync may also be cut short.

**Why it happens:**
The convênio sync reads from `convenios` (already in Supabase, so no external download needed), but iterating over potentially thousands of convênios with per-row UPSERTs still adds 30-90 seconds. Combined with BrasilAPI enrichment in STEP 8, the total exceeds the Vercel Pro limit. Developers append new sync steps to the existing function because it is convenient and avoids a second `vercel.json` entry.

**How to avoid:**
- Create a **separate cron endpoint**: `/api/cron/sync-execucao` with its own `maxDuration = 300`.
- Schedule it at a different time in `vercel.json` (e.g., 13:30 UTC instead of 12:30 UTC) so it does not compete for the DB connection pool.
- The new sync function must include an elapsed-time guard (same pattern as STEP 8 in `repo-sync.ts`): stop processing if `Date.now() - startTime > 240000`.
- The two syncs share the same `getPool()` but must not assume the other is not running simultaneously.

**Warning signs:**
- Vercel cron logs show 504 on the sync endpoint.
- `projetos_execucao.updated_at` shows mixed timestamps — some from today, some stale.
- The lead sync cron begins cutting short (`stats.enriched_api` suddenly much lower than usual).

**Phase to address:** Phase 1 (architecture decision) — separate endpoints must be planned before the sync is written. Phase 3 (cron setup) — `vercel.json` update with the new entry.

---

### Pitfall 7: "Desembolso Negativo" Alert Logic Built on Literal Interpretation

**What goes wrong:**
The spec says "desembolso negativo = alerta, positivo = verificar saldo." In government data, `valor_desembolsado` is always a positive number (money transferred to the beneficiary). A literally negative value never occurs. If the implementation checks `valor_desembolsado < 0`, the alert badge never fires. Alternatively, if the developer guesses that "negativo" means "very low saldo_conta," they implement a threshold without asking the client what threshold is correct, leading to false positives (alerts on healthy projects) or false negatives (no alert on stalled projects).

**Why it happens:**
Government financial data uses domain-specific language where "negativo" often means "unfavorable business signal" rather than a negative number. Developers implement it literally without clarifying with the client. The `saldo_conta FLOAT` field in `convenios` can be very small (near zero) even for active projects in the early disbursement phase — using `saldo_conta < threshold` without understanding the business context fires false alerts.

**How to avoid:**
- Before writing the alert logic, ask the client to identify 3 convênios that should show "alerta" and 3 that are healthy. Inspect those records directly in the database to determine the distinguishing conditions.
- Document the confirmed business rule in the API route as a comment, referencing the client sign-off date.
- Use named constants: `const SALDO_ALERTA_THRESHOLD_BRL = 5000` — not magic numbers embedded in SQL.
- The alert and "verificar saldo" states should be mutually exclusive with a defined priority order (e.g., Alerta > Verificar Saldo > Normal).

**Warning signs:**
- The alert badge never appears for any project.
- The alert badge appears for all projects or for projects the gestor identifies as healthy.
- The alert logic produces different results depending on whether the calculation runs in JavaScript or PostgreSQL (floating-point issue compound with Pitfall 3).

**Phase to address:** Phase 2 (API) — but requires client confirmation of the business rule *before* the API is written. Do not ship the highlight logic as a guess.

---

### Pitfall 8: BrasilAPI Re-Enrichment Triggered for All New Execution CNPJs

**What goes wrong:**
When the execution sync identifies CNPJs not yet in `lead_contacts`, it may attempt to enrich them via BrasilAPI. If this logic is implemented naively (loop over all execution CNPJs and call BrasilAPI), it will re-trigger enrichment for CNPJs that are already in the `enrichment_queue` with status `done` or `no_data`. This causes unnecessary BrasilAPI calls, rate-limiting (403 responses), and extends the sync runtime into timeout territory.

**Why it happens:**
The existing `enrichment_queue` table (`repo-sync.ts` STEP 8) already tracks enrichment state per CNPJ with statuses: `pending`, `done`, `no_data`, `rate_limited`, `error`. New code that does not check this table will enqueue the same CNPJs again. BrasilAPI has rate limits (the existing system already handles 403 responses as `rate_limited` status), and ignoring the queue state means re-hitting those limits unnecessarily.

**How to avoid:**
- Before enqueuing any CNPJ from the execution sync, check the `enrichment_queue`: `INSERT INTO enrichment_queue (cnpj) ... ON CONFLICT (cnpj) DO NOTHING` — this pattern is already used in STEP 8a of `repo-sync.ts` and is safe to reuse.
- The execution sync should only enqueue CNPJs not already in `lead_contacts` AND not already in `enrichment_queue` with status `done`.
- Do not add enrichment logic inside the execution sync itself — let the existing lead sync's STEP 8 handle BrasilAPI enrichment. The execution tab will pick up contacts from `lead_contacts` which is populated by that existing pipeline.

**Warning signs:**
- BrasilAPI returns 403 (rate limit) more frequently than before the execution sync was deployed.
- `enrichment_queue` gains many `rate_limited` entries after the execution sync runs.
- Execution sync runtime increases significantly each day.

**Phase to address:** Phase 3 (cron sync implementation). Reuse the existing `enrichment_queue` pattern; do not create parallel enrichment logic.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing execution data as a database view over `convenios` instead of a dedicated table | No migration needed, no sync to maintain | Cannot store gestor annotations, override flags, or last-reviewed timestamps; view recalculates on every page load | Never — the spec requires gestor-specific state per convênio |
| Using FLOAT for financial calculations (reuse existing schema columns without casting) | No casting code in queries | Rounding errors in percentual display; inconsistent with `vendedor_projetos` NUMERIC columns | Never for any value shown to users |
| Adding role check only in the API, not in the page server component | Simpler page code | Page briefly renders before 403, leaking column headers and UI structure to vendedores | Never for sensitive intelligence views |
| Appending execution sync to the existing cron function instead of a separate endpoint | One less `vercel.json` entry | Risk of cascading timeout that kills both syncs; one failure disables all data freshness | Never — isolate syncs from day one |
| Building the proposta-convenio join without first auditing NULL `proposta_id` rate | Faster to build the join and test manually | Silent data gaps discovered only when gestores report missing projects in production | Never — run the diagnostic query first |
| Computing percentual and saldo alerts in JavaScript instead of PostgreSQL | Slightly simpler API response structure | Float precision bugs surface inconsistently per browser; logic is harder to test | Never for financial calculations |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `convenios → propostas` join | Using `INNER JOIN` when `proposta_id` may be NULL | Use `LEFT JOIN` with NULL handling; log join miss count in sync stats |
| `lead_contacts` join for contact display | Joining by raw CNPJ string without normalization | Always use `LPAD(REGEXP_REPLACE(cnpj, '\D', '', 'g'), 14, '0')` on both sides of the join |
| `desembolsos` table for disbursement history | Summing `desembolsos.valor_desembolsado` per convênio and comparing to `convenios.valor_desembolsado` | The `convenios` column is the running total; `desembolsos` rows are the audit trail. For the execution tab display, use `convenios.valor_desembolsado` directly; only query `desembolsos` if a timeline or trend chart is needed |
| Vercel cron (`vercel.json`) | Adding new cron path to the same entry object as the existing sync | Create a separate entry in the `crons` array with a different `path` and an offset time (not concurrent with lead sync) |
| NextAuth middleware | Assuming `middleware.ts` enforces role restrictions | Middleware only verifies session existence; role must be checked per-route via `getApiSession()` |
| `enrichment_queue` for new CNPJs | Enqueueing CNPJs without checking existing status | Use `INSERT ... ON CONFLICT (cnpj) DO NOTHING` — already established pattern in `repo-sync.ts` STEP 8a |
| `setup-crm` for new table creation | Adding the new table creation SQL at the bottom of `runSetup()` without idempotency guards | Use `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — every step must be idempotent |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Joining `convenios → propostas → proponentes → lead_contacts` without indexes | Query >2s, UI hangs on load | Index `convenios.proposta_id` and `propostas.proponente_cnpj` (check if they exist; `lead_contacts(lead_cnpj)` already exists) | Immediately with any meaningful dataset — no warm-up period |
| Aggregating `desembolsos` rows per CNPJ on every API call | Page loads slowly, DB connection pool exhausted | Pre-compute aggregates in the sync step; store as `total_desembolsado` in `projetos_execucao` | At ~500 convênios with 20+ desembolso rows each |
| Returning all execution projects without pagination | Browser hangs, API response too large | Add `LIMIT` + `OFFSET` pagination or cursor-based pagination from the first version | At ~200+ rows in the execution tab response |
| CNPJ normalization function (`LPAD(REGEXP_REPLACE(...))`) computed inline in every query | High CPU, no index usability | Normalize once in the sync step; store normalized CNPJ as a dedicated column in `projetos_execucao` | Immediately for any table without functional index on the expression |
| Pool exhaustion when cron runs simultaneously with peak user load | `connectionTimeoutMillis` errors, 500 responses | Keep pool `max: 5` (existing setting); ensure the execution sync releases its client in a `finally` block | When cron runs at 09:30 BRT and multiple gestores open the app simultaneously |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing `/api/execucao` without role check | Vendedores see post-sale intelligence (saldo em conta, execution %, client financial health) — dangerous if a vendedor leaves the company | Add `requireGestorOrCoordenador()` helper in `dal.ts`; use as the first statement in every new route handler for this feature |
| Showing exact `saldo_conta` values from government data | Reveals precise federal account balance; could be used to time payment pressure | Display rounded to nearest R$ 1,000 for the UI; keep exact value in DB for internal calculations |
| CNPJ path parameter not validated in new routes | Path traversal or injection via crafted CNPJ strings | Use the existing pattern from `instruments/route.ts`: `decodeURIComponent(params.cnpj)` + digits-only cleanup before any DB query |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing `0%` execution for a project that just started | Gestor assumes it is stalled when it is newly signed | Show `dias_em_execucao` alongside `percentual_execucao`; add a "Recente" badge for projects where `data_assinatura` is within the last 30 days |
| Aggregating all convênios for a CNPJ into a single row with only a total fomento count | Gestor cannot identify which specific convênio needs attention | Show per-convênio breakdown expandable from the CNPJ row; the big number is the count, the detail is in the expandable section |
| "Alerta" and "Verificar Saldo" states both showing for the same record | Contradictory UI signal — which action does the gestor take? | Mutually exclusive states with defined priority: Alerta > Verificar Saldo > Normal |
| No visible data freshness indicator | Gestor acts on data that is 2+ days old after a sync failure with no way to know | Show "Última sincronização: [timestamp]" derived from `cron_sync_log.ran_at` or `projetos_execucao.updated_at` in the tab header |
| Redirecting vendedores to `/login` instead of a "sem permissão" page | Vendedor thinks their session expired and logs in again, sees a confusing blank redirect loop | Redirect to a "403 — Acesso restrito" page with a link back to `/leads`, not to `/login` |

---

## "Looks Done But Isn't" Checklist

- [ ] **Role gate:** Verify `/execucao` returns 302 to a permission-denied page (not 200 and not `/login`) when a vendedor session is used — test both the page and the API endpoint separately.
- [ ] **CNPJ normalization:** Run `SELECT COUNT(*) FROM proponentes WHERE LENGTH(cnpj) != 14` and `SELECT COUNT(*) FROM propostas WHERE LENGTH(proponente_cnpj) != 14` — both must return 0 before release.
- [ ] **Financial precision:** Verify `percentual_execucao` shows `100.0%` (not `100.0000001%` or `99.9999999%`) for a convênio where `valor_desembolsado = valor_global`. Use a known test CNPJ from the database.
- [ ] **Join completeness:** Verify `SELECT COUNT(*) FROM convenios WHERE situacao ILIKE '%execu%'` equals the count of rows visible in the execution tab (accounting for any legitimate filter differences). A gap means silent join drops.
- [ ] **NULL proposta_id:** Confirm the sync log reports a `join_miss_count` for any convênios that could not be linked to a proposta — or confirm this count is 0.
- [ ] **Sync isolation:** Run the lead sync cron manually while the execution sync is running; verify both complete without pool timeout errors.
- [ ] **Alert logic:** Find one convênio the gestor identifies as problematic and confirm the alerta badge appears. Find one healthy project and confirm it does not appear. Both tests must pass with actual database records.
- [ ] **Idempotency:** Run the execution sync three times in a row; verify row count in `projetos_execucao` does not change after the first run, and verify no duplicate rows exist.
- [ ] **Contact join:** For at least 5 CNPJs in the execution tab, verify `lead_contacts` data (phone/email) appears correctly — test with CNPJs that have contacts and CNPJs that do not.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Sync contamination (wrong UPSERT key, data overwritten) | HIGH | Restore from Supabase point-in-time backup; re-run sync with corrected key; no CRM state to restore if new table has no gestor annotations yet — if it does, backup must precede any sync change |
| Cross-source join drops projects (NULL proposta_id) | MEDIUM | Add LEFT JOIN + fallback path; re-run sync; gestor must manually confirm previously-missing projects are now visible |
| Float rounding displayed in UI | LOW | Add `CAST(... AS NUMERIC(15,2))` to API queries; deploy; no data migration needed |
| Role gate missing, vendedores accessed the tab | LOW | Add role check immediately; audit Vercel logs for which vendedor IDs accessed the route; no data was mutated (read-only tab) |
| CNPJ normalization mismatch (contacts missing) | MEDIUM | Run normalization `UPDATE` on `proponentes.cnpj` and `propostas.proponente_cnpj`; no API code change needed if the join uses the LPAD expression |
| Cron timeout cascade, partial sync | LOW | Separate the syncs into independent endpoints; re-run the execution sync manually; no CRM state affected |
| BrasilAPI rate-limited from duplicate enrichment | LOW | Fix to use `ON CONFLICT DO NOTHING` pattern; `enrichment_queue` will automatically reset `rate_limited` on next cron run |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Sync contamination (Pitfall 1) | Phase 1: DB schema + sync design | UPSERT SQL reviewed and includes `(cnpj, nr_convenio)` conflict key; NEVER-UPDATE fields documented in code |
| Cross-source join gaps (Pitfall 2) | Phase 1: Data audit | `SELECT COUNT(*) FROM convenios WHERE proposta_id IS NULL AND situacao ILIKE '%execu%'` run and result documented; gap handling strategy confirmed |
| Financial precision loss (Pitfall 3) | Phase 2: API query design | All financial arithmetic uses `CAST(... AS NUMERIC(15,2))`; percentual verified on test CNPJ showing `100.0%` not `100.0000001%` |
| Role gate missing (Pitfall 4) | Phase 2: Route creation | `GET /api/execucao` returns 403 for vendedor session; `/execucao` page redirects vendedor to permission-denied page |
| CNPJ normalization mismatch (Pitfall 5) | Phase 1: Data audit + migration | `LENGTH(cnpj) != 14` count = 0 in `proponentes` and `propostas` before any join is built |
| Cron timeout cascade (Pitfall 6) | Phase 1: Architecture + Phase 3: Cron setup | Two separate `crons` entries in `vercel.json`; both complete within their `maxDuration` on consecutive manual runs |
| Alert logic inverted (Pitfall 7) | Phase 2: API + client sign-off | Written confirmation of alert thresholds from client; test case with known-problematic convênio triggers alert; known-healthy convênio does not |
| BrasilAPI re-enrichment (Pitfall 8) | Phase 3: Sync implementation | Execution sync uses `INSERT ... ON CONFLICT (cnpj) DO NOTHING` for enrichment queue; rate-limited count in `enrichment_queue` does not increase after execution sync runs |

---

## Sources

- Direct codebase analysis (HIGH confidence):
  - `web/src/lib/repo-sync.ts` — UPSERT discipline, STEP 7c, enrichment queue pattern
  - `web/src/app/api/setup-crm/route.ts` — schema setup, idempotency patterns
  - `web/schema.sql` — FLOAT vs NUMERIC mismatch, NULL constraints, existing indexes
  - `web/src/middleware.ts` — auth-only middleware, no role enforcement
  - `web/src/lib/dal.ts` — role helper patterns, existing lead access control
  - `web/src/app/api/leads/[cnpj]/instruments/route.ts` — existing INNER JOIN pattern that drops NULL proposta_id
  - `web/src/lib/db.ts` — connection pool `max: 5`, `statement_timeout: 30000`
- Production incidents (HIGH confidence — documented with commits and DB queries):
  - `.planning/debug/contacted-status-regression.md` — STEP 7c vendedor_id filter bug and fix (commit `9e20d04`)
  - `.planning/debug/commission-sales-flow.md` — FLOAT/precision issues in commission calculation, SaleModal parser fragility
  - `.planning/debug/comissoes-wellington-nao-aparecem.md` — CNPJ/vendedor ownership inconsistency, `updated_at` vs `fechamento_at` temporal filter bug
  - `.planning/debug/duplicate-lead-cnpj.md` — CNPJ deduplication failure (UPSERT key deficiency)

---
*Pitfalls research for: Projetos em Execução tab — v4.0 CRM extension on TransferênciaGov data*
*Researched: 2026-03-18*
