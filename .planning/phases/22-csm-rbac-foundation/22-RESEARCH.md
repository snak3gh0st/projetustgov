# Phase 22: CSM RBAC Foundation - Research

**Researched:** 2026-04-27
**Domain:** Next.js RBAC, CSM role gating, CRM capability extension
**Confidence:** HIGH

## Summary

Phase 22 establishes the CSM area of the application: a protected `/csm` route for bruno@projetus.org, a `canCsm()` auth gate applied to all `/api/csm/*` routes, and CRM capabilities (add client, edit contact data, view own commissions). The `csm` role already exists in the DB enum, next-auth.d.ts, dal.ts, and Sidebar.tsx — but it currently redirects CSM users away from any CRM path and blocks all non-TGov API access. This is the main blocker that Phase 22 must resolve.

The existing middleware.ts csm block (lines 58-74) is incompatible with all four CSM requirements. It must be amended to carve out `/csm` page paths and `/api/csm/*` API paths before any CSM data routes are built. All CSM mutations go under the new `/api/csm/*` namespace — this is a pre-existing architectural decision from STATE.md and must not be relitigated.

Critical finding: **no single-client add endpoint exists in the codebase** (CSM-02). The only paths that write to `existing_clients` or `vendedor_projetos` are bulk Excel imports (`/api/import-existing-clients`, gestor-only) and automated ETL/distribute flows. A new `POST /api/csm/clients` endpoint must be built from scratch.

**Primary recommendation:** Three-plan structure — (1) dal.ts `canCsm()` + middleware amendment, (2) `/csm` page shell + new `/api/csm/clients` CRUD for CSM-01/02/03, (3) `/csm/comissoes` wiring CSM-04 via existing commission query logic adapted for csm role.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CSM-01 | CSM (bruno@projetus.org) pode acessar area exclusiva `/csm` com visão administrativa de todos os clientes históricos Projetus (2020–2025) | Middleware must carve out `/csm` from CRM block; `verifySession()` + canCsm() guard on page |
| CSM-02 | CSM pode adicionar novo cliente ao sistema | No existing single-client add endpoint — new `POST /api/csm/clients` required; writes to `existing_clients` + `vendedor_projetos` |
| CSM-03 | CSM pode editar dados de contato (telefone, email) de qualquer cliente | Mirror of `/api/leads/[cnpj]/contacts` PATCH but under `/api/csm/clients/[cnpj]/contacts`; `canCsm()` replaces `canModifyData()` gate |
| CSM-04 | CSM pode visualizar e calcular comissões próprias (mesmo sistema SDR/Closer existente) | Reuse `/api/comissoes` logic filtered to `session.userId`; add csm branch OR create `/api/csm/comissoes` — depends on whether bruno has `vendedor_id` rows |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | `^5.x` (project uses NextAuth v5 config style) | JWT session, role in token | Already in use — auth.config.ts + auth.ts pattern is locked |
| `@/lib/dal` | internal | RBAC helpers (canReadTgov, canWriteTgov, getApiSession, verifySession) | All role gates live here; canCsm() goes here |
| `@/lib/db` | internal | `query()` wrapper for postgres | All data access uses this |
| Next.js App Router | 14+ | Pages and API routes | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/navigation` | built-in | `redirect()` in server pages | Page-level role guards |
| `NextResponse` | built-in | JSON + status in API routes | API route responses |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `/api/csm/*` namespace | Extend existing `/api/leads/*` | Extending leads routes means adding csm exceptions throughout existing CRM logic — the project decision in STATE.md rejects this: "Anti-pattern to extend /api/execucao — incompatible grouping semantics" |

**Installation:** No new dependencies required for Phase 22.

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── app/
│   ├── csm/                    # NEW — CSM area pages
│   │   ├── page.tsx            # /csm entry point (verifySession + canCsm guard)
│   │   └── comissoes/
│   │       └── page.tsx        # /csm/comissoes (CSM-04)
│   └── api/
│       └── csm/                # NEW — CSM API namespace
│           ├── clients/
│           │   ├── route.ts    # GET (client list) + POST (add client)
│           │   └── [cnpj]/
│           │       └── contacts/
│           │           └── route.ts  # PATCH (edit contact)
│           └── comissoes/
│               └── route.ts    # GET (own commissions)
├── lib/
│   └── dal.ts                  # AMENDED — add canCsm() helper
└── middleware.ts               # AMENDED — carve out /csm paths
```

### Pattern 1: dal.ts Helper — canCsm()
**What:** Boolean function checking if a role may access CSM area
**When to use:** In every `/api/csm/*` route + in the `/csm` page
**Example:**
```typescript
// Source: web/src/lib/dal.ts (existing canReadTgov pattern)
/** CSM area: full read + write access for csm role; gestor can also access for oversight. */
export function canCsm(role: string | undefined): boolean {
  return role === 'csm' || role === 'gestor'
}
```
This follows the exact signature of `canReadTgov` and `canWriteTgov` already in dal.ts.

### Pattern 2: Page-Level Role Guard (Server Component)
**What:** verifySession() + role check + redirect
**When to use:** All CSM page routes
**Example:**
```typescript
// Source: web/src/app/tgov/page.tsx (lines 1-27) — exact pattern to copy
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function CsmPage() {
  const session = await verifySession()
  if (session.role !== 'csm' && session.role !== 'gestor') {
    redirect('/sem-permissao')
  }
  // render client component with session.role passed as prop
}
```

### Pattern 3: API Route Auth Gate
**What:** getApiSession() + canCsm check + 403 response
**When to use:** All `/api/csm/*` routes
**Example:**
```typescript
// Source: web/src/app/api/tgov/aprovacao/route.ts (lines 1-8) — analogous pattern
import { getApiSession, canCsm } from '@/lib/dal'

export async function GET(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // ... business logic
}
```

### Pattern 4: Middleware Amendment — CSM Carve-Out
**What:** Amend the `role === 'csm'` block in middleware.ts to allow `/csm` pages and `/api/csm/*`
**When to use:** This is a ONE-TIME change that unlocks all future CSM routes
**Example:**
```typescript
// Source: web/src/middleware.ts (lines 58-74) — current block to amend
if (role === 'csm') {
  // NEW: allow /csm area before checking CRM blocks
  if (pathname === '/csm' || pathname.startsWith('/csm/')) return  // pass through
  if (pathname.startsWith('/api/csm/')) return  // CSM API namespace allowed

  // EXISTING: keep TGov-only isolation for CRM paths
  if (isCrmPage || isCrmHome) {
    return Response.redirect(new URL('/tgov', req.url))
  }
  if (isCrmApi) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  // EXISTING: mutation gate for TGov remains
  const isTgovPrivilegedMutation =
    pathname.startsWith('/api/tgov/whitelist') ||
    pathname.startsWith('/api/tgov/interaction') ||
    pathname.startsWith('/api/tgov/tecnico')
  if (isTgovPrivilegedMutation && req.method !== 'GET') {
    return Response.json({ error: 'Forbidden: CSM is read-only on this resource' }, { status: 403 })
  }
}
```

### Pattern 5: Contact Edit (CSM-03)
**What:** PATCH handler in `/api/csm/clients/[cnpj]/contacts` mirroring existing pattern
**When to use:** CSM editing phone/email for any client
**Example:**
```typescript
// Source: web/src/app/api/leads/[cnpj]/contacts/route.ts (lines 103-171)
// Allowed fields for CSM: only ['telefone', 'email'] — CSM-03 scoped narrower than gestor
const CSM_ALLOWED_CONTACT_FIELDS = ['telefone', 'email']
```
Note: `verifyLeadAccess()` checks `vendedor_projetos.vendedor_id` or `closer_id` — CSM must bypass this check since CSM can edit ANY client's contacts (per CSM-03). Use `canCsm()` instead of `verifyLeadAccess()`.

### Anti-Patterns to Avoid
- **Adding csm to `canModifyData()`:** This would open all CRM write endpoints (status_contato, assignments, commission overrides) to CSM — far broader than required. Keep `canModifyData()` untouched.
- **Adding csm to `CRM_PAGE_PATHS` exceptions in middleware:** Piecemeal exceptions become unmaintainable. The carve-out must be a clear prefix: `/csm` and `/api/csm/*` only.
- **Extending `/api/leads/[cnpj]/contacts` for csm:** CSM bypasses `verifyLeadAccess()` (which filters by assigned vendedor); reusing the endpoint would require forking the auth logic inside it.
- **Extending `/api/comissoes` with a csm branch:** The existing comissoes route has gestor/coordenador/vendedor-specific logic; adding csm means touching mission-critical commission code. Mirror the relevant query in `/api/csm/comissoes` instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session auth | Custom JWT parsing | `getApiSession()` / `verifySession()` from dal.ts | Already handles token refresh, redirect on no-session |
| DB queries | Raw `pg` Pool instances | `query()` from `@/lib/db` | Project standard; handles SSL, connection pooling |
| Commission math | New calculation logic | Copy query pattern from `/api/comissoes/route.ts` | Existing formula already handles SDR/Closer/Exclusivo types |

**Key insight:** The auth layer is already complete — canCsm() is a 2-line addition to dal.ts. The implementation work is almost entirely in (a) middleware amendment, (b) new CSM page shell, and (c) new API endpoints under `/api/csm/*`.

## Common Pitfalls

### Pitfall 1: Middleware Blocks /api/csm/* Before canCsm() Runs
**What goes wrong:** New `/api/csm/*` routes return 403 because `isCrmApi` is true (any `/api/` path not listed as TGov/auth/health/usuarios).
**Why it happens:** `isCrmApi` is a catch-all: `pathname.startsWith('/api/') && !pathname.startsWith('/api/tgov') && !pathname.startsWith('/api/auth') && !pathname.startsWith('/api/usuarios') && !pathname.startsWith('/api/health')`. `/api/csm/` falls into this.
**How to avoid:** The middleware csm carve-out (Pattern 4) must `return` early for `/api/csm/` BEFORE the `isCrmApi` check runs.
**Warning signs:** `canCsm()` never called in logs; all CSM API calls return 403 with "Forbidden" (no role info).

### Pitfall 2: CSM-02 Assumes a Reusable Add-Client Endpoint
**What goes wrong:** Planning attempts to call an existing `/api/leads` POST or `/api/import-existing-clients` for CSM-02.
**Why it happens:** The success criterion says "via the existing CRM add-client flow" — but no such single-client form endpoint exists. The only insert paths are bulk Excel import (gestor-only) and automated ETL.
**How to avoid:** Plan explicitly creates `POST /api/csm/clients` that inserts into `existing_clients` (and optionally `vendedor_projetos`) with `canCsm()` gate.
**Warning signs:** 403 on POST to `/api/import-existing-clients`, or trying to adapt bulk import for single-client use.

### Pitfall 3: CSM-04 Commissions Return Empty Without vendedor_id Rows
**What goes wrong:** Bruno's commission view shows zero records.
**Why it happens:** `/api/comissoes` filters by `vp.vendedor_id = session.userId` + `status_contato = 'Fechado'`. If no `vendedor_projetos` rows exist with `vendedor_id = bruno_user_id`, the query returns empty.
**How to avoid:** Before deploying CSM-04, verify that bruno@projetus.org has entries as vendedor_id in the DB, OR clarify with client whether CSM commission model differs from SDR/Closer. This is an open question (see below).
**Warning signs:** `/api/csm/comissoes` returns empty array despite bruno having sales; gestor view in `/api/comissoes` also shows nothing for bruno.

### Pitfall 4: JWT Role Cache Delays CSM Access During Testing
**What goes wrong:** After bruno is given `csm` role in DB, `/csm` still redirects to login or wrong page.
**Why it happens:** `auth.ts` refreshes the role from DB at most once per hour (line 68: `REFRESH_MS = 60 * 60 * 1000`). During dev/testing, the stale JWT has the old role.
**How to avoid:** Sign out and sign back in to force a fresh JWT after any role change.
**Warning signs:** DB shows `role = 'csm'` but session.role shows old value; logs show no DB refresh hit.

### Pitfall 5: Sidebar Nav for CSM Doesn't Include /csm
**What goes wrong:** bruno can navigate to `/csm` directly but the sidebar shows no link.
**Why it happens:** The csm branch in Sidebar.tsx (lines 96-101) currently shows only TGov items.
**How to avoid:** Amend the csm navItems array to include `{ href: '/csm', label: 'CSM', icon: 'csm' }` when adding the `/csm` page.
**Warning signs:** No CSM nav item visible for bruno's sidebar.

## Code Examples

### Add canCsm() to dal.ts
```typescript
// Source: web/src/lib/dal.ts — add after canCommentTgov()
/** CSM area access: full CRUD on /csm routes and /api/csm/* routes. */
export function canCsm(role: string | undefined): boolean {
  return role === 'csm' || role === 'gestor'
}
```

### POST /api/csm/clients — new single-client add
```typescript
// Source: pattern from web/src/app/api/leads/[cnpj]/contacts/route.ts
// Inserts into existing_clients; optionally creates vendedor_projetos stub
export async function POST(request: NextRequest) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { cnpj, nome, notes } = await request.json()
  if (!cnpj || !nome) return NextResponse.json({ error: 'cnpj and nome required' }, { status: 400 })

  const result = await query(
    `INSERT INTO existing_clients (cnpj, nome, added_by, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cnpj) DO NOTHING
     RETURNING id`,
    [cleanCNPJ(cnpj), nome, session.userId, notes || null]
  )
  return result.length > 0
    ? NextResponse.json(result[0], { status: 201 })
    : NextResponse.json({ error: 'Client already exists' }, { status: 409 })
}
```

### PATCH /api/csm/clients/[cnpj]/contacts — edit contact (CSM-03)
```typescript
// Source: mirrors web/src/app/api/leads/[cnpj]/contacts/route.ts PATCH
// Key difference: no verifyLeadAccess() — CSM can edit ANY client's contacts
export async function PATCH(request: NextRequest, { params }: { params: { cnpj: string } }) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cnpj = decodeURIComponent(params.cnpj)
  const body = await request.json()
  const { id, telefone, email } = body  // CSM-03: only phone + email editable

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: string[] = []
  const values: unknown[] = []
  let paramIdx = 1
  if (telefone !== undefined) { updates.push(`telefone = $${paramIdx++}`); values.push(telefone) }
  if (email !== undefined) { updates.push(`email = $${paramIdx++}`); values.push(email) }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  values.push(id, cnpj)
  await query(
    `UPDATE lead_contacts SET ${updates.join(', ')} WHERE id = $${paramIdx} AND lead_cnpj = $${paramIdx + 1}`,
    values
  )
  return NextResponse.json({ success: true })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSM blocked from all CRM APIs | CSM gets `/csm` + `/api/csm/*` namespace | Phase 22 | Unlocks CSM capabilities without polluting CRM routes |
| No `canCsm()` helper | `canCsm()` exported from dal.ts | Phase 22 | Consistent RBAC pattern; planner creates this in Wave 0 |
| CSM nav = TGov items only | CSM nav gains `/csm` entry | Phase 22 | Sidebar.tsx csm block amended |

**Deprecated/outdated:**
- "CSM é TGov-only" comment in middleware.ts: This is Phase 20's constraint, intentionally lifted by Phase 22.

## Open Questions

1. **CSM-04: Does bruno@projetus.org have vendedor_projetos rows with his user_id as vendedor_id?**
   - What we know: The commission system filters `vp.vendedor_id = session.userId`. CSM-04 requirement says "mesmo sistema SDR/Closer existente."
   - What's unclear: Whether bruno was ever assigned leads as a vendedor, or whether CSM commissions come from a separate source (TGov upsell deals not in vendedor_projetos).
   - Recommendation: Planner should add a DB verification step to check `SELECT COUNT(*) FROM vendedor_projetos WHERE vendedor_id = (SELECT id FROM users WHERE email = 'bruno@projetus.org')` before building the commission UI. If zero, the commission view will always be empty — needs client clarification.

2. **CSM-01: What constitutes "todos os clientes históricos Projetus (2020–2025)"?**
   - What we know: `existing_clients` and `vendedor_projetos` are the CRM client tables. Phase 23 will build the full unified view.
   - What's unclear: Phase 22 only needs the auth gate and shell — the actual client list query is Phase 23. But the `/csm` page.tsx shell needs a placeholder that doesn't mislead.
   - Recommendation: `/csm` page in Phase 22 should render a minimal placeholder ("CSM area under construction") or a basic client count — NOT the full list (that's Phase 23). The planner should scope this clearly.

3. **Sidebar nav icon for /csm**
   - What we know: Sidebar.tsx uses a `switch(name)` in `NavIcon()` with hardcoded SVG paths. No 'csm' case exists.
   - What's unclear: Whether to add a new icon or reuse an existing one (e.g., 'leads' or 'bi').
   - Recommendation: Reuse existing icon (e.g., 'leads' or 'pipeline') — a new SVG can be added in Phase 24 UI Refresh.

## Sources

### Primary (HIGH confidence)
- `web/src/middleware.ts` — current CSM block (lines 58-74); confirmed isCrmApi catch-all
- `web/src/lib/dal.ts` — all existing canX() helpers; no canCsm() exists
- `web/src/app/api/leads/[cnpj]/contacts/route.ts` — contact CRUD pattern
- `web/src/app/api/comissoes/route.ts` — commission query logic, role filtering
- `web/src/app/api/import-existing-clients/route.ts` — only existing_clients INSERT (bulk only)
- `web/src/app/api/import-spreadsheet/route.ts` — only vendedor_projetos INSERT (bulk only)
- `web/src/app/tgov/page.tsx` — canonical page-level role guard pattern
- `web/src/components/Sidebar.tsx` — current csm nav block (lines 96-101)
- `.planning/STATE.md` — `/api/csm/*` namespace decision locked

### Secondary (MEDIUM confidence)
- `web/src/lib/auth.ts` lines 65-78 — JWT role refresh every 60 min (relevant for testing pitfall)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies
- Architecture: HIGH — patterns are direct copies from TGov + contacts routes; decisions locked in STATE.md
- Pitfalls: HIGH — confirmed by reading middleware.ts and grep results (no single-client add endpoint)

**Research date:** 2026-04-27
**Valid until:** 2026-06-01 (stable stack — NextAuth/Next.js patterns don't shift monthly)
