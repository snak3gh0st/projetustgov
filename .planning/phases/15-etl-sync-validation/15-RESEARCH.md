# Phase 15: ETL Sync & Validation - Research

**Researched:** 2026-03-18
**Domain:** Node.js streaming ETL, ZIP+CSV parsing, PostgreSQL UPSERT, Vercel cron isolation
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Sistema importa dados de convenio do repo (filtro: situacao "em execucao") | `downloadAndStreamCSV` pattern from `repo-sync.ts` handles ZIP+CSV streaming; filter `situacao ILIKE '%execu%'` applied in `onRow` callback before buffering |
| DATA-02 | Sistema importa dados de proposta do repo (filtro: tipo "OSC") | Same streaming function; filter on `TIPO_INSTRUMENTO` (or modalidade column) inside `onRow` to limit the in-memory Map to OSC rows only; critical for 187MB file |
| DATA-04 | Cruzamento convenio x proposta via id_proposta com CNPJ do proponente | Two-pass in-memory join: stream proposta first building `Map<id_proposta, {cnpj, nome, ...}>`, then stream convenio and look up proposta Map for each matching row |
| DATA-05 | UPSERT incremental sem duplicar registros existentes (conflict key: cnpj + nr_convenio) | Confirmed from STATE.md: `ON CONFLICT (nr_convenio) DO UPDATE` — `nr_convenio` alone is the correct key; `cnpj` alone causes duplicates. UNIQUE constraint already exists in schema.sql |
| DATA-06 | Sync diario via cron endpoint dedicado, separado do sync de leads | Dedicated `/api/cron/sync-execucao/route.ts` with own `vercel.json` entry at offset time; `maxDuration = 300`; pattern mirrors existing `sync-leads/route.ts` exactly |
</phase_requirements>

---

## Summary

Phase 15 delivers the streaming ETL that populates `projetos_execucao` from two government CSV ZIPs and proves the data layer is correct before Phase 16 or 17 are built. The table exists (Phase 14 complete), the UPSERT key is locked (`ON CONFLICT (nr_convenio)`), and the join strategy is confirmed (LEFT JOIN with `join_miss_count` logging). Every tool needed already exists in `web/src/lib/repo-sync.ts` — the only work is assembling a new `execucao-sync.ts` that reuses those tools with different filters and a simpler sync scope (no CRM state, no BrasilAPI enrichment, no vendedor assignment).

The primary technical risk is memory: the proposta CSV is 187MB compressed. The mitigation is well-established — filter OSC rows inside the `onRow` streaming callback before adding any row to the in-memory Map, limiting the Map to the OSC subset. The existing `downloadAndStreamCSV` function in `repo-sync.ts` supports this pattern exactly. A two-pass fallback (first pass: collect needed `ID_PROPOSTA` values into a Set; second pass: stream proposta again and only build the Map for those IDs) is documented in ARCHITECTURE.md but is only needed if the OSC subset alone still exceeds Vercel's 1GB memory ceiling.

The second risk is Vercel cron isolation. The existing lead sync runs for up to ~250 seconds of the 300-second budget. Appending the execution sync to the same handler would cause 504 timeouts. The architecture decision is locked: a dedicated `/api/cron/sync-execucao` endpoint with its own `vercel.json` cron entry at a minimum 30-minute offset from the lead sync schedule.

**Primary recommendation:** Build `execucao-sync.ts` using the exact function signatures from `repo-sync.ts` (`downloadAndStreamCSV`, `cleanCNPJ`, `parseBRNumber`, `fixText`), validate with a one-off Node.js script before wiring the cron, and verify idempotency by running the sync twice and confirming identical row counts.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib: `Readable`, `createInflateRaw`, `createInterface` | Built-in | ZIP download + streaming CSV deflate + line parsing | Already production-proven in `repo-sync.ts` for all siconv files; no external parser needed |
| `pg` (node-postgres) | ^8.13.0 | PostgreSQL UPSERT into `projetos_execucao` | Existing pool singleton in `db.ts`; `max: 5` connections; `statement_timeout: 30000` |
| Next.js 14 App Router | ^14.2.0 | Cron endpoint `/api/cron/sync-execucao/route.ts` | Existing framework; cron pattern identical to `sync-leads/route.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cleanCNPJ` from `repo-sync.ts` | — | Normalize CNPJ to 14-digit zero-padded string | Apply to every `CNPJ_PROPONENTE` value from proposta CSV before storing |
| `parseBRNumber` from `repo-sync.ts` | — | Parse Brazilian numeric format ("1.234,56" -> 1234.56) | Apply to all financial fields from both CSVs |
| `fixText` from `repo-sync.ts` | — | Fix `?` encoding artifacts in governo CSV text | Apply to `nome_proponente`, `objeto`, `situacao` fields |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `downloadAndStreamCSV` from `repo-sync.ts` | Write a new download function | Identical problem already solved with retry logic, timeout, and BOM handling; no justification for duplication |
| In-memory join (proposta Map + convenio stream) | SQL JOIN via existing `convenios`/`propostas` tables | ARCHITECTURE.md recommends reading from CSV sources directly to get the latest government data; the DB tables may be 24h stale relative to the CSV ZIP |
| Filter OSC inside `onRow` callback | Load all 187MB then filter | OOM risk on Vercel 1GB serverless limit; early-return in `onRow` costs only the row-parse overhead |
| Separate cron endpoint | Append to existing `sync-leads` handler | Lead sync consumes ~250s; appending causes 504 timeouts confirmed in STATE.md |

**Installation:** None. Zero new dependencies.

---

## Architecture Patterns

### Recommended File Structure

```
web/src/
├── lib/
│   └── execucao-sync.ts          NEW — ETL function syncProjetosExecucao()
├── app/
│   └── api/
│       └── cron/
│           └── sync-execucao/
│               └── route.ts      NEW — cron endpoint
web/scripts/
└── test-execucao-sync.mjs        NEW — one-off validation script (not committed to cron)
```

### Pattern 1: Two-Step In-Memory Join

**What:** Stream siconv_proposta first (OSC-only filter), build `propostaMap: Map<id_proposta, PropostaInfo>`. Then stream siconv_convenio (em-execucao filter), look up `propostaMap` per row, compute fields, upsert into `projetos_execucao`.

**When to use:** Whenever two government CSVs must be joined without SQL — the convenio CSV does not contain the proponent CNPJ, which lives in the proposta CSV.

**Key CSV columns (verified from STATE.md and ARCHITECTURE.md):**

Proposta CSV (`siconv_proposta.csv.zip`) relevant columns:
- `ID_PROPOSTA` — join key
- `CNPJ_PROPONENTE` — proponent CNPJ (raw, needs `cleanCNPJ`)
- `NM_PROPONENTE` — organization name (needs `fixText`)
- `OBJETO_PROPOSTA` — project object/description
- `TIPO_INSTRUMENTO` or `MODALIDADE_PROGRAMA` — OSC filter target
- `UF_PROPONENTE` — state
- `MUNICIPIO_PROPONENTE` — city

Convenio CSV (`siconv_convenio.csv.zip`) relevant columns:
- `NR_CONVENIO` — UPSERT conflict key (maps to `projetos_execucao.nr_convenio`)
- `ID_PROPOSTA` — foreign key to proposta
- `SITUACAO_CONVENIO` — filter for "em execucao"
- `MODALIDADE` — instrument type
- `VL_GLOBAL_CONV` — global value
- `VL_REPASSE_CONV` — transfer value
- `VL_DESEMBOLSADO_CONV` — cumulative disbursed
- `VL_SALDO_CONTA_CORRENTE` — account balance
- `VL_EMPENHADO_CONV` — committed value
- `DT_ASSINATURA_CONV` — signature date
- `DT_INICIO_VIGENCIA` — start date
- `DT_FIM_VIGENCIA` — end date

**Note:** The exact CSV column names must be verified during execution by inspecting the first row of each CSV. Government CSV headers can change between versions. The `_parseZipBuffer` in `repo-sync.ts` trims BOM and whitespace from headers automatically.

**Example structure:**

```typescript
// Source: ARCHITECTURE.md Pattern 2 + repo-sync.ts streaming pattern
export async function syncProjetosExecucao(): Promise<ExecucaoSyncStats> {
  const startTime = Date.now()

  // STEP A: Stream proposta CSV (187MB), keep only OSC
  const propostaMap = new Map<string, PropostaInfo>()
  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    const tipo = (row.TIPO_INSTRUMENTO || row.MODALIDADE_PROGRAMA || '').toLowerCase()
    if (!tipo.includes('osc')) return   // discard non-OSC early
    const cnpj = cleanCNPJ(row.CNPJ_PROPONENTE)
    if (!cnpj) return
    propostaMap.set(row.ID_PROPOSTA, {
      cnpj,
      nome_proponente: fixText(row.NM_PROPONENTE) || null,
      objeto: row.OBJETO_PROPOSTA || null,
      uf: row.UF_PROPONENTE || null,
      municipio: row.MUNICIPIO_PROPONENTE || null,
    })
  })

  // STEP B: Stream convenio CSV (15MB), filter "em execucao", join, upsert
  let joinMissCount = 0
  const records: ExecucaoRecord[] = []
  await downloadAndStreamCSV(CONVENIO_URL, (row) => {
    const situacao = (row.SITUACAO_CONVENIO || '').toLowerCase()
    if (!situacao.includes('execu')) return  // discard early
    const proposta = propostaMap.get(row.ID_PROPOSTA)
    if (!proposta) { joinMissCount++; return }  // LEFT JOIN with count
    const now = Date.now()
    const dataInicio = row.DT_INICIO_VIGENCIA ? new Date(row.DT_INICIO_VIGENCIA) : null
    const dataFim = row.DT_FIM_VIGENCIA ? new Date(row.DT_FIM_VIGENCIA) : null
    const valorRepasse = parseBRNumber(row.VL_REPASSE_CONV)
    const valorDesembolsado = parseBRNumber(row.VL_DESEMBOLSADO_CONV)
    records.push({
      nr_convenio: row.NR_CONVENIO,
      id_proposta: row.ID_PROPOSTA,
      situacao: fixText(row.SITUACAO_CONVENIO),
      modalidade: fixText(row.MODALIDADE),
      ...proposta,
      valor_global: parseBRNumber(row.VL_GLOBAL_CONV),
      valor_repasse: valorRepasse,
      valor_desembolsado: valorDesembolsado,
      saldo_conta: parseBRNumber(row.VL_SALDO_CONTA_CORRENTE),
      valor_empenhado: parseBRNumber(row.VL_EMPENHADO_CONV),
      data_assinatura: row.DT_ASSINATURA_CONV || null,
      data_inicio_vigencia: row.DT_INICIO_VIGENCIA || null,
      data_fim_vigencia: row.DT_FIM_VIGENCIA || null,
      pct_execucao: valorRepasse > 0
        ? Math.round((valorDesembolsado / valorRepasse) * 10000) / 100
        : null,
      dias_em_execucao: dataInicio
        ? Math.floor((now - dataInicio.getTime()) / 86_400_000)
        : null,
      dias_ate_vencimento: dataFim
        ? Math.floor((dataFim.getTime() - now) / 86_400_000)
        : null,
      alerta_desembolso: valorDesembolsado < 0,
      verificar_saldo: valorDesembolsado > 0 && parseBRNumber(row.VL_SALDO_CONTA_CORRENTE) > 0,
    })
  })

  // STEP C: Bulk upsert
  // ... client.query(UPSERT_SQL, values) per record
  // ... log join_miss_count to cron_sync_log
}
```

### Pattern 2: UPSERT with Correct Conflict Key

**What:** Every row inserted uses `ON CONFLICT (nr_convenio) DO UPDATE` — never `ON CONFLICT (cnpj)` alone. The `nr_convenio` is the stable government identifier for a single convênio. One CNPJ may have many convênios — using CNPJ as conflict key would merge them into one row.

**Fields that update on every sync:** All data columns, `synced_at`, `sync_run_id`.
**Fields that NEVER need to survive across syncs:** None currently — `projetos_execucao` has no gestor-editable state in Phase 15. Alert flags (`alerta_desembolso`, `verificar_saldo`) are computed from source data on each sync, not manually set.

**UPSERT SQL pattern:**

```sql
-- Source: STATE.md locked decision + repo-sync.ts STEP 7 UPSERT pattern
INSERT INTO projetos_execucao (
  nr_convenio, id_proposta, situacao, modalidade,
  cnpj, nome_proponente, objeto, uf, municipio,
  valor_global, valor_repasse, valor_desembolsado, saldo_conta, valor_empenhado,
  data_assinatura, data_inicio_vigencia, data_fim_vigencia,
  pct_execucao, dias_em_execucao, dias_ate_vencimento,
  alerta_desembolso, verificar_saldo,
  synced_at, sync_run_id
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW(),$24)
ON CONFLICT (nr_convenio) DO UPDATE SET
  id_proposta          = EXCLUDED.id_proposta,
  situacao             = EXCLUDED.situacao,
  modalidade           = EXCLUDED.modalidade,
  cnpj                 = EXCLUDED.cnpj,
  nome_proponente      = EXCLUDED.nome_proponente,
  objeto               = EXCLUDED.objeto,
  uf                   = EXCLUDED.uf,
  municipio            = EXCLUDED.municipio,
  valor_global         = EXCLUDED.valor_global,
  valor_repasse        = EXCLUDED.valor_repasse,
  valor_desembolsado   = EXCLUDED.valor_desembolsado,
  saldo_conta          = EXCLUDED.saldo_conta,
  valor_empenhado      = EXCLUDED.valor_empenhado,
  data_assinatura      = EXCLUDED.data_assinatura,
  data_inicio_vigencia = EXCLUDED.data_inicio_vigencia,
  data_fim_vigencia    = EXCLUDED.data_fim_vigencia,
  pct_execucao         = EXCLUDED.pct_execucao,
  dias_em_execucao     = EXCLUDED.dias_em_execucao,
  dias_ate_vencimento  = EXCLUDED.dias_ate_vencimento,
  alerta_desembolso    = EXCLUDED.alerta_desembolso,
  verificar_saldo      = EXCLUDED.verificar_saldo,
  synced_at            = NOW(),
  sync_run_id          = EXCLUDED.sync_run_id
```

### Pattern 3: Cron Endpoint — Isolated from Lead Sync

**What:** A separate Next.js route at `/api/cron/sync-execucao/route.ts` with `maxDuration = 300` and its own `vercel.json` entry. Auth pattern identical to `sync-leads/route.ts`: cron secret header OR gestor session for manual trigger.

**vercel.json addition (at minimum 30-minute offset from lead sync):**

```json
{
  "crons": [
    { "path": "/api/cron/sync-leads",   "schedule": "30 12 * * *" },
    { "path": "/api/cron/sync-leads",   "schedule": "0 18 * * *"  },
    { "path": "/api/cron/sync-execucao","schedule": "0 13 * * *"  }
  ]
}
```

The 13:00 UTC slot is 30 minutes after the 12:30 UTC lead sync. The DB connection pool (`max: 5`) is fully released by `syncLeadsFromRepo()` before the execution sync begins.

**Route template:**

```typescript
// Source: web/src/app/api/cron/sync-leads/route.ts — mirror exactly
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || session.role !== 'gestor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const stats = await syncProjetosExecucao()
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
```

### Pattern 4: One-Off Test Script for Row Count Validation

**What:** A `web/scripts/test-execucao-sync.mjs` script that calls `syncProjetosExecucao()` directly (not via HTTP), then runs a validation SQL query comparing `projetos_execucao` row count against a direct count from the `convenios` source table filtered by the same criteria.

**Validation query:**

```sql
-- Expected: counts should match (adjusting for join_miss_count)
-- Source count (from old Python ETL tables):
SELECT COUNT(*) FROM convenios WHERE situacao ILIKE '%execu%';

-- ETL result count:
SELECT COUNT(*) FROM projetos_execucao;

-- Idempotency check: run sync twice, counts must be equal
-- Duplicate check:
SELECT nr_convenio, COUNT(*) FROM projetos_execucao
GROUP BY nr_convenio HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

**Note on expected row count difference:** The count from `convenios` (old Python ETL table) may be higher than `projetos_execucao` if `join_miss_count > 0` (convenios with no proposta match in the CSV). The difference must equal `join_miss_count`. Document this as a success criterion in the test script output.

**Important note on column names:** The siconv CSV headers may differ between the old Python ETL (which named them `transfer_gov_id`, `proposta_id`, `situacao`) and the new CSV download. The test script must print the actual CSV headers on first run so column name mapping can be confirmed before the UPSERT logic is written. Add a debug flag: `console.log('[test] CSV headers:', headers)` before filtering.

### Anti-Patterns to Avoid

- **Anti-pattern: Load all proposta rows into the Map before filtering.** The proposta file is 187MB. Filter on `TIPO_INSTRUMENTO` (or whichever column identifies OSC) inside the `onRow` callback with early `return`. Never buffer all rows and filter afterward.
- **Anti-pattern: Call `syncProjetosExecucao()` from within `syncLeadsFromRepo()`.** The two functions must be fully independent. Sharing a long-running DB client or calling one from the other risks pool exhaustion and cascading timeout failures.
- **Anti-pattern: Use `ON CONFLICT (cnpj)` alone.** One CNPJ has multiple convênios. This conflict key merges them into a single row, destroying data. The conflict key is `nr_convenio` — the unique government convênio identifier.
- **Anti-pattern: Truncate `projetos_execucao` before each sync.** Use UPSERT. Truncation destroys `synced_at` timestamps and any future gestor annotations. The UPSERT with `ON CONFLICT` is idempotent by design.
- **Anti-pattern: Log `join_miss_count` only to console.** The count must be persisted to `cron_sync_log` (or the response stats) so gestores can see how many convenios were dropped. Silent loss is the risk being guarded against.
- **Anti-pattern: Wire the cron before the one-off test script passes.** The cron endpoint is Step 2 of the plan; the test script runs first in Step 1. This ensures the sync produces correct data before it runs on a daily automated schedule.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP download + deflate + CSV stream | Custom fetch + unzip + parse | `downloadAndStreamCSV` from `repo-sync.ts` | Already handles retry (3 attempts), 120s timeout, BOM stripping, deflate vs. stored compression modes, semicolon-delimited parsing — all edge cases production-proven |
| Brazilian number parsing | `parseFloat(val.replace(',', '.'))` | `parseBRNumber` from `repo-sync.ts` | The government CSVs use period-as-thousands-separator (`1.234,56`) which breaks naive `parseFloat`; `parseBRNumber` handles this correctly |
| CNPJ normalization | `val.replace(/\D/g, '').padStart(14, '0')` inline | `cleanCNPJ` from `repo-sync.ts` | Also validates minimum length (11 chars) and returns null for invalid CNPJs, preventing corrupt data |
| Text encoding fixes | Manual `replace()` calls | `fixText` from `repo-sync.ts` | Contains a comprehensive mapping of `?`-artifact government CSV encoding bugs that took months to identify in production |
| PostgreSQL connection pool | New `new Pool()` | `getPool()` from `db.ts` | Same pool singleton; avoids exceeding `max: 5` connection limit when cron runs concurrently with user traffic |

**Key insight:** Every utility needed already exists in `repo-sync.ts`. The task is to write a new function that orchestrates them with execucao-specific filters, not to rebuild the infrastructure.

---

## Common Pitfalls

### Pitfall 1: OSC Filter Column Name Unknown Until Runtime

**What goes wrong:** The proposta CSV column that distinguishes OSC from non-OSC instruments is not definitively confirmed. ARCHITECTURE.md references `TIPO_INSTRUMENTO` and `MODALIDADE_PROGRAMA` as candidates. If the wrong column is used, all rows pass the filter (loading 187MB into the Map) or all rows fail (empty Map, zero rows inserted).

**Why it happens:** The siconv CSV header names are not formally documented and may differ between the proposta CSV and the convenio CSV. The existing `repo-sync.ts` uses `siconv_proposta.csv.zip` for something different (proponentes data) and does not inspect the proposta-instrument CSV.

**How to avoid:** In the test script's first run, print the raw headers from both CSV files before any filtering:
```typescript
// Debug: print first 5 rows to discover column names
let debugRows = 0
await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
  if (debugRows++ < 3) console.log('[DEBUG headers]', Object.keys(row))
  // ... rest of filter
})
```
Confirm the OSC filter column before committing the production filter logic.

**Warning signs:** `propostaMap.size === 0` after streaming proposta CSV, OR `propostaMap.size` equals the total row count of the proposta CSV (no filtering occurred).

### Pitfall 2: Financial Column Names May Differ Between CSV and STATE.md Estimates

**What goes wrong:** The financial column names used in the research documents (`VL_GLOBAL_CONV`, `VL_REPASSE_CONV`, `VL_DESEMBOLSADO_CONV`, `VL_SALDO_CONTA_CORRENTE`) are derived from ARCHITECTURE.md estimates, not from live CSV inspection. If any column name differs, `parseBRNumber(row.VL_GLOBAL_CONV)` returns 0 for every row, silently storing `0.00` in all financial columns.

**Why it happens:** Government CSV headers are not versioned or formally documented. Column names can change between releases.

**How to avoid:** The test script must print actual CSV headers from the convenio file on first run (same debug pattern as Pitfall 1). Cross-reference with `parseBRNumber` results: if a financial column that should be non-zero returns 0 for all rows, the column name mapping is wrong.

**Warning signs:** All `valor_global`, `valor_desembolsado`, etc. in `projetos_execucao` are `0.00` after the test run.

### Pitfall 3: Date Format in Siconv CSVs May Not Be ISO 8601

**What goes wrong:** Brazilian government CSVs historically use `DD/MM/YYYY` date format, not `YYYY-MM-DD`. Passing `row.DT_INICIO_VIGENCIA` directly to PostgreSQL as a DATE parameter may fail or insert incorrect dates if the format is not handled.

**Why it happens:** The existing `repo-sync.ts` does not process date columns (the lead sync does not need dates). There is no established `parseDate` helper in the project.

**How to avoid:** In the test script, log raw date values from the first few rows:
```typescript
console.log('[DEBUG] date sample:', row.DT_INICIO_VIGENCIA, row.DT_FIM_VIGENCIA)
```
If the format is `DD/MM/YYYY`, add a parser:
```typescript
function parseBRDate(val: string | null | undefined): string | null {
  if (!val || !val.trim()) return null
  const parts = val.trim().split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`  // DD/MM/YYYY -> YYYY-MM-DD
  return val  // assume already ISO if not slashed
}
```
Apply to all date columns before UPSERT. Pass as a string — `pg` driver handles ISO date strings correctly.

**Warning signs:** PostgreSQL errors on date parameter binding, or dates in `projetos_execucao` are wildly incorrect (e.g., year 0001 or very far future).

### Pitfall 4: `downloadAndStreamCSV` Buffers the Full ZIP Into Memory

**What goes wrong:** Looking at `repo-sync.ts` lines 200-206, `downloadAndStreamCSV` calls `res.arrayBuffer()` which loads the entire ZIP into a `Buffer` before parsing. For the 15MB convenio file this is fine. For the 187MB proposta file, this means 187MB is loaded into Node.js heap before a single row is filtered — approximately 187MB of compressed data, which inflates to potentially 1-2GB uncompressed in `_parseZipBuffer`.

**Why it happens:** The existing implementation buffers the full ZIP for simplicity. It was designed for files up to ~50MB. The 187MB proposta file is 4x larger than any file the system has previously handled.

**How to avoid:** The `onRow` early-return filter (returning from the callback before adding to any Map) does reduce the Map's memory footprint to OSC-only rows, but the raw ZIP decompression still happens in memory. Measure peak memory in the test script. If the process runs out of memory, implement the two-pass approach:
- Pass 1: Stream convenio, collect all `ID_PROPOSTA` values for "em execucao" rows into a `neededIds: Set<string>`.
- Pass 2: Stream proposta, skip rows where `ID_PROPOSTA` not in `neededIds`. This limits proposta processing to only the needed subset.

This two-pass approach requires downloading the convenio CSV twice (or caching it) — document this trade-off if implemented.

**Warning signs:** Test script crashes with `ENOMEM` or Vercel function killed with out-of-memory error. Monitor `process.memoryUsage().heapUsed` before and after proposta streaming in the test script.

### Pitfall 5: join_miss_count Not Persisted to cron_sync_log

**What goes wrong:** The current `cron_sync_log` schema (confirmed in `schema.sql` lines 225-233) has only: `id`, `ran_at`, `inserted`, `updated`, `errors`, `duration_ms`. It does NOT have a `join_miss_count` column. If the sync stats include `join_miss_count` but the log table does not have that column, the value is silently discarded.

**Why it happens:** The `cron_sync_log` table was designed for the lead sync which has no join-miss concept. Phase 15 introduces a new observable: how many convenios could not be matched to an OSC proposta.

**How to avoid:** Before writing the cron endpoint, add `join_miss_count` to `cron_sync_log`:
```sql
ALTER TABLE cron_sync_log ADD COLUMN IF NOT EXISTS join_miss_count INT NOT NULL DEFAULT 0;
ALTER TABLE cron_sync_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'sync-leads';
```
The `source` column allows distinguishing lead-sync entries from execucao-sync entries in the same table. Alternatively, create a separate `cron_sync_log_execucao` table — but the simpler approach is adding columns to the existing table with `IF NOT EXISTS` guards.

The `syncProjetosExecucao()` function must write one row to `cron_sync_log` at the end of each run, whether invoked via the test script or the cron endpoint.

**Warning signs:** `SELECT * FROM cron_sync_log ORDER BY ran_at DESC LIMIT 5` shows no entries after the sync runs, or entries with `join_miss_count = 0` even when console logs show non-zero join misses.

---

## Code Examples

### Full sync function skeleton (ready for implementation)

```typescript
// Source: repo-sync.ts pattern + ARCHITECTURE.md Phase 2 algorithm
// web/src/lib/execucao-sync.ts

import { Readable } from 'stream'
import { createInflateRaw } from 'zlib'
import { createInterface } from 'readline'
import { getPool } from '@/lib/db'

// Re-export helpers from repo-sync (or copy if not exported)
// cleanCNPJ, parseBRNumber, fixText must be exported from repo-sync.ts
// If they are not currently exported, add `export` to their declarations.

const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const PROPOSTA_URL = `${REPO_BASE}/siconv_proposta.csv.zip`
const CONVENIO_URL = `${REPO_BASE}/siconv_convenio.csv.zip`

export interface ExecucaoSyncStats {
  proposta_rows_scanned: number
  osc_rows_kept: number
  convenio_rows_scanned: number
  em_execucao_rows: number
  join_miss_count: number      // convenios with no OSC proposta match
  inserted: number
  updated: number
  errors: number
  duration_ms: number
}

export async function syncProjetosExecucao(): Promise<ExecucaoSyncStats> {
  const startTime = Date.now()
  const stats: ExecucaoSyncStats = {
    proposta_rows_scanned: 0,
    osc_rows_kept: 0,
    convenio_rows_scanned: 0,
    em_execucao_rows: 0,
    join_miss_count: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    duration_ms: 0,
  }

  // STEP A: Stream proposta, keep only OSC
  const propostaMap = new Map<string, PropostaInfo>()
  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    stats.proposta_rows_scanned++
    const tipo = (row.TIPO_INSTRUMENTO || row.MODALIDADE_PROGRAMA || '').toLowerCase()
    if (!tipo.includes('osc')) return
    const cnpj = cleanCNPJ(row.CNPJ_PROPONENTE)
    if (!cnpj) return
    stats.osc_rows_kept++
    propostaMap.set(row.ID_PROPOSTA, {
      cnpj,
      nome_proponente: fixText(row.NM_PROPONENTE) || null,
      objeto: fixText(row.OBJETO_PROPOSTA) || null,
      uf: row.UF_PROPONENTE || null,
      municipio: fixText(row.MUNICIPIO_PROPONENTE) || null,
    })
  })

  // STEP B: Stream convenio, join, collect records
  const records: ExecucaoRecord[] = []
  const now = Date.now()
  await downloadAndStreamCSV(CONVENIO_URL, (row) => {
    stats.convenio_rows_scanned++
    const situacao = (row.SITUACAO_CONVENIO || '').toLowerCase()
    if (!situacao.includes('execu')) return
    stats.em_execucao_rows++
    const proposta = propostaMap.get(row.ID_PROPOSTA)
    if (!proposta) { stats.join_miss_count++; return }
    records.push(buildRecord(row, proposta, now))
  })

  // STEP C: Bulk upsert via pool client
  const client = await getPool().connect()
  try {
    for (const rec of records) {
      // ... parameterized UPSERT query
    }
    // Log to cron_sync_log
    await client.query(`
      INSERT INTO cron_sync_log (inserted, updated, errors, duration_ms, join_miss_count, source)
      VALUES ($1, $2, $3, $4, $5, 'sync-execucao')
    `, [stats.inserted, stats.updated, stats.errors,
        Date.now() - startTime, stats.join_miss_count])
  } finally {
    client.release()
  }

  stats.duration_ms = Date.now() - startTime
  return stats
}
```

### Exporting helpers from repo-sync.ts

The helpers `cleanCNPJ`, `parseBRNumber`, `fixText`, and `downloadAndStreamCSV` are currently not exported from `repo-sync.ts` (they are private to the file). Phase 15 requires either:
1. Adding `export` to these function declarations in `repo-sync.ts` (preferred — DRY), or
2. Copying them into `execucao-sync.ts` (acceptable if export would risk breaking the existing sync).

Option 1 is preferred. The functions are pure (no side effects, no globals) — exporting them is safe.

### One-off test script structure

```javascript
// Source: web/scripts/check42.mjs pattern (existing test scripts in project)
// web/scripts/test-execucao-sync.mjs
import { syncProjetosExecucao } from '../src/lib/execucao-sync.ts'  // or compiled version

process.env.DATABASE_URL = '...'  // set from .env.local

const stats = await syncProjetosExecucao()
console.log('Sync stats:', stats)

// Validation query
import { query } from '../src/lib/db.ts'
const [count] = await query('SELECT COUNT(*) as n FROM projetos_execucao')
console.log('Row count after sync:', count.n)
const [dupes] = await query(`
  SELECT COUNT(*) as n FROM (
    SELECT nr_convenio FROM projetos_execucao GROUP BY nr_convenio HAVING COUNT(*) > 1
  ) t
`)
console.log('Duplicate nr_convenio count (must be 0):', dupes.n)
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Python ETL truncate-and-reload | Node.js streaming UPSERT with `ON CONFLICT (nr_convenio)` | Idempotent; can run daily without data loss; no truncation window |
| INNER JOIN — silent project drops | LEFT JOIN with `join_miss_count` logged | Data gaps are visible, not silent; Phase 16 API can display freshness stats |
| FLOAT financial columns (old schema) | NUMERIC(18,2) in `projetos_execucao` | Eliminates rounding errors in percentage calculations |
| One combined cron for all syncs | Dedicated `/api/cron/sync-execucao` endpoint | Prevents timeout cascade; each sync has independent 300s budget |

**Deprecated/outdated:**
- `cron_sync_log` without `join_miss_count`: The existing table schema needs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS join_miss_count` before Phase 15 is complete. This is a non-breaking migration (column has default 0).

---

## Open Questions

1. **Exact OSC filter column in siconv_proposta.csv**
   - What we know: ARCHITECTURE.md documents `TIPO_INSTRUMENTO` and `MODALIDADE_PROGRAMA` as candidates
   - What's unclear: Which column name appears in the actual CSV header row; value format of OSC entries
   - Recommendation: Print CSV headers on first test script run; do not commit filter logic until column is confirmed

2. **Financial column names in siconv_convenio.csv**
   - What we know: ARCHITECTURE.md lists `VL_GLOBAL_CONV`, `VL_REPASSE_CONV`, etc. as expected names
   - What's unclear: Whether the live CSV uses these exact names or abbreviations/variants
   - Recommendation: Print convenio CSV headers on first run alongside a sample row; verify by checking that `parseBRNumber` returns non-zero for known-active convenios

3. **Date format in siconv CSVs (DD/MM/YYYY vs YYYY-MM-DD)**
   - What we know: Brazilian government CSVs historically use `DD/MM/YYYY`; the existing `repo-sync.ts` never parses dates
   - What's unclear: Whether the siconv_convenio and siconv_proposta CSVs follow this pattern
   - Recommendation: Log raw date values on first test run; add `parseBRDate()` helper if needed

4. **Memory usage of propostaMap in Vercel serverless**
   - What we know: 187MB compressed; `downloadAndStreamCSV` buffers the full ZIP before parsing; OSC subset is a fraction of total propostas
   - What's unclear: Whether the OSC-filtered Map stays comfortably under 1GB after deflation
   - Recommendation: Log `process.memoryUsage().heapUsed` before and after STEP A in the test script; if over 800MB, implement two-pass approach

5. **cron_sync_log schema migration needed**
   - What we know: Current schema has `inserted`, `updated`, `errors`, `duration_ms` but not `join_miss_count` or `source`
   - What's unclear: Whether to add columns to existing table or create `cron_sync_log_execucao` separately
   - Recommendation: Add `join_miss_count INT DEFAULT 0` and `source VARCHAR(50) DEFAULT 'sync-leads'` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — non-breaking, backward-compatible

---

## Sources

### Primary (HIGH confidence — direct codebase inspection, 2026-03-18)

- `web/src/lib/repo-sync.ts` — `downloadAndStreamCSV`, `_parseZipBuffer`, `cleanCNPJ`, `parseBRNumber`, `fixText`, `formatPhone`; UPSERT discipline at lines 616-639; enrichment queue pattern at lines 843-848; cron timing guard at lines 896, 1026
- `web/src/app/api/cron/sync-leads/route.ts` — cron auth pattern, `maxDuration = 300`, manual trigger support, error handling
- `web/vercel.json` — existing cron entries (12:30 UTC and 18:00 UTC); confirmed there is no sync-execucao entry yet
- `web/src/lib/db.ts` — `getPool()` singleton; `max: 5` connections; `statement_timeout: 30000`
- `web/schema.sql` lines 234-269 — `projetos_execucao` table as created in Phase 14: NUMERIC(18,2) financials, `UNIQUE(nr_convenio)`, `cnpj NOT NULL`
- `web/schema.sql` lines 221-232 — `cron_sync_log` schema: confirmed missing `join_miss_count` column
- `.planning/STATE.md` Key Decisions — `ON CONFLICT (nr_convenio)` locked; LEFT JOIN with `join_miss_count` locked; dedicated cron locked; NULL proposta_id diagnostic result (0 of 44,035 em-execucao convenios) confirmed 2026-03-18
- `.planning/research/ARCHITECTURE.md` — Pattern 2 (in-memory join), Pattern 1 (cron isolation), build order
- `.planning/research/STACK.md` — Two-step algorithm, financial calculation formulas, UPSERT SQL structure
- `.planning/research/PITFALLS.md` — Pitfall 1 (UPSERT key), Pitfall 2 (join miss), Pitfall 6 (cron timeout)

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` — Phase 2 algorithm description, confirmed OSC filter approach
- `https://repositorio.dados.gov.br/seges/detru/` — verified 2026-03-18: `siconv_convenio.csv.zip` (15MB), `siconv_proposta.csv.zip` (187MB), both confirmed daily-updated

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct inspection of `repo-sync.ts` confirms all helpers exist and are production-proven
- Algorithm: HIGH — two-pass in-memory join fully documented in ARCHITECTURE.md and STATE.md
- UPSERT key: HIGH — locked in STATE.md; UNIQUE constraint confirmed in schema.sql
- CSV column names: MEDIUM — ARCHITECTURE.md documents expected names; live verification required on first test run
- Date format: LOW — no prior processing of date columns in this codebase; must verify on first test run
- Memory usage: MEDIUM — OSC filtering is the established mitigation; actual heap measurement needed in test script

**Research date:** 2026-03-18
**Valid until:** 30 days (stable patterns; CSV column names subject to government source changes)
