# Phase 18: Lead Distribution - Research

**Researched:** 2026-03-30
**Domain:** PostgreSQL advisory locks, Next.js API routes, execution pipeline distribution
**Confidence:** HIGH

## Summary

Phase 18 modifies an already-functional distribution system (`distribute-execucao.ts`) that performs round-robin assignment of execution leads to vendedores. The system runs in the `sync-execucao` cron job and is also exposed via a POST API route. The work is primarily additive: (1) add a client-routing pre-step that routes CNPJs in the `existing_clients` table to the coordenador user, (2) wrap the entire function in a `pg_advisory_lock` to prevent double-assignment, and (3) add a UI trigger button on the `/distribuir` page with a result display.

The existing code is clean and well-structured. The `query()` helper in `db.ts` is NOT safe for advisory locks because it returns a connection to the pool after each call. Advisory locks must use a dedicated `client = await getPool().connect()` pattern, which is already established in `execucao-sync.ts` and `repo-sync.ts`. The `existing_clients` table (not `vendedor_projetos.is_existing_client`) is the authoritative runtime source for client detection in distribution queries.

The UI already has an "auto-distribute" section in `/distribuir/page.tsx` for the approval pipeline. Adding an execution-specific trigger button follows the exact same visual pattern already present. The `DistributeResult` type already contains per-vendedor before/after counts that can power a result modal.

**Primary recommendation:** Wrap `distributeUnassignedExecucao()` in a dedicated-connection advisory lock, add the `existing_clients` pre-step before the round-robin loop, then surface the result from the existing API route in a new modal on the `/distribuir` page.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A CNPJ is "cliente" if it exists in the `existing_clients` table (detected via `ec.cnpj IS NOT NULL` join — consistent with all other queries in the codebase). The `is_existing_client` flag in CONTEXT.md refers to presence in `existing_clients`, not a column on `vendedor_projetos`.
- **D-02:** During execution distribution, before round-robin, each unassigned CNPJ is checked against `existing_clients`. If found, route to the coordenador user instead of entering the equalization queue.
- **D-03:** The detection is automatic — no manual tagging. The `existing_clients` table drives routing in execution.
- **D-04:** Client-tagged leads go to the user with `role = 'coordenador'`. If multiple coordenadores exist, use the first active one (by `nome` ASC).

### Claude's Discretion
- Locking strategy (wait vs skip-if-locked)
- Manual trigger UI placement and feedback design
- Whether to add an execution tab to `/distribuir` or add the button elsewhere
- Result display format (toast, modal, inline)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-01 | Leads na execucao com tag "cliente" sao automaticamente atribuidos ao coordenador (Paulo) para monitoramento — nao entram na roleta | `existing_clients` table join; coordenador lookup by `role = 'coordenador' AND active = true ORDER BY nome ASC LIMIT 1`; insert/update logic same as for vendedores |
| DIST-02 | Leads novos na execucao sem tag "cliente" e sem vendedor da aprovacao sao automaticamente atribuidos ao vendedor com menos leads totais na execucao | Already implemented in `distributeUnassignedExecucao()` — only needs client pre-filtering added before the round-robin loop |
| DIST-03 | Distribuicao usa advisory lock (pg_advisory_lock) para prevenir dupla atribuicao entre cron e trigger manual | Must use dedicated connection via `getPool().connect()`, not `query()` helper; `pg_try_advisory_lock` recommended (skip-if-locked); fixed integer lock key (e.g., `1234567890`) |
| DIST-04 | Gestor pode disparar distribuicao manual via botao na UI | Existing `/api/execucao/distribute` POST route already wired; add button + result modal to `/distribuir` page |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (node-postgres) | ^8.13.0 | PostgreSQL client, advisory locks | Already in use; `pg_advisory_lock` is raw SQL via `client.query()` |
| Next.js | ^14.2.0 | API routes, page components | Project framework |
| TypeScript | ^5.5.0 | Type safety | Project language |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getPool()` from `@/lib/db` | project-local | Get dedicated client for lock scope | Required for advisory locks — do NOT use `query()` helper |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_try_advisory_lock` (skip) | `pg_advisory_lock` (wait/block) | Blocking lock waits indefinitely — bad for cron jobs on Vercel with 300s timeout. Skip-if-locked is safer: if cron already running, manual trigger returns `{ distributed: 0, skipped: true }` |
| In-memory JS mutex | `pg_advisory_lock` | In-memory mutex does not protect against multiple Vercel instances / serverless cold starts |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. Changes are confined to:
```
web/src/lib/
└── distribute-execucao.ts    # Add client routing + advisory lock wrapper

web/src/app/
├── api/execucao/distribute/
│   └── route.ts              # Expose { skipped: true } in response if locked
└── distribuir/
    └── page.tsx              # Add execution distribute button + result modal
```

### Pattern 1: Advisory Lock with Dedicated Connection

**What:** Acquire a session-level PostgreSQL advisory lock on a dedicated connection. Run distribution. Release lock. Return result.

**When to use:** Any operation where concurrent execution would cause duplicate assignments.

**Critical rule:** `pg_advisory_lock` / `pg_try_advisory_lock` are SESSION-LEVEL functions. They must be called and released on the SAME connection. The `query()` helper in `db.ts` returns the connection to the pool after each call, making it unusable for advisory locks. Use `getPool().connect()` instead.

```typescript
// Source: established pattern in web/src/lib/execucao-sync.ts (line 330)
// and web/src/lib/repo-sync.ts (line 504)
import { getPool } from '@/lib/db'

const DISTRIBUTE_LOCK_KEY = 1234567890 // fixed integer, unique per operation

export async function distributeUnassignedExecucao(): Promise<DistributeResult & { skipped?: boolean }> {
  const client = await getPool().connect()
  try {
    // Try to acquire lock — returns false immediately if already held
    const lockResult = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [DISTRIBUTE_LOCK_KEY]
    )
    if (!lockResult.rows[0].acquired) {
      return { distributed: 0, updated: 0, inserted: 0, vendedores: [], skipped: true }
    }

    try {
      // ... distribution logic using client.query() for all steps ...
      return result
    } finally {
      // Always release lock, even on error
      await client.query('SELECT pg_advisory_unlock($1)', [DISTRIBUTE_LOCK_KEY])
    }
  } finally {
    client.release()
  }
}
```

### Pattern 2: Client Routing Pre-Step

**What:** Before round-robin, split unassigned CNPJs into two buckets: `existing_clients` (route to coordenador) and non-clients (enter equalization queue).

**When to use:** Beginning of distribution run, after fetching unassigned list, before vendedor selection.

```typescript
// Source: existing_clients join pattern from web/src/app/api/leads/route.ts (line 123)
// Coordenador lookup pattern from decisions D-04

// Step: find coordenador
const coordRows = await client.query<{ id: string; nome: string }>(
  `SELECT id, nome FROM users WHERE role = 'coordenador' AND active = true ORDER BY nome ASC LIMIT 1`
)
const coordenador = coordRows.rows[0] // may be null — guard before using

// Step: check which unassigned CNPJs are existing clients
const unassigned = [...] // from existing query
const cnpjList = unassigned.map(r => r.cnpj) // already normalized (14 digits)

const clientRows = await client.query<{ cnpj: string }>(
  `SELECT cnpj FROM existing_clients WHERE cnpj = ANY($1::text[])`,
  [cnpjList]
)
const clientCnpjs = new Set(clientRows.rows.map(r => r.cnpj))

const clientLeads = unassigned.filter(r => clientCnpjs.has(r.cnpj))
const roundRobinLeads = unassigned.filter(r => !clientCnpjs.has(r.cnpj))
```

### Pattern 3: Result Modal on /distribuir Page

**What:** When gestor clicks "Distribuir Automaticamente (Execucao)", fetch `/api/execucao/distribute`, then show a modal with per-vendedor before/after counts from the `DistributeResult.vendedores` array.

**When to use:** After POST to `/api/execucao/distribute` returns a non-skipped result.

The existing `DistributeResult` type already returns:
```typescript
vendedores: { nome: string; before: number; assigned: number; after: number }[]
```

This is sufficient to render a table in the result modal. The distribuir page already has a similar inline feedback pattern for the approval-pipeline "Roleta" button (lines 220-261 of `page.tsx`). The modal can be a simple conditional render over the page content, consistent with the existing conflict-warning inline pattern.

### Anti-Patterns to Avoid

- **Using `query()` helper for advisory locks:** Each `query()` call borrows and returns a connection from the pool. `pg_advisory_unlock()` called on a different connection than the lock has no effect, leaving the lock permanently held.
- **Using `pg_advisory_lock` (blocking) instead of `pg_try_advisory_lock`:** A Vercel Function has a 300s max execution. If the cron is already running, a blocking lock would cause the manual trigger to wait up to 300s before timing out.
- **Querying `vendedor_projetos.is_existing_client`:** There is no such column on `vendedor_projetos`. The authoritative source is the `existing_clients` table, joined as `LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency protection | JS-level in-memory mutex | `pg_try_advisory_lock` | Serverless functions have no shared memory across invocations |
| Client detection | Custom "tag" column | `existing_clients` table join | Already the authoritative source used by all other queries |
| Vendedor count | Re-counting in JS after each assignment | In-memory `Map` (already implemented in `distribute-execucao.ts` lines 54-68) | SQL round-trip per assignment is expensive |

**Key insight:** The distribution function is already 90% complete. The advisory lock and client-routing additions are surgical modifications — not a rewrite.

---

## Common Pitfalls

### Pitfall 1: Advisory Lock on Pooled Connection
**What goes wrong:** `pg_try_advisory_lock` succeeds, `query()` helper returns the connection, then `pg_advisory_unlock()` runs on a different connection and fails silently. The lock is held until the PostgreSQL session disconnects.
**Why it happens:** The `query()` helper in `db.ts` acquires and releases connections per call. Session locks are tied to a specific backend PID.
**How to avoid:** Use `const client = await getPool().connect()` and hold the client for the full lock-acquire → work → unlock sequence. Call `client.release()` in the `finally` block.
**Warning signs:** Distribution never runs again after first invocation (lock permanently held).

### Pitfall 2: CNPJ Format Mismatch Between Tables
**What goes wrong:** `projetos_execucao.cnpj` stores 14-digit clean CNPJs (no formatting). `existing_clients.cnpj` may have different formatting depending on how it was inserted.
**Why it happens:** CNPJs flow through multiple import paths (API import, spreadsheet import, manual entry) with inconsistent formatting.
**How to avoid:** In the `existing_clients` join query, normalize both sides: `REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g') = pe.cnpj`. Check `existing_clients` table data at runtime to verify actual storage format.
**Warning signs:** Zero client CNPJs routed to coordenador despite known existing clients.

### Pitfall 3: Coordenador Not Found
**What goes wrong:** `SELECT ... WHERE role = 'coordenador' AND active = true` returns zero rows (user deactivated, role changed). Client leads fail to be assigned.
**Why it happens:** The system currently has one coordenador (Paulo). If that user is deactivated for any reason, the query returns nothing.
**How to avoid:** Guard with a null check: if coordenador is not found, log a warning and route client leads into the regular round-robin as a fallback (or skip them and log). Do NOT crash the entire distribution run.
**Warning signs:** Distribution runs but client CNPJs end up unassigned.

### Pitfall 4: Coordenador Excluded from Lead Count Equalization
**What goes wrong:** The current `distributeUnassignedExecucao()` queries `WHERE u.role = 'vendedor'`. The coordenador never appears in the vendedor list. If client leads are assigned to coordenador, they are not factored into the round-robin balance.
**Why it happens:** By design — coordenador is a separate routing target.
**How to avoid:** This is correct behavior per D-04. Client leads go to coordenador and are excluded from the equalization queue. The per-vendedor summary should show coordenador separately if any client leads were assigned.
**Warning signs:** None — this is intentional.

---

## Code Examples

### Full Modified distributeUnassignedExecucao Skeleton
```typescript
// Source: web/src/lib/distribute-execucao.ts (current) + patterns from execucao-sync.ts
import { getPool } from '@/lib/db'

const DISTRIBUTE_LOCK_KEY = 1234567890

export interface DistributeResult {
  distributed: number
  updated: number
  inserted: number
  skipped?: boolean  // true if lock was already held
  vendedores: { nome: string; before: number; assigned: number; after: number }[]
  coordenador?: { nome: string; assigned: number }  // new: client routing summary
}

export async function distributeUnassignedExecucao(): Promise<DistributeResult> {
  const client = await getPool().connect()
  try {
    const { rows: [{ acquired }] } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired', [DISTRIBUTE_LOCK_KEY]
    )
    if (!acquired) {
      return { distributed: 0, updated: 0, inserted: 0, vendedores: [], skipped: true }
    }
    try {
      // 1. Get active vendedores with current execucao counts
      // 2. Get unassigned execucao CNPJs
      // 3. Get coordenador (first active, by nome ASC)
      // 4. Split: client CNPJs (existing_clients join) vs round-robin
      // 5. Assign client CNPJs to coordenador
      // 6. Round-robin remaining CNPJs among vendedores
      // 7. Execute assignments (update existing or insert new vendedor_projetos rows)
      // 8. Return DistributeResult
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [DISTRIBUTE_LOCK_KEY])
    }
  } finally {
    client.release()
  }
}
```

### Checking Existing Clients in Bulk (SQL)
```sql
-- Source: pattern from web/src/app/api/leads/route.ts (line 123)
-- Check which normalized CNPJs are in existing_clients
SELECT REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g') AS cnpj
FROM existing_clients ec
WHERE REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g') = ANY($1::text[])
```

### Trigger Button in /distribuir (UI)
```tsx
// Source: pattern from web/src/app/distribuir/page.tsx (lines 398-413)
// Add below or alongside the existing "Roleta" section, scoped to gestor only

{userRole === 'gestor' && (
  <div className="border border-green-200 bg-green-50/50 rounded-xl p-4 flex items-center justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-green-800">Distribuir Execucao Automaticamente</p>
      <p className="text-xs text-green-600 mt-0.5">
        Atribui leads em execucao ao vendedor com menos leads. Clientes vao ao coordenador.
      </p>
    </div>
    <button
      onClick={handleDistribuirExecucao}
      disabled={distributing}
      className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      {distributing ? 'Distribuindo...' : 'Distribuir Automaticamente'}
    </button>
  </div>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No client routing | `existing_clients` table join | Phase 11 | Authoritative source for client detection across entire app |
| No locking on distribution | Will add `pg_try_advisory_lock` | Phase 18 (this phase) | Prevents double-assignment from cron + manual concurrent calls |

**Deprecated/outdated:**
- CONTEXT.md references `vendedor_projetos.is_existing_client` as the source — this is NOT a column in the actual schema. The `is_existing_client` boolean in the `VendedorProjeto` TypeScript type is a computed field derived from `LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj` in the API query layer.

---

## Open Questions

1. **CNPJ format in `existing_clients` table**
   - What we know: The table was populated via `/api/import-existing-clients/route.ts` and `repo-sync.ts`. The import code normalizes CNPJs with `cleanCNPJ()` in repo-sync but the import-existing-clients route stores whatever is passed.
   - What's unclear: Whether all rows in `existing_clients` are stored as 14-digit clean strings or with formatting characters.
   - Recommendation: The query should normalize both sides with `REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g')` to be safe. This matches the defensive pattern used throughout the codebase.

2. **Should coordenador be included in the "before/after" summary returned to the UI?**
   - What we know: The existing `DistributeResult.vendedores` array only covers vendedores. The coordenador is a separate routing target.
   - What's unclear: Whether the gestor needs to see how many client leads were routed to coordenador in the result modal.
   - Recommendation: Add an optional `coordenador?: { nome: string; assigned: number }` field to `DistributeResult`. The UI can display it as a separate row in the result modal.

3. **Lock key collision risk**
   - What we know: `pg_advisory_lock` uses a 64-bit integer key. The lock key `1234567890` is arbitrary.
   - What's unclear: Whether any other part of the system (e.g., Prisma migrations, if ever added) uses advisory locks with overlapping keys.
   - Recommendation: Pick a memorable but specific constant, e.g., `19876543210` (Phase 18 reference). Document it in a comment.

---

## Sources

### Primary (HIGH confidence)
- `web/src/lib/distribute-execucao.ts` — Complete existing distribution function read directly
- `web/src/lib/db.ts` — Pool configuration and `query()` helper behavior
- `web/src/lib/execucao-sync.ts` (line 330) — `getPool().connect()` dedicated connection pattern
- `web/src/app/api/leads/route.ts` (line 123) — `existing_clients` join pattern as authoritative source
- `web/src/app/api/setup-crm/route.ts` (line 195) — `existing_clients` table schema
- `web/src/app/distribuir/page.tsx` — Full existing UI, auto-distribute pattern, toast pattern
- `web/src/lib/dal.ts` — Role definitions, `isSeller()` confirming coordenador is a seller role

### Secondary (MEDIUM confidence)
- [PostgreSQL advisory locks — practical guide (Medium)](https://medium.com/inspiredbrilliance/a-practical-guide-to-using-advisory-locks-in-your-application-7f0e7908d7e9) — Confirmed: session-level locks must use same connection; `pg_try_advisory_lock` vs `pg_advisory_lock` tradeoffs
- [Distributed Locking with Postgres Advisory Locks (blog)](https://rclayton.silvrback.com/distributed-locking-with-postgres-advisory-locks) — Confirmed: connection pool incompatibility with session-level locks

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from codebase and package.json
- Architecture: HIGH — all canonical files read; patterns verified from existing code
- Pitfalls: HIGH (advisory lock pool pitfall) + MEDIUM (CNPJ format risk — needs runtime verification)
- Client detection source: HIGH — CONTEXT.md references `vendedor_projetos.is_existing_client` but actual code uses `existing_clients` table join; correction is certain

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable domain — PostgreSQL advisory locks, Next.js 14 API routes)
