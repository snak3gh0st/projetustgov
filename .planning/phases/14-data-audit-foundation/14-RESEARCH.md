# Phase 14: Data Audit & Foundation - Research

**Researched:** 2026-03-18
**Domain:** PostgreSQL data integrity auditing, Supabase DDL, CNPJ normalization, table design
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-07 | Auditoria de dados previa: validar NULL proposta_id, CNPJ padding, join coverage | Diagnostic SQL queries documented; LPAD migration pattern verified from existing codebase |
| DATA-03 | Dados sao armazenados em tabela DB dedicada `projetos_execucao` (isolada do CRM) | Full CREATE TABLE DDL with NUMERIC(18,2), UNIQUE on nr_convenio, and required indexes |
</phase_requirements>

---

## Summary

Phase 14 is a pure data and schema phase — zero application code ships. It produces three artifacts: (1) a documented diagnostic result for NULL `proposta_id` values in `convenios` that determines whether Phase 15's ETL uses INNER JOIN or LEFT JOIN, (2) a confirmed CNPJ normalization state in `proponentes` (and a one-time LPAD migration if needed), and (3) the `projetos_execucao` table in Supabase with correct column types, UNIQUE constraint, and indexes.

The critical insight is that all three tasks are one-way doors. If NULL `proposta_id` scope is unknown when Phase 15 begins, the join strategy gets baked into the architecture and later discovered by gestores reporting missing projects — a defect that is hard to scope after the fact. If CNPJ normalization is not validated before any cross-table join is written, some contact links and CNPJ groupings will silently break for 13-digit CNPJs. If the table is created with FLOAT financial columns (matching the old schema pattern), precision errors get stored permanently and require a destructive migration to fix.

The research confirms that all three tasks are fully specified: the diagnostic SQL queries are deterministic, the LPAD migration is a single idempotent UPDATE, and the CREATE TABLE DDL is fully designed and ready to run. Phase 14 has zero novel unknowns — it is execution, not investigation.

**Primary recommendation:** Run diagnostics first (read-only), document the results in writing, then apply the CNPJ migration if needed, then create the table. This ordering means the DDL never needs to be rolled back due to a data surprise.

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| PostgreSQL (Supabase) | 15.x (managed) | Table creation, diagnostic queries, one-time migration | Project's primary DB — all existing tables live here |
| `pg` (node-postgres) | ^8.13.0 | Node.js PostgreSQL client used in scripts | Already installed; same client as all existing queries in `db.ts` |

### Supporting

| Tool | Purpose | When to Use |
|---|---|---|
| Supabase SQL Editor | Running DDL migration statements | One-time table creation — no deploy cycle required |
| Node.js script (`web/scripts/`) | Running diagnostic queries that print results | Consistent with existing pattern (e.g., `check42.mjs`, `diagnose-status.js`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Supabase SQL Editor for DDL | setup-crm route with CREATE TABLE | setup-crm route is designed for CRM tables with user seeding — a clean DDL file is simpler and safer for an isolated table |
| Node.js diagnostic scripts | psql CLI | Node.js scripts integrate with `db.ts` pool and can be committed as documentation artifacts; psql requires local DB connection config |

**Installation:** None. Zero new dependencies.

---

## Architecture Patterns

### Recommended Task Order

```
1. Diagnostic: NULL proposta_id count in convenios WHERE situacao ILIKE '%execu%'
2. Diagnostic: CNPJ length check in proponentes WHERE LENGTH(cnpj) < 14
3. Document both results in writing (as comments in the task or a short note)
4. Apply LPAD migration (conditional — only if COUNT > 0 in step 2)
5. CREATE TABLE projetos_execucao + indexes
6. Confirm: UPSERT conflict key and never-overwrite field list documented before Phase 15
```

### Pattern 1: Diagnostic Query — NULL proposta_id

**What:** A read-only COUNT query that determines whether the `convenios` table has any rows in "em execucao" state where the proposta join key is missing.

**When to use:** Must be run before any ETL join code is written. The result directly determines whether Phase 15 uses `INNER JOIN` or `LEFT JOIN propostas`.

**Example:**
```sql
-- Source: schema.sql, convenios table definition + instruments/route.ts join pattern
SELECT COUNT(*) AS total_em_execucao,
       SUM(CASE WHEN proposta_id IS NULL OR proposta_id = '' THEN 1 ELSE 0 END) AS null_proposta_id_count
FROM convenios
WHERE situacao ILIKE '%execu%';
```

**Interpretation:**
- If `null_proposta_id_count = 0`: Phase 15 may use `INNER JOIN` (but document this explicitly).
- If `null_proposta_id_count > 0`: Phase 15 MUST use `LEFT JOIN propostas` with a logged `join_miss_count` in sync stats. An INNER JOIN silently drops legitimate projects.

**Important note:** The existing `instruments/route.ts` uses `INNER JOIN propostas ON c.proposta_id = prop.transfer_gov_id` — this is the known silent-drop pattern this diagnostic is designed to detect and prevent from being repeated in the new ETL.

### Pattern 2: CNPJ Normalization Diagnostic + Migration

**What:** A COUNT query to detect 13-digit CNPJs in `proponentes`, followed by an idempotent LPAD UPDATE if any are found.

**When to use:** Must be run before any cross-table join is built in Phase 15 or Phase 16. The `lead_contacts` table uses 14-digit CNPJs (enforced by `cleanCNPJ()` in `repo-sync.ts`). Any 13-digit CNPJ in `proponentes` will silently fail to join.

**Example — Diagnostic:**
```sql
-- Source: schema.sql proponentes table + PITFALLS.md Pitfall 5
SELECT COUNT(*) AS total_proponentes,
       SUM(CASE WHEN LENGTH(cnpj) < 14 THEN 1 ELSE 0 END) AS short_cnpj_count,
       SUM(CASE WHEN LENGTH(cnpj) = 14 THEN 1 ELSE 0 END) AS correct_cnpj_count
FROM proponentes;
```

**Example — Migration (only if short_cnpj_count > 0):**
```sql
-- One-time migration: zero-pad all CNPJs shorter than 14 characters
-- Source: PITFALLS.md Pitfall 5 + existing cleanCNPJ() logic in repo-sync.ts
UPDATE proponentes
SET cnpj = LPAD(cnpj, 14, '0')
WHERE LENGTH(cnpj) < 14;
```

**Idempotency note:** Running this UPDATE multiple times is safe — LPAD of a 14-digit string to length 14 is a no-op.

### Pattern 3: CREATE TABLE projetos_execucao

**What:** The DDL to create the new isolated table with correct column types, UNIQUE constraint on `nr_convenio`, and indexes on `cnpj` and `situacao`.

**Key design decisions (locked — see STATE.md):**
- `NUMERIC(18,2)` for all financial columns — NOT FLOAT. Old schema uses FLOAT incorrectly; this table starts correctly.
- `UNIQUE` constraint on `nr_convenio` — this is the UPSERT conflict key for Phase 15. The constraint name follows project convention: `uq_projetos_execucao_nr_convenio`.
- Isolation from CRM tables — no foreign keys to `vendedor_projetos`. CNPJ is the join key at query time, not at the schema level.
- `synced_at` TIMESTAMPTZ — enables the data freshness indicator the UI requires.

**Example:**
```sql
-- Source: STACK.md database schema section + STATE.md Key Decisions
CREATE TABLE IF NOT EXISTS projetos_execucao (
  id SERIAL PRIMARY KEY,

  -- Convenio identity (from siconv_convenio.csv.zip)
  nr_convenio          VARCHAR(30)    NOT NULL,
  id_proposta          VARCHAR(30),
  situacao             VARCHAR(100),
  modalidade           VARCHAR(100),

  -- Proponent identity (from siconv_proposta.csv.zip via id_proposta join)
  cnpj                 VARCHAR(14)    NOT NULL,
  nome_proponente      VARCHAR(500),
  objeto               TEXT,
  uf                   VARCHAR(2),
  municipio            VARCHAR(200),

  -- Financial state — all NUMERIC(18,2), never FLOAT
  valor_global         NUMERIC(18,2),
  valor_repasse        NUMERIC(18,2),
  valor_desembolsado   NUMERIC(18,2),
  saldo_conta          NUMERIC(18,2),
  valor_empenhado      NUMERIC(18,2),

  -- Execution control
  data_assinatura      DATE,
  data_inicio_vigencia DATE,
  data_fim_vigencia    DATE,

  -- Computed at import time, refreshed daily
  pct_execucao         NUMERIC(6,2),
  dias_em_execucao     INTEGER,
  dias_ate_vencimento  INTEGER,

  -- Alert flags (business rule confirmed before Phase 16 — see STATE.md blockers)
  alerta_desembolso    BOOLEAN DEFAULT FALSE,
  verificar_saldo      BOOLEAN DEFAULT FALSE,

  -- Sync metadata
  synced_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  sync_run_id          INTEGER,

  CONSTRAINT uq_projetos_execucao_nr_convenio UNIQUE (nr_convenio)
);

-- Indexes for primary access patterns
CREATE INDEX IF NOT EXISTS ix_projetos_execucao_cnpj
  ON projetos_execucao(cnpj);

CREATE INDEX IF NOT EXISTS ix_projetos_execucao_situacao
  ON projetos_execucao(situacao);

CREATE INDEX IF NOT EXISTS ix_projetos_execucao_data_fim
  ON projetos_execucao(data_fim_vigencia)
  WHERE data_fim_vigencia IS NOT NULL;
```

### Pattern 4: UPSERT Key and Never-Overwrite Fields Documentation

**What:** Before Phase 15 begins, the UPSERT conflict key and the list of fields the sync must never overwrite must be committed to writing. This is not code — it is a documentation gate.

**Why it matters:** The STEP 7c production bug (commit `9e20d04`) was caused by a missing scope filter in a status-inheritance step. The canonical prevention is to document the UPSERT discipline at the schema level, before any sync code is written.

**Required documentation (to include in Phase 15 plan or code comment):**

| Policy | Value |
|--------|-------|
| UPSERT conflict key | `ON CONFLICT (nr_convenio) DO UPDATE` |
| NEVER use as conflict key alone | `cnpj` — causes duplicates when one CNPJ has multiple convenios |
| Fields updated on every sync | All financial columns, situacao, modalidade, synced_at, sync_run_id, computed columns |
| Fields NEVER overwritten by sync | None currently — projetos_execucao has no gestor-editable state in Phase 14-15. If gestor annotations are added later, document them here and guard in the UPSERT SET clause. |
| Truncation policy | NEVER truncate projetos_execucao. Use UPSERT only. |

### Anti-Patterns to Avoid

- **Anti-pattern: CREATE TABLE in setup-crm route.** The `setup-crm/route.ts` runs user seeding, commission config, and status migrations. Entangling a new data table in that route creates ordering dependencies and makes the DDL harder to review. Run the DDL directly in Supabase SQL Editor.
- **Anti-pattern: FLOAT for financial columns.** The existing `convenios`, `propostas`, and `desembolsos` tables all use `FLOAT`. Copying that pattern into `projetos_execucao` stores rounding errors permanently. `NUMERIC(18,2)` is the correct type.
- **Anti-pattern: UNIQUE(cnpj, nr_convenio) as the conflict key.** The UNIQUE constraint must be on `nr_convenio` alone. The `cnpj` is derived from the proposta join and could theoretically be updated (e.g., if a CNPJ normalization migration runs). `nr_convenio` is the stable government-assigned identifier.
- **Anti-pattern: Running the CNPJ migration without first documenting the count.** The diagnostic and migration must be treated as two separate, documented steps. "I ran an UPDATE" without recording the before/after counts is unverifiable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| CNPJ zero-padding | Custom string manipulation in TypeScript | PostgreSQL `LPAD(cnpj, 14, '0')` in a one-time UPDATE | The DB operation is atomic and idempotent; TypeScript iteration risks partial completion on timeout |
| Table creation | Dynamic DDL in application startup code | Static SQL run once in Supabase SQL Editor | Application-managed migrations cause ordering bugs; Supabase SQL Editor runs DDL in a single transaction |
| Diagnostic counting | Application-level loops over all convenios | Single-pass `COUNT(*) + SUM(CASE WHEN...)` SQL | DB-side aggregation is orders of magnitude faster and doesn't hold a connection open |

**Key insight:** This phase is entirely SQL and documentation — no TypeScript needed. All tasks can be validated with a follow-up SELECT confirming the expected state.

---

## Common Pitfalls

### Pitfall 1: NULL proposta_id Diagnostic Returns Zero — Skipping the LEFT JOIN Decision

**What goes wrong:** Developer runs the diagnostic, sees `null_proposta_id_count = 0`, and treats the INNER JOIN as safe forever. But the count is a point-in-time snapshot — future Python ETL runs may insert new convenios with NULL proposta_id. The architecture decision must be logged, not just the count.

**Why it happens:** The diagnostic result is treated as a permanent answer rather than a snapshot.

**How to avoid:** Document the count AND the decision in writing: "As of 2026-03-18, count = X. Phase 15 ETL uses LEFT JOIN with join_miss_count logging regardless, because the Python ETL can introduce NULL proposta_id values on future sync runs."

**Warning signs:** Phase 15 plan uses INNER JOIN without a documented rationale.

### Pitfall 2: CNPJ Migration Applied Without Verifying the proponentes UNIQUE Constraint

**What goes wrong:** `proponentes.cnpj` has a UNIQUE constraint (confirmed in `schema.sql` line 23: `cnpj VARCHAR(14) NOT NULL UNIQUE`). If two rows somehow have CNPJs that differ only in leading zeros (e.g., `2931950001005` and `02931950001005`), the LPAD UPDATE will produce a UNIQUE constraint violation.

**Why it happens:** The Python ETL normalization may have been inconsistent — some CNPJs zero-padded, others not — creating apparent duplicates after normalization.

**How to avoid:** Before running the LPAD UPDATE, run a pre-flight check:
```sql
-- Check for CNPJs that would collide after LPAD normalization
SELECT LPAD(cnpj, 14, '0') AS normalized, COUNT(*) AS cnt
FROM proponentes
WHERE LENGTH(cnpj) < 14
GROUP BY normalized
HAVING COUNT(*) > 1;
```
If this returns rows, resolve the duplicates before running the migration.

**Warning signs:** `UPDATE proponentes SET cnpj = LPAD(...)` raises a unique_violation error.

### Pitfall 3: Using the Wrong Column Name for nr_convenio

**What goes wrong:** The `convenios` table in `schema.sql` uses `transfer_gov_id` as its primary identifier (e.g., `"912345/2023"`), not `nr_convenio`. The new `projetos_execucao` table stores this as `nr_convenio` (matching the siconv CSV column name `NR_CONVENIO`). Phase 15 code that joins `projetos_execucao.nr_convenio` back to `convenios.transfer_gov_id` must account for this name mismatch.

**Why it happens:** The existing DB uses `transfer_gov_id` as a generic identifier across all ETL tables. The new table uses the government source's column name directly.

**How to avoid:** Document the column mapping at the schema level:
- `projetos_execucao.nr_convenio` = value from siconv CSV column `NR_CONVENIO`
- `convenios.transfer_gov_id` = same value, populated by the old Python ETL
- Join: `projetos_execucao.nr_convenio = convenios.transfer_gov_id`

### Pitfall 4: Running DDL in setup-crm Instead of Directly in Supabase

**What goes wrong:** Developer adds `CREATE TABLE IF NOT EXISTS projetos_execucao` to `setup-crm/route.ts`. The route also seeds users and resets commissions. Running setup-crm again for any reason re-executes idempotent but slow operations. The table creation gets coupled to user management.

**How to avoid:** Run the DDL directly in Supabase SQL Editor. Optionally add the CREATE TABLE to the end of `setup-crm/route.ts` with `IF NOT EXISTS`, but mark it clearly so future developers know which tables belong to which milestone.

---

## Code Examples

Verified patterns from codebase inspection and schema analysis:

### Full Diagnostic Query (run once, print and record results)

```sql
-- Source: schema.sql (convenios table), PITFALLS.md Pitfall 2 and 5
-- Phase 14 DATA-07 diagnostic — run in Supabase SQL Editor and record output

-- 1. NULL proposta_id in "em execucao" convenios
SELECT
  COUNT(*) AS total_em_execucao,
  SUM(CASE WHEN (proposta_id IS NULL OR proposta_id = '') THEN 1 ELSE 0 END) AS null_proposta_id,
  SUM(CASE WHEN (proposta_id IS NOT NULL AND proposta_id != '') THEN 1 ELSE 0 END) AS has_proposta_id
FROM convenios
WHERE situacao ILIKE '%execu%';

-- 2. CNPJ length distribution in proponentes
SELECT
  COUNT(*) AS total_proponentes,
  SUM(CASE WHEN LENGTH(cnpj) < 14 THEN 1 ELSE 0 END) AS short_cnpj,
  SUM(CASE WHEN LENGTH(cnpj) = 14 THEN 1 ELSE 0 END) AS correct_cnpj,
  SUM(CASE WHEN LENGTH(cnpj) > 14 THEN 1 ELSE 0 END) AS long_cnpj,
  MIN(LENGTH(cnpj)) AS min_len,
  MAX(LENGTH(cnpj)) AS max_len
FROM proponentes;
```

### CNPJ Pre-flight Collision Check

```sql
-- Source: PITFALLS.md Pitfall 2 + schema.sql proponentes UNIQUE constraint
-- Run before the LPAD migration to detect would-be UNIQUE violations
SELECT LPAD(cnpj, 14, '0') AS normalized_cnpj, COUNT(*) AS count
FROM proponentes
WHERE LENGTH(cnpj) < 14
GROUP BY normalized_cnpj
HAVING COUNT(*) > 1;
-- Expected result: 0 rows (no collisions)
```

### CNPJ One-Time Migration

```sql
-- Source: PITFALLS.md Pitfall 5 — apply only if short_cnpj count > 0
-- Safe to run multiple times (idempotent by definition)
UPDATE proponentes
SET cnpj = LPAD(cnpj, 14, '0')
WHERE LENGTH(cnpj) < 14;

-- Verify: should return 0
SELECT COUNT(*) FROM proponentes WHERE LENGTH(cnpj) < 14;
```

### Verification Query After Table Creation

```sql
-- Source: Supabase information_schema
-- Run after CREATE TABLE to confirm table, constraint, and indexes exist
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.numeric_precision,
  c.numeric_scale
FROM information_schema.columns c
WHERE c.table_name = 'projetos_execucao'
ORDER BY c.ordinal_position;

-- Verify UNIQUE constraint
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'projetos_execucao'::regclass;

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'projetos_execucao';
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Add "em execucao" columns to `vendedor_projetos` | Isolated `projetos_execucao` table | Prevents CRM lead count corruption and commission calculation pollution |
| FLOAT for financial columns (old Python ETL pattern) | NUMERIC(18,2) for all financial columns in new table | Eliminates accumulated rounding errors in percentage computations |
| INNER JOIN convenios→propostas (existing instruments route) | LEFT JOIN with logged join_miss_count (new ETL) | Makes data gaps visible instead of silently dropping records |
| CNPJ stored as-is from government source | LPAD(cnpj, 14, '0') normalization | Enables reliable cross-table joins with CRM tables that enforce 14-digit CNPJs |

**Deprecated/outdated:**
- `transfer_gov_id` naming for convenio identifier: The old ETL uses `transfer_gov_id` as the generic name. The new table uses `nr_convenio` matching the CSV source column. Both refer to the same value. Do not confuse them when writing Phase 15 join queries.

---

## Open Questions

1. **NULL proposta_id actual count in production**
   - What we know: The constraint on `convenios.proposta_id` is nullable (schema.sql line 134: `proposta_id VARCHAR` with no NOT NULL)
   - What's unclear: Whether the Python ETL has actually inserted any convenios in "em execucao" state with NULL proposta_id
   - Recommendation: Run the diagnostic query in Phase 14 task 1. The result determines whether Phase 15 uses INNER JOIN (count=0) or LEFT JOIN (count>0). Document whichever result emerges.

2. **CNPJ length distribution in proponentes**
   - What we know: The Python ETL may have used `str(int(cnpj))` which strips leading zeros. Schema.sql declares the column as `VARCHAR(14)` but has no CHECK constraint enforcing the length.
   - What's unclear: How many CNPJs are actually shorter than 14 characters
   - Recommendation: Run the diagnostic query in Phase 14 task 2. If count > 0, run the collision pre-flight check, then apply the LPAD migration. If count = 0, document that and move on.

3. **Whether projetos_execucao.nr_convenio values will match convenios.transfer_gov_id**
   - What we know: Both are populated from the same government source (`NR_CONVENIO` field in siconv CSVs). The old Python ETL stores this as `transfer_gov_id`. The new sync will store it as `nr_convenio`.
   - What's unclear: Whether the Python ETL applied any string transformation to the value (e.g., stripping slashes or year suffixes)
   - Recommendation: After Phase 15 populates the first batch of rows, verify with `SELECT pe.nr_convenio, c.transfer_gov_id FROM projetos_execucao pe JOIN convenios c ON pe.nr_convenio = c.transfer_gov_id LIMIT 10`. If the join fails, check for string format differences.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection, 2026-03-18)

- `web/schema.sql` — convenios table (lines 131-158): `proposta_id VARCHAR` nullable, all financials as FLOAT; proponentes table (lines 21-47): `cnpj VARCHAR(14) NOT NULL UNIQUE`
- `web/src/app/api/leads/[cnpj]/instruments/route.ts` — `INNER JOIN propostas ON c.proposta_id = prop.transfer_gov_id` (line 45): the silent-drop pattern this phase prevents
- `web/src/app/api/setup-crm/route.ts` — idempotent DDL pattern (`CREATE TABLE IF NOT EXISTS`, `DO $$ BEGIN ... END $$`) and CRM table structure
- `web/src/lib/repo-sync.ts` — `cleanCNPJ()` function: 14-digit enforcement; UPSERT discipline pattern (NEVER-UPDATE fields documented in comments)
- `.planning/research/SUMMARY.md` — Phase 1 rationale and confirmed pitfall list
- `.planning/research/STACK.md` — `projetos_execucao` DDL with NUMERIC(18,2) and all column definitions
- `.planning/research/PITFALLS.md` — Pitfall 2 (NULL proposta_id), Pitfall 5 (CNPJ normalization), exact diagnostic SQL queries
- `.planning/STATE.md` — Key Decisions: NUMERIC(18,2) locked; ON CONFLICT (nr_convenio) locked; LEFT JOIN with join_miss_count locked; data audit before ETL locked

### Secondary (MEDIUM confidence)

- Production incident: commit `9e20d04` (`fix: STEP 7c now consolidates contact status per vendor correctly`) — canonical example of UPSERT key precision failure; directly informs the nr_convenio-only conflict key decision

---

## Metadata

**Confidence breakdown:**
- Diagnostic SQL: HIGH — queries derived directly from schema.sql column definitions, no inference required
- CNPJ migration: HIGH — LPAD pattern from PITFALLS.md and cleanCNPJ() production code
- Table DDL: HIGH — column list from STACK.md, UNIQUE constraint from STATE.md locked decisions
- UPSERT key documentation: HIGH — STATE.md decision is locked; pattern from production incident

**Research date:** 2026-03-18
**Valid until:** Stable — PostgreSQL DDL and CNPJ normalization patterns do not change. Diagnostic results are point-in-time and will be captured in Phase 14 execution.
