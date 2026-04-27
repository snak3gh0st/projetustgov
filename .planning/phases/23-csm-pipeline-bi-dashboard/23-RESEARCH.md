# Phase 23: CSM Pipeline & BI Dashboard - Research

**Researched:** 2026-04-27
**Domain:** Next.js 14 App Router, PostgreSQL CTE aggregation, recharts, CSM dashboard UX
**Confidence:** HIGH

## Summary

Phase 23 builds the CSM client list view (CLI-01..06) and BI dashboard (BI-01..05) on top of the Phase 22 auth foundation. The data layer is already present in the database — `projetos_execucao`, `tgov_projetos_execucao`, `propostas`, `tgov_propostas`, and `vendedor_projetos` tables contain all required financial fields. No schema migrations are needed. The entire challenge is in three areas: (1) writing correct aggregate SQL CTEs that union CRM+TGov data by CNPJ, (2) computing the 5-level priority badge from base financial columns (not from existing `tag_*` columns), and (3) extending the existing `CsmDashboardClient.tsx` placeholder component rather than creating new pages.

The existing codebase provides all patterns needed: the `execucao` API route demonstrates the NOT MATERIALIZED CTE union, `bi/execucao` demonstrates the BI aggregation pattern, `TGovStatusDonut` demonstrates charts, and `KPICard` demonstrates KPI display. Phase 23 is primarily integration work following established patterns.

**Primary recommendation:** Build three API endpoints (`/api/csm/portfolio`, `/api/csm/bi`, `/api/csm/clients/[cnpj]`) feeding one extended `CsmDashboardClient.tsx` with two tabs (Clientes / BI Dashboard). All SQL must use NOT MATERIALIZED CTE hints and CNPJ normalization via `REGEXP_REPLACE`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLI-01 | CSM ve todos os clientes Projetus em lista unificada — uma linha por cliente com dados financeiros agregados | Aggregate SQL CTE over EXECUCAO_NR_PROPOSTAS ∪ APROVACAO_NR_PROPOSTAS union; GROUP BY normalized CNPJ; all data in existing tables |
| CLI-02 | Cada cliente exibe: total saldo em conta, valor a desembolsar, saldo de rendimento previsto, valor a liberar (desembolso + aprovacao pendentes) | `SUM(saldo_conta)`, `SUM(valor_desembolsado)`, `SUM(rendimento_aplicacao)`, `SUM(valor_repasse - valor_desembolsado)` on execucao rows + `SUM(valor_global)` on aprovacao rows |
| CLI-03 | Cada cliente exibe contagem de projetos por situacao: execucao c/ saldo / a desembolsar / aprovacao / prestacao de contas | COUNT with CASE WHEN on situacao values; separate counters per phase bucket |
| CLI-04 | CSM pode expandir cliente e ver todos os projetos agrupados por fase (aprovacao, execucao, PC) | Expandable row pattern: Set<string> state + toggleExpand(cnpj); detail API endpoint returns rows for single CNPJ |
| CLI-05 | CSM pode buscar e filtrar clientes por nome, CNPJ, situacao e saldo | Client-side filter on loaded data (list expected <500 rows); no server-side pagination required for v6.0 |
| CLI-06 | Cada cliente e projeto exibe badge/tag colorida com nivel de prioridade: 1=saldo em conta · 2=a desembolsar · 3=rendimento · 4=aprovacao · 5=PC | Computed in SQL using CASE WHEN on saldo_conta, valor_desembolsado, rendimento_aplicacao, situacao; NOT from existing tag_* columns |
| BI-01 | BI do CSM exibe total de saldo em conta de todos os clientes gerenciados | SUM(saldo_conta) across all execucao rows in whitelist; KPICard component |
| BI-02 | BI do CSM exibe contagem de projetos por situacao (KPIs + grafico) | COUNT GROUP BY situacao; TGovStatusDonut pattern for chart |
| BI-03 | BI do CSM exibe total de saldo de rendimento previsto | SUM(rendimento_aplicacao); `rendimento_aplicacao` is the correct column (realized, used as proxy for forecast) |
| BI-04 | BI do CSM exibe valor total a liberar (desembolso pendente + aprovacao pendente) | execucao: SUM(valor_repasse - valor_desembolsado); aprovacao: SUM(valor_global); sum both |
| BI-05 | CSM tem pipeline/funil proprio separado do CRM vendas e TGov | Separate `/csm/bi` tab in CsmDashboardClient; no overlap with /bi or /tgov routes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14.x | Pages under `/csm/`, API routes under `/api/csm/*` | Project standard; all existing routes use it |
| `pg` Pool | 8.x | PostgreSQL queries via `lib/db.ts` | Project standard; max:5 conn pool with retry |
| recharts | 2.12 | PieChart / BarChart for BI | Already used in `TGovStatusDonut`, `BI execucao` dashboard |
| Tailwind CSS | 3.x | Styling | Project standard |
| NextAuth | 4.x | Session via `getApiSession()` / `verifySession()` | `canCsm()` in `dal.ts` is the auth gate |
| zod | 3.x | Request validation on API routes | Project standard for query params |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/format.ts` | internal | `formatCurrency`, `formatCompactCurrency`, `formatCNPJ` | Every currency/CNPJ display in UI |
| `lib/tgov.ts` | internal | `EXECUCAO_NR_PROPOSTAS`, `APROVACAO_NR_PROPOSTAS` Sets | Filter for whitelist injection into SQL |
| `components/KPICard` | internal | Metric card with title/value/icon/delta | BI-01..04 KPI display |
| `components/TGovStatusDonut` | internal | PieChart with legend + center label | BI-02 chart |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts 2.12 | Chart.js | recharts already installed and in use; no additional dep needed |
| client-side filter (CLI-05) | Server-side pagination + search | <500 rows expected; server-side adds latency and complexity with no benefit at this scale |
| Three endpoints | Single all-data endpoint | Single endpoint creates timeout risk; split allows fast portfolio list + lazy detail expansion |

**Installation:** No new dependencies required. All libraries already installed.

## Architecture Patterns

### Recommended Project Structure
```
web/src/app/
├── csm/
│   ├── page.tsx                        # Server component (existing — do NOT rewrite)
│   └── CsmDashboardClient.tsx          # Client component (EXTEND, not replace)
└── api/csm/
    ├── portfolio/
    │   └── route.ts                    # GET: all clients aggregated (CLI-01..06)
    ├── clients/
    │   ├── route.ts                    # POST: create client (existing — do NOT touch)
    │   └── [cnpj]/
    │       ├── route.ts                # PATCH: update contact (existing)
    │       └── projects/
    │           └── route.ts            # GET: all projects for one CNPJ (CLI-04 expand)
    └── bi/
        └── route.ts                    # GET: portfolio totals + chart data (BI-01..05)
```

Also add `/csm/bi` nav entry to `Sidebar.tsx` CSM block (lines 96-103).

### Pattern 1: NOT MATERIALIZED CTE Union (CRITICAL)

**What:** All SQL queries over TGov data must use `WITH ... AS NOT MATERIALIZED` to prevent Postgres from materializing CTEs that are referenced once — forcing predicate push-down.
**When to use:** Every CTE in `/api/csm/*` routes that references `tgov_projetos_execucao`, `tgov_propostas`, `projetos_execucao`, or `propostas`.
**Example:**
```sql
-- Source: web/src/app/api/tgov/execucao/route.ts (canonical pattern)
WITH execucao_rows AS NOT MATERIALIZED (
  SELECT
    REGEXP_REPLACE(pe.cnpj, '[^0-9]', '', 'g') AS cnpj_normalized,
    pe.nr_convenio,
    pe.objeto,
    pe.situacao,
    pe.saldo_conta,
    pe.valor_desembolsado,
    pe.rendimento_aplicacao,
    pe.valor_repasse
  FROM projetos_execucao pe
  WHERE pe.nr_convenio = ANY($1::text[])
  UNION ALL
  SELECT
    REGEXP_REPLACE(te.cnpj, '[^0-9]', '', 'g') AS cnpj_normalized,
    te.nr_convenio,
    te.objeto,
    te.situacao,
    te.saldo_conta,
    te.valor_desembolsado,
    te.rendimento_aplicacao,
    te.valor_repasse
  FROM tgov_projetos_execucao te
  WHERE te.nr_convenio = ANY($1::text[])
),
aprovacao_rows AS NOT MATERIALIZED (
  SELECT
    REGEXP_REPLACE(p.proponente_cnpj, '[^0-9]', '', 'g') AS cnpj_normalized,
    p.nr_proposta,
    p.objeto,
    p.situacao,
    p.valor_global,
    p.valor_repasse
  FROM propostas p
  WHERE p.nr_proposta = ANY($2::text[])
  UNION ALL
  SELECT
    REGEXP_REPLACE(tp.proponente_cnpj, '[^0-9]', '', 'g') AS cnpj_normalized,
    tp.nr_proposta,
    tp.objeto,
    tp.situacao,
    tp.valor_global,
    tp.valor_repasse
  FROM tgov_propostas tp
  WHERE tp.nr_proposta = ANY($2::text[])
)
```

### Pattern 2: CNPJ Normalization

**What:** `vendedor_projetos.cnpj` may contain punctuation (`.`, `/`, `-`); `projetos_execucao.cnpj` is VARCHAR(14) digits-only. Always normalize on join.
**When to use:** Any JOIN between `vendedor_projetos` and execution tables; any GROUP BY on CNPJ across sources.
```sql
-- Source: web/src/app/api/csm/clients/route.ts + schema.sql pattern
REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = pe.cnpj
```

### Pattern 3: canCsm() Auth Gate

**What:** Every `/api/csm/*` route must verify CSM access before any DB query.
**When to use:** Every new CSM API route handler.
```typescript
// Source: web/src/lib/dal.ts:112 + existing CSM route pattern
import { getApiSession } from '@/lib/dal';
import { canCsm } from '@/lib/dal';

export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session || !canCsm(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ... DB query
}
```

### Pattern 4: NR_PROPOSTA Array Parameter Injection

**What:** Whitelist NR_PROPOSTA sets from `lib/tgov.ts` must be passed as parameterized array — NOT string-interpolated into SQL.
**When to use:** Any query that filters by `EXECUCAO_NR_PROPOSTAS` or `APROVACAO_NR_PROPOSTAS`.
```typescript
// Source: web/src/app/api/tgov/execucao/route.ts pattern
import { EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS } from '@/lib/tgov';

const execucaoList = Array.from(EXECUCAO_NR_PROPOSTAS);
const aprovacaoList = Array.from(APROVACAO_NR_PROPOSTAS);
const result = await query(sql, [execucaoList, aprovacaoList]);
```

### Pattern 5: 5-Level Priority Badge (SQL Computed)

**What:** Priority level is computed from base financial columns using CASE WHEN. The existing `tag_lobby`, `tag_desembolso`, `tag_rendimento`, `tag_autossuficiente`, `tag_iniciante` boolean columns are for TGov internal display and DO NOT map to CSM priority levels.
**When to use:** CLI-06 badge derivation in portfolio SQL and detail SQL.
```sql
-- Priority per project row (execucao):
CASE
  WHEN saldo_conta > 0 THEN 1                                                    -- Saldo em conta
  WHEN valor_desembolsado = 0 AND situacao = 'Em execução' THEN 2              -- A desembolsar
  WHEN rendimento_aplicacao > 0 THEN 3                                           -- Rendimento
  WHEN situacao ILIKE '%presta%' OR situacao ILIKE '%PC%' THEN 5            -- Prestação de contas
  ELSE NULL                                                                        -- No badge (completed/other)
END AS priority_level
-- NOTE: NULL means no active priority badge; filter NULL rows from badge display

-- Priority per project row (aprovacao):
4 AS priority_level  -- All aprovacao rows = priority 4
```
For the client-level badge (CLI-06): use `MIN(priority_level)` across all projects — best/highest priority project drives the client badge.

### Pattern 6: Expandable Row

**What:** Set<string> state with toggle function; detail data fetched on first expand, cached in ref or state.
**When to use:** CLI-04 expandable client rows.
```typescript
// Source: web/src/app/leads/LeadsClient.tsx:242 (canonical expandable row)
const [expanded, setExpanded] = useState<Set<string>>(new Set());
const toggleExpand = (cnpj: string) => {
  setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(cnpj)) next.delete(cnpj);
    else next.add(cnpj);
    return next;
  });
};
```

### Pattern 7: BI Parallel Queries

**What:** BI endpoint fires independent aggregate queries in parallel via `Promise.all`.
**When to use:** `/api/csm/bi` route — totals, chart data, and funnel are independent.
```typescript
// Source: web/src/app/api/bi/execucao/route.ts pattern
const [totalsResult, byStatusResult] = await Promise.all([
  query<TotalsRow>(totalsSql, params),
  query<StatusRow>(byStatusSql, params),
]);
```

### Anti-Patterns to Avoid

- **String-interpolating NR_PROPOSTA lists into SQL:** SQL injection risk and bypasses parameterization. Always use `= ANY($1::text[])`.
- **Using tag_* columns for CSM priority:** These columns have different semantics (TGov operational tags). Priority must be computed from financial base columns.
- **Reading `rendimento_aplicacao` as "forecast":** It's realized rendimento, not a forecast. Label it "Saldo Rendimento" in UI — do not imply it's forward-looking.
- **Creating a new `/csm/pipeline` page:** BI-05 says "pipeline/funil proprio separado do CRM vendas e TGov" — this means a separate tab in CsmDashboardClient, NOT a full page separate from CSM.
- **Forgetting `maxDuration = 30`:** All API routes need `export const maxDuration = 30` for Vercel serverless timeout compliance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | Custom `toLocaleString` | `formatCurrency()` / `formatCompactCurrency()` from `lib/format.ts` | Already handles pt-BR BRL; compact form for large amounts in table cells |
| CNPJ display | Custom string slice | `formatCNPJ()` from `lib/format.ts` | Handles 14-digit normalization |
| KPI metric cards | Custom div+span | `KPICard` component (`components/KPICard.tsx`) | Props: title, value, subtitle, icon, delta, deltaType |
| Donut chart for status | Custom SVG | `TGovStatusDonut` component (adapt or clone pattern) | recharts PieChart with legend, hover, center label already wired |
| Session check in API | Custom cookie parse | `getApiSession()` + `canCsm()` from `lib/dal.ts` | Handles token verification, session shape, role extraction |
| DB connection | Direct `new Client()` | `query<T>()` from `lib/db.ts` | Pool management, retry logic, timeout (30s) already configured |

**Key insight:** This phase is integration work. All primitives exist. The work is SQL aggregation and wiring components together.

## Common Pitfalls

### Pitfall 1: Accented String Literals
**What goes wrong:** SQL INSERT or WHERE clause uses unaccented `'Nao Contatado'` instead of `'Não Contatado'`.
**Why it happens:** Copy-paste from non-accented source or auto-correct stripping diacritics.
**How to avoid:** Copy literal strings from `repo-sync.ts` or existing API routes — never retype them.
**Warning signs:** Pipeline filter shows 0 "Não Contatado" rows despite recent inserts.

### Pitfall 2: CTE Materialization (Performance)
**What goes wrong:** Omitting `NOT MATERIALIZED` on a CTE causes Postgres to materialize it before joining — disables predicate push-down. Result: 5+ second queries instead of <100ms.
**Why it happens:** Default Postgres behavior since 12+ is to materialize CTEs referenced once only under certain conditions, but the optimizer can still choose to materialize in complex union queries.
**How to avoid:** Always write `WITH cte_name AS NOT MATERIALIZED (...)` for all execution/aprovacao CTEs.
**Warning signs:** Query works in dev but times out in prod; EXPLAIN shows "CTE Scan" instead of "Seq Scan on table".

### Pitfall 3: CNPJ Join Mismatch
**What goes wrong:** Joining `vendedor_projetos.cnpj` (with punctuation) directly to `projetos_execucao.cnpj` (digits-only) yields zero matches.
**Why it happens:** `vendedor_projetos` stores CNPJs with formatting; `projetos_execucao` stores them raw.
**How to avoid:** Always apply `REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')` on the punctuated side before joining.
**Warning signs:** JOIN returns 0 rows even though client exists in both tables.

### Pitfall 4: CSM Data Isolation — No vendedorId Param
**What goes wrong:** API route accepts `?vendedorId=X` query param, allowing cross-user data access.
**Why it happens:** Copy-paste from gestor/admin endpoints that legitimately accept vendedorId.
**How to avoid:** Hardcode `vendedor_id = session.userId` in CSM routes. Reject any user-supplied vendedorId. (STATE.md decision from Phase 22-03.)
**Warning signs:** Route handler reads `searchParams.get('vendedorId')` for CSM scope.

### Pitfall 5: Manager Aggregations Leaking to CSM
**What goes wrong:** CSM response includes `paulo_breakdown`, `per_vendedor`, `vendedores_list`, or `selected_vendedor_stats`.
**Why it happens:** Copy from the comissoes endpoint that serves gestor/admin views.
**How to avoid:** CSM responses must only return the authenticated user's own data. Strip all manager aggregate fields.
**Warning signs:** Response JSON contains keys with multiple vendedor entries.

### Pitfall 6: Touching Existing POST /api/csm/clients
**What goes wrong:** Adding GET handler to `web/src/app/api/csm/clients/route.ts` overrides POST, breaking client creation (CSM-02).
**Why it happens:** Route file already exports `POST`; adding `GET` to the same file is safe, but restructuring risks breaking export.
**How to avoid:** The portfolio list belongs in `/api/csm/portfolio/route.ts` (new file). Do not modify `clients/route.ts`.
**Warning signs:** POST to /api/csm/clients returns 405 after adding GET.

### Pitfall 7: maxDuration Missing
**What goes wrong:** Vercel serverless function times out at default 10s during large CTE union queries.
**Why it happens:** New files don't inherit maxDuration from other routes.
**How to avoid:** Add `export const maxDuration = 30;` to every new API route file.
**Warning signs:** 504 Gateway Timeout in production; works fine in local dev (no timeout).

### Pitfall 8: "Saldo de rendimento previsto" Label Mismatch
**What goes wrong:** UI labels field as "rendimento previsto" (forecast) when it's `rendimento_aplicacao` (realized yield on invested balance).
**Why it happens:** REQUIREMENTS.md uses "saldo de rendimento previsto" but the DB column is realized.
**How to avoid:** Use label "Saldo Rendimento" in UI. Do not imply it's a forward-looking forecast. (Open question — verify with client if needed.)
**Warning signs:** User confusion about why "previsao" changes day-to-day.

## Code Examples

Verified patterns from project source files:

### GET /api/csm/portfolio — Response Shape
```typescript
// Derived from: web/src/app/api/tgov/execucao/route.ts + schema.sql
export type CsmClientRow = {
  cnpj: string;                    // 14 digits, no punctuation
  nome_fantasia: string;
  razao_social: string;
  // CLI-02 financials:
  total_saldo_conta: number;
  total_a_desembolsar: number;     // valor_repasse - valor_desembolsado (execucao)
  total_rendimento: number;        // rendimento_aplicacao
  total_a_liberar: number;         // a_desembolsar + aprovacao valor_global
  // CLI-03 counts:
  count_execucao_saldo: number;    // situacao='Em execução' AND saldo_conta > 0
  count_a_desembolsar: number;     // situacao='Em execução' AND valor_desembolsado = 0 (waiting first disbursement)
  count_aprovacao: number;         // from aprovacao whitelist
  count_prestacao_contas: number;  // situacao ILIKE '%prestação%'
  // CLI-06:
  priority_level: 1 | 2 | 3 | 4 | 5;
};
```

### GET /api/csm/bi — Response Shape
```typescript
// Derived from: web/src/app/api/bi/execucao/route.ts pattern
export type CsmBiResponse = {
  totals: {
    total_saldo_conta: number;       // BI-01
    total_rendimento: number;        // BI-03
    total_a_liberar: number;         // BI-04
    total_projetos: number;
  };
  by_status: Array<{                 // BI-02
    situacao: string;
    count: number;
    value: number;
  }>;
  funnel: Array<{                    // BI-05
    stage: string;
    count: number;
    value: number;
  }>;
};
```

### KPICard Usage (BI-01..04)
```typescript
// Source: web/src/components/KPICard.tsx props
<KPICard
  title="Saldo em Conta"
  value={formatCompactCurrency(totals.total_saldo_conta)}
  subtitle={`${totals.total_projetos} projetos`}
  icon={BanknotesIcon}
/>
```

### Sidebar Nav Entry (BI-05)
```typescript
// Source: web/src/components/Sidebar.tsx lines 96-103 — add after /csm/comissoes
{ href: '/csm/bi', label: 'BI Dashboard CSM', icon: ChartBarIcon }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel cron for sync | sigmadb systemd timers | Phase 20 (ee5fb71) | Vercel cron removed; DB data comes from systemd-run sync |
| Materialized CTEs | `NOT MATERIALIZED` hint | Phase 20-04 | 100x query speedup; mandatory for all TGov/execution queries |
| Role check inline in routes | `canCsm()` in `dal.ts` | Phase 22-01 | Centralized; single source of truth for CSM auth |
| /tgov redirect for CSM | /csm redirect | Phase 22-01 | CSM home is /csm; /tgov caused redirect loop |

**Deprecated/outdated:**
- `tag_lobby`, `tag_desembolso`, `tag_rendimento` for CSM priority: These boolean columns drive TGov internal view badges. Do not reuse for CSM 5-level priority system.
- `projetista_execucao` role: Removed from TGov execution access (260416-eoq); do not include in canCsm equivalents.

## Open Questions

1. **"Saldo de rendimento previsto" — DB column mismatch**
   - What we know: REQUIREMENTS.md CLI-02 says "saldo de rendimento previsto"; DB only has `rendimento_aplicacao` (realized rendimento applied to account balance).
   - What's unclear: Whether client intended "forecast" (not in DB) or "actual" (rendimento_aplicacao).
   - Recommendation: Implement using `rendimento_aplicacao`, label as "Saldo Rendimento" in UI, flag for client review during UAT.

2. **CSM client scope — CSM-added clients vs whitelist**
   - What we know: EXECUCAO_NR_PROPOSTAS ∪ APROVACAO_NR_PROPOSTAS covers ~239 proposal numbers. CSM can also add clients manually via POST /api/csm/clients (Phase 22-02) which inserts into `vendedor_projetos`.
   - What's unclear: Should portfolio include CSM-added clients that have no TGov proposals? Or only clients with at least one TGov project?
   - Recommendation: Include all CNPJs from whitelist AND any CNPJ in `vendedor_projetos` where the vendedor is CSM. Left-join financials — clients with no TGov data show zeroed financials.

3. **Priority badge for client with mixed project phases**
   - What we know: A client may have projects at priority 1 (saldo), priority 4 (aprovacao), and priority 5 (PC) simultaneously.
   - What's unclear: Does CLI-06 badge show the BEST (lowest) priority, WORST (highest), or all levels?
   - Recommendation: Show MIN(priority_level) per client for the client-row badge (highlights upsell opportunity). Show individual badges per project in the expanded detail (CLI-04).

## Sources

### Primary (HIGH confidence)
- `web/src/app/api/tgov/execucao/route.ts` — NOT MATERIALIZED CTE pattern, financial field names, maxDuration
- `web/src/app/api/bi/execucao/route.ts` — BI parallel query pattern, response shape
- `web/src/lib/dal.ts` — canCsm() implementation (line 112), getApiSession() signature
- `web/src/lib/tgov.ts` — EXECUCAO_NR_PROPOSTAS, APROVACAO_NR_PROPOSTAS Sets
- `web/src/lib/db.ts` — Pool config, query<T> helper
- `web/src/lib/format.ts` — formatCurrency, formatCompactCurrency, formatCNPJ
- `web/schema.sql` — projetos_execucao schema (cnpj VARCHAR(14), financial columns)
- `web/src/components/KPICard.tsx` — props interface
- `web/src/components/TGovStatusDonut.tsx` — recharts chart pattern
- `web/src/components/Sidebar.tsx` — CSM nav block (lines 96-103)
- `web/src/app/csm/CsmDashboardClient.tsx` — placeholder to extend
- `web/src/app/csm/page.tsx` — server component with canCsm() gate
- `web/src/app/api/csm/clients/route.ts` — existing POST endpoint (must not break)
- `.planning/STATE.md` — Phase 22 architecture decisions (data isolation, accented literals)
- `.planning/REQUIREMENTS.md` — CLI-01..06, BI-01..05 definitions

### Secondary (MEDIUM confidence)
- `web/src/app/leads/LeadsClient.tsx:242` — expandable row Set<string> pattern

### Tertiary (LOW confidence)
- None — all findings verified from project source files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from existing installed packages and project routes
- Architecture: HIGH — patterns directly observed in execucao/bi routes; all CTEs and patterns are in production code
- Pitfalls: HIGH — pitfalls come from STATE.md documented decisions and verified source code patterns
- Priority badge SQL: MEDIUM — derivation logic is inferred from requirements + financial column semantics; exact CASE WHEN thresholds should be verified against client definition during UAT

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable stack; DB schema changes would invalidate financial field assumptions)
