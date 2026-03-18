# Stack Research — Projetos em Execução

**Domain:** Intelligence tab — post-sales project execution view for existing CRM
**Researched:** 2026-03-18
**Confidence:** HIGH (conclusions from live codebase inspection + direct verification of repo data sources)

---

## Context

This is a milestone addition to an existing Next.js 14 + PostgreSQL (Supabase) CRM. The core stack is validated and in production. This document covers only what is new or different for the Projetos em Execução feature.

The feature reads two new CSV sources from `repositorio.dados.gov.br/seges/detru/`:
- `siconv_convenio.csv.zip` (15MB) — convenio records with financial state and situacao
- `siconv_proposta.csv.zip` (187MB) — proposal records with CNPJ, nome, objeto, vigencia dates

These must be cross-referenced via `id_proposta` to produce project execution cards grouped by CNPJ.

---

## Recommended Stack

### Core Technologies — No Changes

The existing stack handles all new requirements. Do not add frameworks.

| Technology | Version in use | Role | New usage |
|------------|---------------|------|-----------|
| Next.js 14 App Router | ^14.2.0 | Pages and API routes | New `/execucao` page + `/api/execucao` route |
| PostgreSQL via `pg` | ^8.13.0 | Database | New `projetos_execucao` table |
| Tailwind CSS | ^3.4.0 | UI styling | New page layout |
| Auth.js v5 | ^5.0.0-beta.30 | Session auth | Gestor/coordenador-only guard (pattern already in `dal.ts`) |
| Recharts | ^2.12.0 | Charts | Reuse for % execucao visualization if desired |

### Supporting Libraries — Nothing New Required

Every capability needed for the new feature already exists in `package.json`:

| Need | Already available | Why it covers this |
|------|-----------------|-------------------|
| Download + stream `.csv.zip` from HTTPS | Node stdlib: `Readable`, `createInflateRaw`, `createInterface` | Used in `repo-sync.ts` for siconv_programa/emenda/proponentes — exact same pattern applies to siconv_convenio and siconv_proposta |
| Semi-colon delimited CSV streaming parser | Custom streaming parser in `repo-sync.ts` (`_parseZipBuffer`) | Handles BOM, handles encoding artifacts (the `fixText()` / `parseBRNumber()` quirks specific to governo CSVs), production-proven |
| Brazilian number parsing | `parseBRNumber()` exported from `repo-sync.ts` | Handles comma-decimal format ("1.234,56") used in financial fields |
| CNPJ normalization | `cleanCNPJ()` in `repo-sync.ts` | Handles padding, punctuation stripping, min-length validation |
| XLSX reading (if manual upload path added) | `xlsx` ^0.18.5 | Already installed, used in `import-spreadsheet/route.ts` |
| DB upsert (ON CONFLICT) | `pg` pool + parameterized queries | Pattern established in `repo-sync.ts` STEP 6 upsert |
| Gestor-only access control | `getApiSession()` + `session.role` in `dal.ts` | Pattern: `if (session.role !== 'gestor' && session.role !== 'coordenador') return 403` |
| Date arithmetic (dias em execucao, vigencia) | PostgreSQL `EXTRACT(DAY FROM NOW() - date)` | Already used in leads query for `days_since_last_contact` |
| Percentage calculation | SQL arithmetic: `(valor_desembolsado / valor_repasse) * 100` | Pure PostgreSQL, no library needed |

**Install command: none. Zero new dependencies.**

---

## Database Schema — New Table

### `projetos_execucao`

This table is populated by a new sync function that downloads siconv_convenio + siconv_proposta, cross-references via `id_proposta`, and stores the filtered+joined result. It is intentionally isolated from `vendedor_projetos` (CRM leads) — different domain, different lifecycle.

```sql
CREATE TABLE IF NOT EXISTS projetos_execucao (
  id SERIAL PRIMARY KEY,

  -- Convenio identity (from siconv_convenio)
  nr_convenio          VARCHAR(30)   NOT NULL,  -- e.g. "912345/2023"
  id_proposta          VARCHAR(30),              -- FK key to siconv_proposta.ID_PROPOSTA
  situacao             VARCHAR(100),             -- e.g. "Em execucao"
  modalidade           VARCHAR(100),             -- e.g. "Convenio", "Contrato de Repasse"

  -- Proponent identity (from siconv_proposta via id_proposta join)
  cnpj                 VARCHAR(14)   NOT NULL,   -- 14 digits, no punctuation
  nome_proponente      VARCHAR(500),
  objeto               TEXT,
  uf                   VARCHAR(2),
  municipio            VARCHAR(200),

  -- Financial state (from siconv_convenio)
  valor_global         NUMERIC(18,2),
  valor_repasse        NUMERIC(18,2),
  valor_desembolsado   NUMERIC(18,2),            -- cumulative disbursed to date
  saldo_conta          NUMERIC(18,2),             -- balance in beneficiary account
  valor_empenhado      NUMERIC(18,2),

  -- Execution control (from siconv_convenio)
  data_assinatura      DATE,
  data_inicio_vigencia DATE,
  data_fim_vigencia    DATE,

  -- Computed columns (calculated at import time, refreshed daily)
  pct_execucao         NUMERIC(6,2),             -- (valor_desembolsado / valor_repasse) * 100
  dias_em_execucao     INTEGER,                   -- days since data_inicio_vigencia
  dias_ate_vencimento  INTEGER,                   -- days until data_fim_vigencia (negative = expired)

  -- Alert flags (logica de destaque from PROJECT.md)
  alerta_desembolso    BOOLEAN DEFAULT FALSE,    -- TRUE when valor_desembolsado < 0 (credit reversal)
  verificar_saldo      BOOLEAN DEFAULT FALSE,    -- TRUE when desembolso > 0 AND saldo_conta > 0

  -- Sync metadata
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_run_id          INTEGER,                   -- matches cron_sync_log.id for traceability

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

CREATE INDEX IF NOT EXISTS ix_projetos_execucao_alertas
  ON projetos_execucao(alerta_desembolso, verificar_saldo)
  WHERE alerta_desembolso = TRUE OR verificar_saldo = TRUE;
```

**Why NUMERIC not FLOAT:** All existing financial columns in `schema.sql` use `FLOAT`, which loses precision for currency. Since this is a new table, start correctly with `NUMERIC(18,2)`. Do not alter existing tables.

**Why computed columns stored:** `pct_execucao`, `dias_em_execucao`, and `dias_ate_vencimento` could be computed at query time, but storing them avoids repeated division across potentially thousands of rows during every page load. They are not user-editable state — recompute on every sync (daily).

**Why no FK to `vendedor_projetos`:** These are independent data domains. CNPJ is the join key at the API layer (used to link to `lead_contacts` for phone/email display). A hard FK would couple two unrelated domains and block inserts for CNPJs not yet in the CRM.

---

## Data Import Pattern — New Sync Function

### Source Data (verified 2026-03-18)

| File | URL | Size | Update cadence |
|------|-----|------|---------------|
| `siconv_convenio.csv.zip` | `https://repositorio.dados.gov.br/seges/detru/siconv_convenio.csv.zip` | 15MB | Daily (last seen: 2026-03-18 08:56) |
| `siconv_proposta.csv.zip` | `https://repositorio.dados.gov.br/seges/detru/siconv_proposta.csv.zip` | 187MB | Daily (last seen: 2026-03-18 08:58) |

`siconv_proposta.csv.zip` at 187MB is approximately 12x larger than the largest file currently handled by `repo-sync.ts`. The streaming approach in `_parseZipBuffer` does not buffer the full CSV into memory — it yields rows one at a time. This pattern works for 187MB but will take significantly longer to download (~30-60s on Vercel serverless network).

**Critical optimization:** Do NOT load all proposta rows into a Map. Instead:
1. Download siconv_convenio first, collect `id_proposta` values for matching records
2. Build a `neededPropostaIds: Set<string>` from step 1
3. Stream siconv_proposta, skip rows where `ID_PROPOSTA` is not in the needed set
4. This limits memory to the join subset, not 187MB of parsed data

### Recommended Import Algorithm

```
STEP 1: Download + stream siconv_convenio
  - Filter: SITUACAO contains 'execu' (case-insensitive)
  - Filter: MODALIDADE is OSC-relevant (skip pure government-to-government)
  - Collect: nr_convenio, id_proposta, situacao, modalidade, all financial fields
  - Build: convenioMap (id_proposta -> ConvenioRecord[])
  - Build: neededPropostaIds Set<string>

STEP 2: Download + stream siconv_proposta
  - Skip rows where ID_PROPOSTA not in neededPropostaIds
  - Collect: cnpj, nome_proponente, objeto, uf, municipio
  - Build: propostaMap (id_proposta -> PropostaInfo)

STEP 3: Join + compute
  - For each convenio: look up proposta by id_proposta
  - Compute pct_execucao, dias_em_execucao, dias_ate_vencimento, alert flags

STEP 4: Upsert into projetos_execucao
  - ON CONFLICT (nr_convenio) DO UPDATE SET all columns
  - Log sync stats to cron_sync_log
```

### Financial Calculation Implementation

All pure arithmetic — no library needed:

```typescript
// Percentage execution (guard against divide by zero)
const pct_execucao = valor_repasse && valor_repasse > 0
  ? Math.round((valor_desembolsado / valor_repasse) * 10000) / 100
  : null

// Alert flags (logica de destaque from PROJECT.md)
const alerta_desembolso = valor_desembolsado < 0   // credit reversal = red alert
const verificar_saldo = valor_desembolsado > 0 && (saldo_conta ?? 0) > 0

// Days computed from current time (will be stale by up to 24h — acceptable for daily sync)
const now = Date.now()
const dias_em_execucao = data_inicio_vigencia
  ? Math.floor((now - data_inicio_vigencia.getTime()) / 86_400_000)
  : null
const dias_ate_vencimento = data_fim_vigencia
  ? Math.floor((data_fim_vigencia.getTime() - now) / 86_400_000)
  : null
```

### Cron Route Pattern

Follow the same pattern as `/api/cron/sync-leads/route.ts` exactly:

```typescript
// /api/cron/sync-execucao/route.ts
export const dynamic = 'force-dynamic'
export const maxDuration = 300  // Vercel Pro max timeout — needed for 187MB download

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'coordenador')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  // ... call syncProjetosExecucao()
}
```

Add to `vercel.json` cron schedule with at least 30-minute offset from existing `sync-leads` cron to avoid concurrent DB load.

### CNPJ Aggregation Query (grouped view)

The UI shows one row per CNPJ with count of fomentos. This is GROUP BY at query time:

```sql
SELECT
  pe.cnpj,
  pe.nome_proponente,
  pe.uf,
  pe.municipio,
  COUNT(*)                          AS total_projetos,
  SUM(pe.valor_repasse)             AS total_repasse,
  SUM(pe.valor_desembolsado)        AS total_desembolsado,
  SUM(pe.saldo_conta)               AS total_saldo,
  AVG(pe.pct_execucao)              AS avg_pct_execucao,
  BOOL_OR(pe.alerta_desembolso)     AS tem_alerta,
  BOOL_OR(pe.verificar_saldo)       AS tem_verificar,
  MIN(pe.dias_ate_vencimento)       AS vencimento_mais_proximo,
  -- Contact from lead_contacts (same JOIN pattern as leads/route.ts)
  (
    SELECT lc.telefone
    FROM lead_contacts lc
    WHERE lc.lead_cnpj = pe.cnpj
    ORDER BY lc.principal DESC, lc.created_at ASC
    LIMIT 1
  ) AS telefone
FROM projetos_execucao pe
GROUP BY pe.cnpj, pe.nome_proponente, pe.uf, pe.municipio
ORDER BY tem_alerta DESC, total_projetos DESC, pe.cnpj
```

---

## Access Control Pattern

Gestor-only access is already implemented in `dal.ts`. Pattern for the API route:

```typescript
const session = await getApiSession()
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (session.role !== 'gestor' && session.role !== 'coordenador') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

The page itself redirects non-gestors via `verifySession()` from `dal.ts` — same pattern as all other protected pages. No new middleware needed.

---

## Alternatives Considered

| Recommended | Alternative | Why not |
|-------------|-------------|---------|
| Stream siconv_proposta through a filter Set | Load all 187MB into memory as parsed objects | Memory exhaustion on Vercel serverless; streaming approach already proven in `repo-sync.ts` for similar data |
| Single `projetos_execucao` table (denormalized join) | Separate `convenios_execucao` + `propostas_execucao` tables with join at query time | No need to normalize — this is a read-only intelligence view, not a normalized domain model; join at import time is simpler and faster at query time |
| `NUMERIC(18,2)` for financial values | `FLOAT` (as used in existing tables) | Float loses precision for currency math; new table should start correctly |
| Compute alert flags at import time, store as booleans | Compute in frontend JavaScript | Avoids redundant recalculation on every page load; simpler query layer |
| Re-use `downloadAndStreamCSV` from `repo-sync.ts` | Write a new download utility | Identical problem solved already — export the function or move to `lib/csv-utils.ts` |
| Vercel cron (existing mechanism) | Supabase Edge Function or separate worker | Existing infrastructure is already proven and covers the 300s window needed |

---

## What NOT to Add

| Avoid | Why | Use instead |
|-------|-----|-------------|
| A CSV parsing library (csv-parse, papaparse) | `repo-sync.ts` already has a production-proven streaming ZIP+CSV parser with encoding quirk handling specific to governo CSVs — adding a generic library would lose `fixText()` / `parseBRNumber()` handling and add a dependency | Extract `downloadAndStreamCSV` into `lib/csv-utils.ts` and reuse |
| An ORM (Prisma, Drizzle) | The project uses raw `pg` queries throughout; introducing an ORM mid-project creates two query patterns, migration friction, and zero benefit for one new table | Raw `pg` queries via the existing `query()` helper in `lib/db.ts` |
| A background job framework (BullMQ, Inngest) | Vercel cron + `maxDuration = 300` covers the use case; the 187MB download fits within this window | Vercel cron, same as `sync-leads` |
| React Query / SWR | The existing pages use `useEffect` + `fetch` consistently; introducing a data-fetching library for one new page creates inconsistency | `useEffect` + `fetch` pattern, consistent with rest of app |
| A new charting library | Recharts is already installed and used for the BI page | Recharts for % execucao bar visualization if needed |
| `xlsx` dependency for siconv import | These are CSV files inside ZIP, not Excel | The existing streaming CSV parser handles them natively |

---

## Version Compatibility

All existing packages are compatible — zero new packages means zero compatibility risk.

One existing flag: `xlsx` ^0.18.5 refers to SheetJS Community Edition (the last MIT-licensed version). If the Projetos em Execução feature later adds a manual upload path for convenio/proposta data as an alternative to cron, this library handles it. Do not upgrade to SheetJS Pro (paid) unless the Community Edition specifically fails.

---

## Sources

- Live codebase at `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/` — HIGH confidence (direct inspection, 2026-03-18)
  - `web/package.json` — exact installed versions
  - `web/src/lib/repo-sync.ts` — streaming ZIP+CSV pattern, `downloadAndStreamCSV`, `_parseZipBuffer`, `parseBRNumber`, `cleanCNPJ`, `fixText`
  - `web/src/app/api/import-spreadsheet/route.ts` — XLSX handling and header-mapping patterns
  - `web/src/lib/db.ts` — pool singleton and `query()` helper
  - `web/src/lib/dal.ts` — `getApiSession()`, `verifySession()`, role helpers
  - `web/schema.sql` — existing table structure, financial column types
  - `web/src/app/api/leads/route.ts` — GROUP BY aggregation and `lead_contacts` JOIN pattern
  - `web/src/app/api/cron/sync-leads/route.ts` — cron auth pattern, `maxDuration`, manual trigger
- `https://repositorio.dados.gov.br/seges/detru/` — verified 2026-03-18 — HIGH confidence
  - `siconv_convenio.csv.zip` confirmed present at 15MB, updated 2026-03-18 08:56
  - `siconv_proposta.csv.zip` confirmed present at 187MB, updated 2026-03-18 08:58
  - Both update daily alongside existing siconv_programa/emenda/proponentes sources

---

*Stack research for: Projetos em Execucao intelligence tab (v4.0 milestone)*
*Researched: 2026-03-18*
*Scope: Stack additions only — existing validated stack not re-researched*
