# Phase 16: API & Business Logic - Research

**Researched:** 2026-03-18
**Domain:** Next.js 14 API route, PostgreSQL GROUP BY aggregation, role-guarded endpoint, alert business rule
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIN-01 | Gestor pode ver valor de desembolso por projeto | GROUP BY CNPJ query on projetos_execucao; valor_desembolsado already stored as NUMERIC(18,2) — no cast needed at the table layer |
| FIN-02 | Gestor pode ver saldo em conta por projeto | saldo_conta column in projetos_execucao; SUM(saldo_conta) per CNPJ in GROUP BY query |
| FIN-03 | Gestor pode ver percentual de execucao (desembolso vs valor global) | pct_execucao stored per row; AVG(pct_execucao) per CNPJ or recompute from summed totals — research recommends SUM(desembolsado)/SUM(repasse)*100 for aggregate accuracy |
| FIN-04 | Projetos com desembolso negativo sao destacados visualmente como alerta | Alert field in API response; `alerta_desembolso` column already present in projetos_execucao; business rule for "negative" must be confirmed with client before Phase 16 Plan 2 |
| FIN-05 | Gestor pode ver dias em execucao (desde inicio ate hoje) | dias_em_execucao stored per row (computed at ETL time); or recompute in SQL: GREATEST(0, EXTRACT(DAY FROM NOW() - data_inicio_vigencia)::INT) for freshness |
| FIN-06 | Gestor pode ver data fim de vigencia e tempo restante | data_fim_vigencia stored per row; dias_ate_vencimento stored per row; re-expression in SQL: EXTRACT(DAY FROM data_fim_vigencia - NOW())::INT for up-to-date values |
</phase_requirements>

---

## Summary

Phase 16 builds one new file: `web/src/app/api/execucao/route.ts`. The data layer (8793 real rows in `projetos_execucao`) is already validated from Phase 15. The core work is writing a GROUP BY CNPJ query that aggregates all financial columns, joins `lead_contacts` for contact presence detection, enforces the gestor/coordenador role guard, and applies filter parameters (search, uf, alert_only). All query patterns, auth patterns, and DB patterns are already established in existing routes.

The one non-standard element is the alert business rule for Plan 16-02. The `alerta_desembolso` column was computed in the ETL as `valor_desembolsado < 0` which, as documented in PITFALLS.md Pitfall 7, may never fire for real government data (disbursed values are always positive). The client must identify 3+ specific convênios that should show the alert before the final alert SQL is written. This is a gate on Plan 16-02, not Plan 16-01.

The `dias_em_execucao` and `dias_ate_vencimento` columns exist in `projetos_execucao` but are computed at ETL sync time (daily). For maximum freshness, the API should recompute these as SQL expressions using `NOW()` rather than serving the stored integer values, which can be up to 23 hours stale.

**Primary recommendation:** Write the GROUP BY query directly against `projetos_execucao` (all NUMERIC columns, no casts needed), LEFT JOIN `lead_contacts` for `contact_present`, enforce `session.role !== 'gestor' && session.role !== 'coordenador'` returning 401, recompute dias values in SQL using `NOW()`, hold on alert constants until client confirmation in Plan 16-02.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 14 App Router | ^14.2.0 | API route `/api/execucao/route.ts` | Existing framework; same pattern as `/api/leads/route.ts` |
| `pg` (node-postgres) | ^8.13.0 | SQL query via `query()` helper from `db.ts` | Shared pool singleton, `max: 5` connections, `statement_timeout: 30000` |
| Auth.js v5 | ^5.0.0-beta.30 | Role guard via `getApiSession()` from `dal.ts` | Already enforces gestor/coordenador pattern in other routes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `query()` helper from `db.ts` | — | Short-lived SELECT query (not pool.connect/release) | For the API route GET handler; use `getPool().connect()` only for transactions |
| `getApiSession()` from `dal.ts` | — | Resolve session + role in API route | First call in every new route handler |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `query()` helper | Raw `getPool().connect()` | `query()` handles retry and client release automatically; only use `connect()` directly when you need a transaction or must hold a client across multiple queries |
| Recompute dias in SQL with `NOW()` | Serve stored `dias_em_execucao` integer | Stored values are up to 23h stale; SQL recomputation is trivial and always fresh |
| AVG(pct_execucao) for grouped percent | SUM(valor_desembolsado)/SUM(valor_repasse) | The latter is more mathematically correct for the aggregate — a weighted average by repasse amount |

**Installation:** None. Zero new dependencies.

---

## Architecture Patterns

### Recommended Project Structure

New file only:

```
web/src/
└── app/
    └── api/
        └── execucao/
            └── route.ts              NEW: GET /api/execucao
```

### Pattern 1: Role-Guarded API Route (Gestor + Coordenador Only)

**What:** The route returns 401 for any session without gestor or coordenador role. A vendedor calling the API directly, bypassing the UI, must receive 401 — not data.

**When to use:** Any route with data restricted to management roles.

**Example:**
```typescript
// Source: web/src/app/api/leads/route.ts pattern + dal.ts getApiSession()
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getApiSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.role !== 'gestor' && session.role !== 'coordenador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  }
  // ... rest of handler
}
```

Note: The project uses 401 consistently (not 403) for role failures. See `/api/leads/route.ts` and the cron endpoint. Match this convention.

### Pattern 2: GROUP BY CNPJ Aggregation With Contact Left Join

**What:** SELECT aggregated financial columns per CNPJ. LEFT JOIN `lead_contacts` for `contact_present`. Filter parameters applied as WHERE conditions with dynamic param index.

**When to use:** Any route that must group multiple rows per organization and surface contact availability.

**Example:**
```typescript
// Source: web/src/app/api/leads/route.ts aggregation pattern + ARCHITECTURE.md Pattern 4
const rows = await query<ExecucaoRow>(`
  SELECT
    pe.cnpj,
    MAX(pe.nome_proponente)                            AS nome_proponente,
    pe.uf,
    pe.municipio,
    COUNT(*)::INT                                      AS total_projetos,
    SUM(pe.valor_repasse)                              AS total_repasse,
    SUM(pe.valor_desembolsado)                         AS total_desembolsado,
    SUM(pe.saldo_conta)                                AS total_saldo,
    CASE
      WHEN SUM(pe.valor_repasse) > 0
      THEN ROUND(SUM(pe.valor_desembolsado) / SUM(pe.valor_repasse) * 100, 1)
      ELSE NULL
    END                                                AS pct_execucao_agregado,
    BOOL_OR(pe.alerta_desembolso)                      AS tem_alerta,
    BOOL_OR(pe.verificar_saldo)                        AS tem_verificar_saldo,
    MIN(
      EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT
    )                                                  AS dias_ate_vencimento_min,
    MAX(
      EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT
    )                                                  AS dias_em_execucao_max,
    MIN(pe.data_fim_vigencia)                          AS data_fim_vigencia_mais_proxima,
    EXISTS(
      SELECT 1 FROM lead_contacts lc
      WHERE lc.lead_cnpj = pe.cnpj
      LIMIT 1
    )                                                  AS contact_present
  FROM projetos_execucao pe
  WHERE ${conditions.join(' AND ')}
  GROUP BY pe.cnpj, pe.uf, pe.municipio
  ORDER BY tem_alerta DESC, total_projetos DESC
  LIMIT $${paramIndex}
`, params)
```

Key design choices:
- `contact_present` is a boolean (`EXISTS` subquery on `lead_contacts`) — no need to join contact details here; the slide-over (Phase 17) will fetch them separately
- `pct_execucao_agregado` recomputed from summed totals, not `AVG(pct_execucao)`, for weighted accuracy
- dias recomputed from `NOW()` in SQL, not served from stored integers
- `BOOL_OR(alerta_desembolso)` means any convênio for this CNPJ having the flag fires the aggregate alert

### Pattern 3: Dynamic WHERE Conditions With Param Index

**What:** Filter parameters (search, uf, alert_only) build a conditions array and params array incrementally, matching the pattern in `/api/leads/route.ts`.

**When to use:** Any API route with optional query string filters.

**Example:**
```typescript
// Source: web/src/app/api/leads/route.ts lines 40-55
const { searchParams } = new URL(request.url)
const search = searchParams.get('search')
const uf = searchParams.get('uf')
const alertOnly = searchParams.get('alert_only') === 'true'

const conditions: string[] = ['1=1']
const params: unknown[] = []
let paramIndex = 1

if (search) {
  const searchClean = search.replace(/[.\-\/]/g, '')
  conditions.push(`(pe.nome_proponente ILIKE $${paramIndex} OR pe.cnpj LIKE $${paramIndex + 1})`)
  params.push(`%${search}%`, `%${searchClean}%`)
  paramIndex += 2
}

if (uf) {
  conditions.push(`pe.uf = $${paramIndex++}`)
  params.push(uf.toUpperCase())
}

if (alertOnly) {
  conditions.push(`(pe.alerta_desembolso = TRUE OR pe.verificar_saldo = TRUE)`)
  // No paramIndex increment — this uses literal SQL, not a bound param
}
```

### Pattern 4: Named Alert Constants

**What:** Alert business rules expressed as named TypeScript constants with explanatory comments, not magic SQL literals. This makes the logic auditable and the client confirmation date traceable.

**When to use:** Any business rule that required client sign-off.

**Example:**
```typescript
// Alert constants — to be populated in Plan 16-02 after client confirms rule
// Source: PITFALLS.md Pitfall 7 + STATE.md alert business rule blocker
//
// Client must identify 3+ convenios that SHOULD show alert and 3+ that are healthy.
// Inspect those records in DB, derive the exact condition, document below.
//
// PLACEHOLDER — do not ship until Plan 16-02 client confirmation is complete:
const ALERT_CONDITION_SQL = `pe.alerta_desembolso = TRUE`       // placeholder
const VERIFY_SALDO_CONDITION_SQL = `pe.verificar_saldo = TRUE`  // placeholder
```

In Plan 16-01, use placeholder logic. In Plan 16-02, replace with confirmed SQL after inspecting client-provided convênio examples.

### Anti-Patterns to Avoid

- **Returning raw `dias_em_execucao` from stored integer:** The ETL runs once daily; a row synced at 13:00 UTC has a dias value that is already stale by the time a gestor views it at 17:00 UTC. Recompute in SQL with `EXTRACT(DAY FROM NOW() - data_inicio_vigencia)::INT`.
- **Using `AVG(pct_execucao)` for the grouped percentage:** This gives equal weight to a R$10,000 convênio and a R$1,000,000 convênio. Use `SUM(desembolsado)/SUM(repasse)*100` for weighted accuracy.
- **Joining `vendedor_projetos` for contact fallback in Phase 16:** The `contact_present` boolean only needs `lead_contacts` — existence check, not data retrieval. The slide-over (Phase 17) handles the actual contact display; Phase 16 only needs the boolean.
- **Shipping alert logic without client confirmation:** The `alerta_desembolso` flag was computed in ETL as `valor_desembolsado < 0` which may never be true for real government data (Pitfall 7). Plan 16-01 uses this flag as-is (existing column); Plan 16-02 replaces the logic after client confirms the real business rule.
- **Fetching all columns for the group-by response:** The GROUP BY query should return only what the table view needs. The slide-over for individual convênio detail will use a separate per-CNPJ query. Do not return `objeto` (TEXT field) in the grouped list response.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session + role check | Custom JWT parsing or middleware | `getApiSession()` from `dal.ts` | Returns null for unauthenticated; includes `role` field; already handles the Auth.js cookie parsing |
| Financial precision | JavaScript ROUND() on JS floats | SQL `ROUND(... , 1)` on NUMERIC columns | projetos_execucao stores NUMERIC(18,2); all arithmetic stays in PostgreSQL |
| Contact detection | A second HTTP request from the frontend | `EXISTS(SELECT 1 FROM lead_contacts ...)` in the same query | One round-trip; the boolean is included per-CNPJ row at zero extra cost |
| Dynamic SQL conditions | String concatenation | Parameterized conditions array + params array | SQL injection prevention; same pattern as `/api/leads/route.ts` |

**Key insight:** Every capability needed already exists. Phase 16 is assembly of established patterns, not invention of new ones.

---

## Common Pitfalls

### Pitfall 1: Role Check Returns Wrong Status Code

**What goes wrong:** Developer checks role but returns 403 while the project convention is 401 for both authentication and authorization failures.

**Why it happens:** HTTP 401 vs 403 semantics differ (unauthenticated vs unauthorized), but the project consistently uses 401 for both. See `/api/leads/route.ts` line 11: `return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` — no 403 anywhere.

**How to avoid:** Always return `{ status: 401 }` for missing session AND for wrong role. Match the existing pattern exactly.

**Warning signs:** Vendedor calling the API gets a 403 but an automated test or the success criteria check expects 401.

### Pitfall 2: dias_em_execucao Served as Stale Integer

**What goes wrong:** The route returns `MIN(pe.dias_em_execucao)` from the stored column. That value was computed at ETL time (daily at 13:00 UTC). A gestor viewing the tab at 18:00 UTC sees values that are 5+ hours stale.

**Why it happens:** The stored column exists in `projetos_execucao` and is the obvious field to SELECT.

**How to avoid:** Use `EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT` and `EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT` directly in the API query. The stored columns are useful for the ETL validation script; the API should always derive from `NOW()`.

**Warning signs:** Dias values in the UI do not change over the course of a day even though time is passing.

### Pitfall 3: contact_present JOIN Pulls in Extra Tables

**What goes wrong:** Developer joins `lead_contacts` for `telefone` and `email` in the GROUP BY query, causing the GROUP BY to require these fields or force additional aggregation.

**Why it happens:** The intent (show contact info) is right but Phase 16 only needs the boolean. Phase 17 handles the actual display.

**How to avoid:** Use `EXISTS(SELECT 1 FROM lead_contacts lc WHERE lc.lead_cnpj = pe.cnpj LIMIT 1) AS contact_present`. No JOIN, no GROUP BY complication, no extra columns.

**Warning signs:** GROUP BY clause grows to include `lc.telefone`, `lc.email`, or the query errors with "column must appear in GROUP BY".

### Pitfall 4: Alert Logic Shipped as a Guess

**What goes wrong:** Plan 16-01 is deployed with `tem_alerta` based on the stored `alerta_desembolso` column (which was computed as `valor_desembolsado < 0`). This condition never fires in real government data. Plan 16-02 is skipped or merged without client confirmation.

**Why it happens:** The `alerta_desembolso` column exists and returns `FALSE` for all rows; it looks like the alert logic is working (no false alerts). The developer assumes it is correct.

**How to avoid:** Plan 16-01 must explicitly comment in the code that `alerta_desembolso` is a placeholder. Plan 16-02 is a hard gate: the alert logic cannot be called "done" until the client provides 3+ examples of convênios that SHOULD show the alert AND the developer has inspected those records in Supabase to derive the actual condition.

**Warning signs:** Zero rows ever have `tem_alerta = TRUE` in the API response despite the gestor saying "that organization is clearly stalled."

### Pitfall 5: pct_execucao_agregado Uses AVG Instead of Weighted Sum

**What goes wrong:** `AVG(pct_execucao)` is used for the per-CNPJ execution percentage. This gives equal weight to all convênios regardless of size, producing a misleading number.

**Why it happens:** `AVG` is the obvious aggregation for a percentage field.

**How to avoid:** Use `ROUND(SUM(valor_desembolsado) / NULLIF(SUM(valor_repasse), 0) * 100, 1)`. This produces a weighted average proportional to contract size.

**Warning signs:** A CNPJ with one R$1M convênio at 80% and one R$1,000 convênio at 10% shows 45% instead of the correct ~80%.

### Pitfall 6: Query Returns objeto (TEXT Column) in Group-By Response

**What goes wrong:** The `objeto` column (up to several KB of project description text) is included in the SELECT, inflating the JSON response for 8793 rows.

**Why it happens:** `SELECT pe.*` or copy-paste from the ETL field list.

**How to avoid:** Explicitly enumerate only the columns needed for the table view. The slide-over (Phase 17) will fetch individual convênio detail including `objeto` via a separate query.

**Warning signs:** API response payload is unusually large; browser Network tab shows MB-scale response for a list call.

---

## Code Examples

### Complete Route Structure (Plan 16-01 Starting Point)

```typescript
// Source: web/src/app/api/leads/route.ts — direct adaptation
// web/src/app/api/execucao/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// Alert condition placeholder — to be replaced in Plan 16-02 after client confirmation
// See: .planning/STATE.md "Alert business rule (Phase 16 blocker)"
// The client must identify 3+ convenios that SHOULD show the alert before shipping.
const ALERT_CONDITION = `alerta_desembolso = TRUE`

export async function GET(request: NextRequest) {
  try {
    // Role guard — both gestor and coordenador have read access
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.role !== 'gestor' && session.role !== 'coordenador') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const uf = searchParams.get('uf')
    const alertOnly = searchParams.get('alert_only') === 'true'

    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    let paramIndex = 1

    if (search) {
      const searchClean = search.replace(/[.\-\/]/g, '')
      conditions.push(`(pe.nome_proponente ILIKE $${paramIndex} OR pe.cnpj LIKE $${paramIndex + 1})`)
      params.push(`%${search}%`, `%${searchClean}%`)
      paramIndex += 2
    }

    if (uf) {
      conditions.push(`pe.uf = $${paramIndex++}`)
      params.push(uf.toUpperCase())
    }

    if (alertOnly) {
      conditions.push(`pe.${ALERT_CONDITION}`)
    }

    const rows = await query<ExecucaoAggRow>(`
      SELECT
        pe.cnpj,
        MAX(pe.nome_proponente)                                  AS nome_proponente,
        MAX(pe.uf)                                               AS uf,
        MAX(pe.municipio)                                        AS municipio,
        COUNT(*)::INT                                            AS total_projetos,
        SUM(pe.valor_repasse)                                    AS total_repasse,
        SUM(pe.valor_desembolsado)                               AS total_desembolsado,
        SUM(pe.saldo_conta)                                      AS total_saldo,
        CASE
          WHEN SUM(pe.valor_repasse) > 0
          THEN ROUND(SUM(pe.valor_desembolsado) / SUM(pe.valor_repasse) * 100, 1)
          ELSE NULL
        END                                                      AS pct_execucao_ponderado,
        BOOL_OR(pe.alerta_desembolso)                            AS tem_alerta,
        BOOL_OR(pe.verificar_saldo)                              AS tem_verificar_saldo,
        MIN(pe.data_fim_vigencia)                                AS data_fim_vigencia_mais_proxima,
        MIN(
          EXTRACT(DAY FROM pe.data_fim_vigencia - NOW())::INT
        )                                                        AS dias_ate_vencimento_min,
        MAX(
          EXTRACT(DAY FROM NOW() - pe.data_inicio_vigencia)::INT
        )                                                        AS dias_em_execucao_max,
        EXISTS(
          SELECT 1 FROM lead_contacts lc
          WHERE lc.lead_cnpj = pe.cnpj
          LIMIT 1
        )                                                        AS contact_present
      FROM projetos_execucao pe
      WHERE ${conditions.join(' AND ')}
      GROUP BY pe.cnpj
      ORDER BY tem_alerta DESC, total_projetos DESC, pe.cnpj
    `, params)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('[api/execucao] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch execucao data' }, { status: 500 })
  }
}
```

### TypeScript Response Type

```typescript
// Defines the shape of each row in the API response
// Consumed by Phase 17 client page and ExecucaoSlideOver
interface ExecucaoAggRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  total_projetos: number
  total_repasse: string        // pg returns NUMERIC as string
  total_desembolsado: string   // pg returns NUMERIC as string
  total_saldo: string          // pg returns NUMERIC as string
  pct_execucao_ponderado: string | null
  tem_alerta: boolean
  tem_verificar_saldo: boolean
  data_fim_vigencia_mais_proxima: Date | null
  dias_ate_vencimento_min: number | null
  dias_em_execucao_max: number | null
  contact_present: boolean
}
```

Important note on types: `pg` returns `NUMERIC` columns as strings, not JavaScript numbers. The Phase 17 UI must parse them: `parseFloat(row.total_desembolsado)`. Document this in the type definition.

### Alert Inspection Query (Plan 16-02 — Client Sign-Off Process)

```sql
-- Run against live Supabase when client provides example convenios
-- This is the diagnostic the developer uses to derive the alert rule

-- Step 1: Inspect client-provided "should alert" examples
SELECT
  nr_convenio,
  cnpj,
  nome_proponente,
  valor_repasse,
  valor_desembolsado,
  saldo_conta,
  pct_execucao,
  dias_em_execucao,
  dias_ate_vencimento,
  alerta_desembolso,
  verificar_saldo
FROM projetos_execucao
WHERE nr_convenio IN ('XXXXX', 'YYYYY', 'ZZZZZ')  -- client-provided examples
ORDER BY nr_convenio;

-- Step 2: Inspect "healthy" examples for comparison
SELECT
  nr_convenio,
  cnpj,
  valor_desembolsado,
  saldo_conta,
  pct_execucao,
  alerta_desembolso,
  verificar_saldo
FROM projetos_execucao
WHERE nr_convenio IN ('AAA', 'BBB', 'CCC')  -- client-provided healthy examples
ORDER BY nr_convenio;

-- Step 3: Check distribution to understand what "typical" looks like
SELECT
  ROUND(pct_execucao::numeric, 0) AS pct_bucket,
  COUNT(*) AS count,
  AVG(saldo_conta) AS avg_saldo
FROM projetos_execucao
WHERE pct_execucao IS NOT NULL
GROUP BY ROUND(pct_execucao::numeric, 0)
ORDER BY pct_bucket;
```

### CNPJ-Level Detail Query (for Phase 17 slide-over, documented here for API contract clarity)

The grouped route returns one row per CNPJ. Phase 17 will need individual convênio detail. The recommended approach is a separate route `/api/execucao/[cnpj]/route.ts` that returns individual rows:

```sql
-- Individual convênio rows for a specific CNPJ (used by slide-over in Phase 17)
SELECT
  nr_convenio,
  situacao,
  modalidade,
  valor_global,
  valor_repasse,
  valor_desembolsado,
  saldo_conta,
  pct_execucao,
  EXTRACT(DAY FROM NOW() - data_inicio_vigencia)::INT  AS dias_em_execucao,
  EXTRACT(DAY FROM data_fim_vigencia - NOW())::INT     AS dias_ate_vencimento,
  data_inicio_vigencia,
  data_fim_vigencia,
  alerta_desembolso,
  verificar_saldo,
  objeto
FROM projetos_execucao
WHERE cnpj = $1
ORDER BY valor_global DESC NULLS LAST
```

This is not built in Phase 16, but documenting it now avoids API contract surprises in Phase 17.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Float financial columns (old ETL tables) | NUMERIC(18,2) in projetos_execucao (already done) | No casting needed in Phase 16 queries — data is already precise |
| Compute dias in JavaScript | SQL EXTRACT(DAY FROM NOW() - date)::INT | Always fresh; no stale stored integers; consistent with how days_since_last_contact works in /api/leads |
| AVG() for percentage aggregation | SUM(desembolsado)/SUM(repasse)*100 | Weighted accuracy for mixed-size convênio portfolios |
| Group by on frontend (useMemo) | GROUP BY CNPJ in SQL | Less data transferred; server handles aggregation; no need to send 8793 rows to browser |

**Deprecated/outdated:**
- `alerta_desembolso` computed as `valor_desembolsado < 0` in ETL: The ETL comment already flags this as "Phase 16 will refine." This placeholder logic is in place; Plan 16-02 replaces it after client confirmation.
- `dias_em_execucao` and `dias_ate_vencimento` stored columns: Still valid for ETL validation; for the API layer, recompute from `NOW()` to avoid staleness.

---

## Open Questions

1. **Alert business rule for "desembolso negativo"**
   - What we know: `alerta_desembolso` in the DB is stored as `valor_desembolsado < 0` (which never fires for real government data). The comment in `execucao-sync.ts` line 274 explicitly notes "Phase 16 will refine." The STATE.md documents this as a Phase 16 blocker with a note that it is "not a guess."
   - What's unclear: The actual business condition. Possibilities: low `pct_execucao` combined with expiring `data_fim_vigencia`? `saldo_conta <= 0` with `dias_ate_vencimento < 90`? Something entirely different?
   - Recommendation: Plan 16-02 cannot start until the client provides specific convênio examples. The developer inspects those rows in Supabase and derives the SQL condition. Document the condition and the date of client confirmation in a code comment.

2. **alert_only filter pre-condition**
   - What we know: Plan 16-01 must include the `alert_only` query parameter as described in the Phase description.
   - What's unclear: The filter must apply to the CORRECT alert condition. In Plan 16-01, it filters on the placeholder `alerta_desembolso` column. In Plan 16-02, it must be updated to filter on the confirmed business rule.
   - Recommendation: Implement `alert_only` in Plan 16-01 using the existing boolean columns. Document that Plan 16-02 will update the filter logic when the confirmed condition is substituted.

3. **coordenador role and execucao access**
   - What we know: The role guard in REQUIREMENTS.md says "Acesso restrito a gestor e coordenador (vendedor nao ve)" (UI-02). The cron endpoint only allows `gestor`, not `coordenador` (existing sync-execucao route). The page guard pattern in ARCHITECTURE.md shows `session.role !== 'gestor'` redirect — coordenador is not included there.
   - What's unclear: Should coordenador see the execucao tab? The requirements say yes (UI-02). The existing cron auth excludes coordenador (this is correct — coordenadores should not trigger crons).
   - Recommendation: Allow both `gestor` AND `coordenador` on GET /api/execucao (matching UI-02). The page server component should also allow coordenador. The cron endpoint (already shipped) correctly restricts to gestor only — cron triggering is an admin operation.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection, 2026-03-18)

- `web/src/app/api/leads/route.ts` — GROUP BY aggregation, dynamic WHERE conditions, paramIndex pattern, lead_contacts correlated subquery, role check (returns 401 for no session)
- `web/src/lib/dal.ts` — `getApiSession()` signature; role values: `'gestor' | 'vendedor' | 'visualizador' | 'coordenador'`; `isAdmin()` helper pattern
- `web/src/lib/db.ts` — `query()` helper for simple SELECTs; `getPool().connect()` only for transactions; `max: 5` pool connections; `statement_timeout: 30000`
- `web/src/lib/execucao-sync.ts` — `alerta_desembolso` placeholder comment at line 274; `verificar_saldo` defined as `valor_desembolsado > 0 && saldo_conta <= 0`; confirms all financial columns are NUMERIC(18,2) in the DB
- `web/schema.sql` lines 242-272 — `projetos_execucao` confirmed columns: NUMERIC(18,2) financials, DATE vigência columns, BOOLEAN alert flags, INTEGER dias columns; UNIQUE(nr_convenio)
- `web/src/app/api/cron/sync-execucao/route.ts` — `session.role !== 'gestor'` returns 401 (cron access); confirms 401 not 403 is the project convention
- `.planning/STATE.md` Key Decisions — "Alert business rule (Phase 16 blocker)" decision locked; "Role guard on both page and API (getApiSession)" decision locked; "All financial computations in SQL, not JavaScript" decision locked
- `.planning/phases/15-etl-sync-validation/15-02-SUMMARY.md` — Confirmed 8793 real rows in projetos_execucao; date columns verified (DIA_*); memory peak 1300MB (Vercel concern for cron, irrelevant for API route)

### Secondary (MEDIUM confidence — architectural docs, 2026-03-18)

- `.planning/research/ARCHITECTURE.md` — Pattern 3 (gestor-only route guard), Pattern 4 (CNPJ contact join), GROUP BY query template
- `.planning/research/PITFALLS.md` — Pitfall 7 (alert logic / desembolso negativo), Pitfall 3 (financial precision), Pitfall 4 (role gate)
- `.planning/research/STACK.md` — CNPJ aggregation query template, access control pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; direct inspection confirms all helpers exist
- Architecture: HIGH — GROUP BY query pattern, role guard pattern, contact JOIN pattern all drawn from existing routes
- Alert business rule: LOW — no client confirmation yet; this is the only genuinely unknown item in the phase
- dias SQL expressions: HIGH — PostgreSQL EXTRACT(DAY FROM ...) pattern used in `/api/leads` for `days_since_last_contact`

**Research date:** 2026-03-18
**Valid until:** 30 days (stable patterns; only the alert business rule requires external input before Plan 16-02)
