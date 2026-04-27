# Phase 22: CSM RBAC Foundation — Research

**Researched:** 2026-04-27
**Domain:** Next.js App Router RBAC, Auth.js v5 JWT sessions, middleware route isolation
**Confidence:** HIGH — based on direct codebase inspection

---

## Summary

Phase 22 establishes the CSM role's dedicated area (`/csm`) with proper auth gating and CRM capabilities. The `csm` role already exists in the DB enum, `dal.ts` Role type, and `next-auth.d.ts`. What is missing is: (1) the `canCsm()` dal helper, (2) the `/csm` page and middleware allowance, (3) a POST endpoint to add a client (no such endpoint exists today), (4) middleware exemptions for CSM to access `/comissoes` or a proxy commission endpoint, and (5) a contact-edit path CSM can call without `canModifyData()` or `verifyLeadAccess()` blocking it.

The middleware today actively blocks the `csm` role from every CRM path and every non-tgov API. The commissions page (`/comissoes`) sits in `CRM_PAGE_PATHS` and is redirected for CSM. The add-client "flow" referenced in ROADMAP success criteria does not exist as a REST endpoint — inserts into `vendedor_projetos` only happen via gestor-only Excel imports and automated ETL. These gaps are real work, not mere plumbing.

**Primary recommendation:** Create `/app/csm/` page tree + `canCsm()` dal helper + `/api/csm/*` namespace for all four capabilities. Extend middleware to pass `/csm` and `/api/csm` for the CSM role. Reuse the existing commission logic but proxy through `/api/csm/comissoes` to enforce the self-only filter.

---

<user_constraints>
## User Constraints (from STATE.md locked decisions)

### Locked Decisions
- CSM routes under `/api/csm/*` (new namespace — anti-pattern to extend `/api/execucao`; incompatible grouping semantics)
- `canCsm()` auth gate must exist before any CSM data routes are built
- Role `csm` is already in the DB enum and `next-auth.d.ts` / `dal.ts` — Phase 21 complete
- Lazy on-demand budget fetch with 7-day JSONB cache (not full ETL) — deferred to Phase 25
- Target CSM user: `bruno@projetus.org`

### Claude's Discretion
- Whether CSM commissions are served via new `/api/csm/comissoes` proxy or by extending middleware to pass `/api/comissoes` for CSM role — either is valid; proxy is recommended for cleaner isolation
- Whether `canModifyData()` is extended to include CSM or a separate `canCsmWriteClient()` helper is created — separate helper is recommended to avoid unintended CRM write grants
- Page-level UX for `/csm` (minimal scaffold vs. full layout) — scaffold is fine for Phase 22; data comes in Phase 23

### Deferred Ideas (OUT OF SCOPE for Phase 22)
- CSM unified client list, priority badges, BI dashboard (Phase 23)
- Collapsible sidebar, dark mode, mobile (Phase 24)
- Budget items ETL, csm_budget_cache table (Phase 25)
- AI tags (Phase 26)
- Auto-notifications, custom CSM comp rules (v7.0)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CSM-01 | CSM (bruno@projetus.org) pode acessar area exclusiva `/csm` com visao administrativa de todos os clientes historicos Projetus (2020-2025) | Auth gate via `canCsm()` + middleware allowance for `/csm`. Page scaffold only in Phase 22; data query in Phase 23. |
| CSM-02 | CSM pode adicionar novo cliente ao sistema | No existing POST endpoint for `vendedor_projetos`. Requires new `POST /api/csm/clients`. |
| CSM-03 | CSM pode editar dados de contato (telefone, email) de qualquer cliente | `canModifyData()` excludes CSM. `verifyLeadAccess()` would deny CSM. Requires new `/api/csm/clients/[cnpj]/contacts` PATCH bypassing both blockers. |
| CSM-04 | CSM pode visualizar e calcular comissoes proprias (mesmo sistema SDR/Closer existente) | `/comissoes` route is blocked in middleware for CSM. Either extend middleware or create `GET /api/csm/comissoes` proxy with `vendedor_id = session.userId` filter. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth v5 | `^5.0.0-beta.30` | JWT sessions, `auth()` callable in middleware + RSC | Already in use; `session.user.role` carries the role |
| Next.js App Router | `^14.2.0` | Page tree, API routes, middleware | Entire app uses this |
| pg (node-postgres) | `^8.13.0` | DB queries via `query()` helper in `src/lib/db.ts` | Existing abstraction |
| Tailwind CSS | `^3.4.0` | Styling | Project standard |
| zod | `^4.3.6` | Input validation in API routes | Used in validations.ts |

### No New Dependencies
Phase 22 introduces no new npm packages. All capabilities build on existing stack.

---

## Architecture Patterns

### Recommended Project Structure (Phase 22 additions)

```
web/src/
├── app/
│   ├── csm/
│   │   └── page.tsx          # Server component — canCsm() gate, scaffold UI
│   └── api/
│       └── csm/
│           ├── clients/
│           │   ├── route.ts                  # POST: add new client (CSM-02)
│           │   └── [cnpj]/
│           │       └── contacts/
│           │           └── route.ts          # PATCH/GET: edit contact (CSM-03)
│           └── comissoes/
│               └── route.ts                  # GET: commissions proxy (CSM-04)
├── lib/
│   └── dal.ts                # Add canCsm() helper
components/
└── Sidebar.tsx               # Add /csm nav item for csm role
middleware.ts                 # Add /csm and /api/csm to CSM allow-list
```

### Pattern 1: canCsm() Helper in dal.ts

**What:** Function that returns true only for `csm`, `gestor`, `admin`. Added to `dal.ts` following the exact pattern of `canReadTgov()` and `canWriteTgov()`.

**When to use:** Called in every `/api/csm/*` route handler before processing. Also used in `app/csm/page.tsx` server component to redirect non-CSM roles.

```typescript
// Source: web/src/lib/dal.ts — follows existing helper pattern
/** CSM area: read + write access for own CSM data. Gestor/admin can also enter for oversight. */
export function canCsm(role: string | undefined): boolean {
  return role === 'csm' || role === 'gestor' || role === 'admin'
}
```

### Pattern 2: Middleware Extension for /csm

**What:** The `csm` role block in `middleware.ts` (lines 58–74) must be updated to explicitly allow `/csm` and `/api/csm` paths through. Currently `/api/csm/*` hits the `isCrmApi` block (any `/api/*` not in the explicit exceptions list) and returns 403.

The `isCrmApi` check is:
```typescript
const isCrmApi = pathname.startsWith('/api/') &&
  !pathname.startsWith('/api/tgov') &&
  !pathname.startsWith('/api/auth') &&
  !pathname.startsWith('/api/usuarios') &&
  !pathname.startsWith('/api/health')
```

`/api/csm/*` hits this and returns 403 for CSM today. Fix: add `/api/csm` to the exclusion list globally OR add a pass-through before the CSM redirect block.

```typescript
// Required change: add CSM exemptions BEFORE the CRM API block
const CSM_PATHS = ['/csm', '/api/csm']
const isCsmPath = CSM_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

if (role === 'csm') {
  if (isCsmPath) return  // CSM-area: allow through
  if (isCrmPage || isCrmHome) {
    return Response.redirect(new URL('/csm', req.url))  // redirect to /csm not /tgov
  }
  // ... rest of existing mutation gate logic
}
```

Note: `/comissoes` page (CRM_PAGE_PATHS) is handled via `/api/csm/comissoes` proxy + an embedded tab in the `/csm` page — NOT by exempting the CRM `/comissoes` page for CSM.

### Pattern 3: /csm Page Server Component

**What:** Server component that uses `verifySession()` (redirect-on-no-session) then `canCsm()` (redirect to /sem-permissao if false). Established pattern from `/tgov/page.tsx`.

```typescript
// Source: web/src/app/tgov/page.tsx — same guard pattern
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { canCsm } from '@/lib/dal'

export default async function CsmPage() {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  // Phase 22: scaffold UI only; full client list in Phase 23
  return <CsmDashboardClient userRole={session.role} />
}
```

### Pattern 4: POST /api/csm/clients (CSM-02 — New Client)

**What:** A new POST endpoint that inserts into `vendedor_projetos`. No existing endpoint does this for CSM. Requires: CNPJ + nome minimum. Sets `vendedor_id = session.userId` (CSM is the "owner" of the client for commission tracking purposes).

The planner must decide: should the new client also be inserted into `existing_clients`? Research recommendation: YES — `existing_clients` flags known Projetus clients and `LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj` drives the `is_existing_client` flag in lead display. Use UPSERT (ON CONFLICT DO NOTHING) for both tables to handle pre-existing CNPJs.

```typescript
// Pattern from web/src/app/api/leads/[cnpj]/contacts/route.ts
const session = await getApiSession()
if (!session || !canCsm(session.role)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
// Insert into vendedor_projetos with vendedor_id = session.userId
// Insert into existing_clients ON CONFLICT DO NOTHING
```

### Pattern 5: PATCH /api/csm/clients/[cnpj]/contacts (CSM-03 — Edit Contact)

**What:** Parallel to `/api/leads/[cnpj]/contacts` PATCH but without `canModifyData()` or `verifyLeadAccess()` checks (both block CSM). Uses `canCsm()` instead. Only allows `telefone` and `email` field updates per CSM-03 scope — never expose `status_contato`, `tipo_vendedor`, or `comissao_*` to CSM writes.

```typescript
// Allowed fields for CSM contact edit — restricted scope
const allowedFields = ['telefone', 'email']
```

Note: CSM-03 says "edit contact data for any client" — `verifyLeadAccess()` must NOT be called here, because it requires `vendedor_projetos.vendedor_id = userId` which fails for clients CSM doesn't own.

### Pattern 6: GET /api/csm/comissoes (CSM-04 — Commissions)

**What:** Thin proxy that runs the same SQL as `/api/comissoes` but hardcodes `vendedor_id = session.userId`. CSM never sees other sellers' data.

The existing `/api/comissoes/route.ts` has no CSM branch — if CSM reached it, the query has no `vendedor_id` filter for unmatched roles, which could return all sellers' data. The proxy approach ensures isolation without modifying the CRM commission endpoint.

```typescript
// Source: web/src/app/api/comissoes/route.ts pattern — add CSM branch equivalent to 'vendedor'
// filters.push(`vp.vendedor_id = $${paramIndex++}`)
// params.push(session.userId)
// Never allow vendedorId override for CSM (gestor-only privilege)
```

### Pattern 7: Sidebar Update for CSM

`Sidebar.tsx` lines 96–101 give CSM only 3 TGov nav items. Add `/csm` as first nav item. The commission view (CSM-04) should be a tab within `/csm`, not a separate `/comissoes` link (since `/comissoes` is blocked in middleware for CSM and the CSM commission data comes from `/api/csm/comissoes`).

```typescript
// Current csm block (lines 96–101) — add /csm entry:
: user.role === 'csm'
? [
    { href: '/csm', label: 'Clientes CSM', icon: 'leads' },  // NEW
    { href: '/tgov/pipeline', label: 'TGov Pipeline', icon: 'pipeline' },
    { href: '/tgov?view=dashboard', label: 'TGov Dashboard', icon: 'tgov' },
    { href: '/tgov', label: 'TGov BI', icon: 'pipeline' },
  ]
```

### Anti-Patterns to Avoid

- **Extending `/api/leads` POST for CSM**: the leads table is CRM-scoped; CSM adding a client via the SDR lead flow is semantically wrong. Use `/api/csm/clients`.
- **Calling `canModifyData()` for CSM write checks**: it excludes CSM by design. Use `canCsm()` for CSM write gates.
- **Exempting all of `/api/*` in middleware for CSM**: CSM should only have `/api/csm/*` access. Do not add a blanket exception.
- **Using `verifyLeadAccess()` for CSM contact edits**: it checks `vendedor_projetos.vendedor_id = userId`, which denies CSM for clients not assigned to them. CSM-03 requires "any client" access — skip this helper in CSM contact routes.
- **Pointing the CSM sidebar `/comissoes` link at `/comissoes`**: that page redirects CSM to `/csm` via middleware. Commission view must be embedded in `/csm` with data from `/api/csm/comissoes`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session check + role gate | Custom session extraction | `getApiSession()` from `dal.ts` | Handles JWT refresh, returns typed session |
| Page-level auth with redirect | Manual session check | `verifySession()` from `dal.ts` | Handles unauthenticated redirect to /login |
| DB connection pooling | New Pool instance | `query()` from `lib/db.ts` | Existing pool with retry logic |
| Commission calculation logic | New calculation code | Reuse SQL from `/api/comissoes/route.ts` | The logic is battle-tested; proxy, don't duplicate |

---

## Common Pitfalls

### Pitfall 1: /api/csm/* Returns 403 for CSM
**What goes wrong:** `/api/csm/*` matches the `isCrmApi` check in middleware (any `/api/*` not in the explicit whitelist). CSM's current middleware block returns 403 for all CRM APIs including the new `/api/csm` namespace.
**Why it happens:** `/api/csm` was not in the whitelist when the CSM block was written — it didn't exist yet.
**How to avoid:** Add `/api/csm` to the middleware exception list (same level as `/api/tgov`, `/api/auth`, `/api/usuarios`, `/api/health`) before the `isCrmApi` variable is computed. OR add the pass-through inside the CSM role block before `if (isCrmApi)`.
**Warning signs:** Every `/api/csm/*` call returns HTTP 403 with `{"error":"Forbidden"}`.

### Pitfall 2: Commission Query Returns All Sellers for CSM
**What goes wrong:** `/api/comissoes/route.ts` has explicit branches for `vendedor`, `coordenador`, and `vendedorId` param. CSM matches none. The `filters` array at that point contains only `['vp.vendedor_id IS NOT NULL', ...]` — no user scoping. CSM would see all closed deals.
**Why it happens:** CSM role did not exist when the commission endpoint was written.
**How to avoid:** Use `/api/csm/comissoes` proxy that always prepends `vp.vendedor_id = $N` with `session.userId`. Never allow CSM to hit raw `/api/comissoes`.
**Warning signs:** Commission response contains rows with multiple different `vendedor_id` values.

### Pitfall 3: bruno@projetus.org User May Not Exist
**What goes wrong:** No code references `bruno@projetus.org`. If the user row doesn't exist in the DB with `role = 'csm'`, CSM-01 through CSM-04 cannot be tested with this account.
**Why it happens:** User creation is a manual DB operation; no migration creates named users.
**How to avoid:** Wave 0 must verify: `SELECT id, email, role FROM users WHERE email = 'bruno@projetus.org'`. If no row, insert it with `role = 'csm'` and a temporary password. This is a pre-implementation gate.
**Warning signs:** Login as bruno@projetus.org returns invalid credentials.

### Pitfall 4: auth.ts JWT Callback Type-Casts Role Incompletely
**What goes wrong:** `auth.ts` line 63 type-casts `token.role` as `'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador'` — a stale union that predates CSM and TGov roles. TypeScript may surface no errors but the narrow type could cause issues if any code does a strict type check.
**Why it happens:** JWT callback typing was not updated when new roles were added.
**How to avoid:** Update the `token.role` cast in `auth.ts` jwt callback to use the `Role` type from `dal.ts`, or at minimum add `'csm'` to the union. No runtime impact but prevents TS complaints and makes the code self-documenting.

### Pitfall 5: Middleware Redirect Loop if /csm Page Appears in isCrmPage
**What goes wrong:** If `/csm` is accidentally added to `CRM_PAGE_PATHS` or if the redirect for CSM is changed to `/csm` without the path being exempted, CSM would loop between `/csm` (redirects to `/csm`) indefinitely.
**Why it happens:** `/csm` is NOT currently in `CRM_PAGE_PATHS` so this is safe today. Risk is introduced only by future edits.
**How to avoid:** Never add `/csm` to `CRM_PAGE_PATHS`. When changing the CSM redirect from `/tgov` to `/csm`, ensure the `isCsmPath` check fires before `isCrmPage`.

### Pitfall 6: Contact Edit Scope Creep
**What goes wrong:** CSM contact edit PATCH accidentally allows updating `status_contato`, `tipo_vendedor`, or `comissao_*` fields, giving CSM power to mark clients as "Fechado" and trigger commission calculations.
**Why it happens:** The existing `/api/leads/[cnpj]/contacts` PATCH `allowedFields` list is broad. If the new CSM route copies it carelessly, status_contato could be included.
**How to avoid:** The new `/api/csm/clients/[cnpj]/contacts` PATCH must define its own `allowedFields = ['telefone', 'email']` — nothing more.

---

## Code Examples

### Verified: Auth Gate Pattern (from /tgov/page.tsx)
```typescript
// Source: web/src/app/tgov/page.tsx lines 1-27
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const session = await verifySession()   // redirects to /login if no session
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  // render...
}
```

### Verified: API Route Auth Gate Pattern (from /api/tgov/aprovacao/route.ts)
```typescript
// Source: web/src/app/api/tgov/aprovacao/route.ts lines 44-49
export async function GET(request: NextRequest) {
  const session = await getApiSession()
  if (!session || !canReadTgov(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ...
}
```

### Verified: Role-Scoped Commission Filter (from /api/comissoes/route.ts)
```typescript
// Source: web/src/app/api/comissoes/route.ts lines 28-41
// Existing branches — CSM must use equivalent proxy:
if (session.role === 'vendedor') {
  filters.push(`vp.vendedor_id = $${paramIndex++}`)
  params.push(session.userId)
} else if (session.role === 'coordenador' && !vendedorId) {
  filters.push(`(vp.vendedor_id = $${paramIndex} OR vp.closer_id = $${paramIndex})`)
  params.push(session.userId)
  paramIndex++
}
// CSM proxy (/api/csm/comissoes) always uses vendedor branch logic:
// filters.push(`vp.vendedor_id = $${paramIndex++}`)
// params.push(session.userId)
```

### Verified: Current CSM Middleware Block (to be extended)
```typescript
// Source: web/src/middleware.ts lines 58–74
// Current — blocks all non-TGov API for CSM:
if (role === 'csm') {
  if (isCrmPage || isCrmHome) {
    return Response.redirect(new URL('/tgov', req.url))
  }
  if (isCrmApi) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isTgovPrivilegedMutation = ...
  if (isTgovPrivilegedMutation && req.method !== 'GET') {
    return Response.json({ error: 'Forbidden: CSM is read-only on this resource' }, { status: 403 })
  }
}
// isCrmApi catches /api/csm/* today because it is not in the whitelist
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| CSM redirected to /tgov on CRM paths | Add `/csm` pass-through; redirect CRM paths to `/csm` instead | CSM lands on own area |
| No add-client REST endpoint | New `POST /api/csm/clients` | Satisfies CSM-02 |
| canModifyData() gates contact writes (excludes CSM) | `canCsm()` gate for new `/api/csm/clients/[cnpj]/contacts` | CSM can edit contacts without gestor privileges |
| Commission endpoint has no CSM branch | `/api/csm/comissoes` proxy pinned to session.userId | CSM-04 isolation: own commissions only, no cross-seller leak |
| canCsm() does not exist | Add to dal.ts | Single source of truth for CSM access decisions |

---

## Open Questions

1. **Does `bruno@projetus.org` exist in the DB with role='csm'?**
   - What we know: Role `csm` is in enum; no code references this email; the user was not created by any migration script in the repository
   - What's unclear: Whether it was created manually after Phase 20/21
   - Recommendation: Wave 0 task must verify via DB query and create if missing

2. **Should POST /api/csm/clients also insert into `existing_clients`?**
   - What we know: `existing_clients` drives the `is_existing_client` flag in lead display; `LEFT JOIN existing_clients ec ON vp.cnpj = ec.cnpj` is in the leads query
   - What's unclear: Whether CSM-added clients should be flagged as "existing Projetus clients" for CRM visibility
   - Recommendation: Yes — insert into both tables with ON CONFLICT DO NOTHING; this ensures correct flag behavior if a CSM client later appears in the CRM leads view

3. **Commission view: embedded tab in /csm or standalone page?**
   - What we know: `/comissoes` page is a 'use client' component with significant local state; `/comissoes` is blocked for CSM in middleware
   - What's unclear: Whether the commission UI should be duplicated into `/csm/comissoes/page.tsx` or rendered as a tab within `/csm/page.tsx`
   - Recommendation: Standalone sub-page `/csm/comissoes/page.tsx` that reuses the same client component wired to `/api/csm/comissoes`. This avoids bloating the main CSM page and makes the sidebar navigation straightforward.

---

## Validation Architecture

> No test framework (vitest/jest/playwright) is installed in `web/`. Verification follows the project convention of curl + Node.js tsx scripts. The planning/config.json has no `workflow.nyquist_validation` key — no automated test suite required. Verification is manual but must be specified concretely.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — project uses curl + tsx scripts (see `web/scripts/`) |
| Config file | none |
| Quick run command | `curl` against local dev server (see per-requirement commands below) |
| Full suite command | Run all curl checks sequentially |
| Estimated runtime | ~5–15 seconds per check |

### Phase Requirements — Verification Map

| Req ID | Behavior | Test Type | Verification Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| CSM-01 | Unauthenticated user → redirect to /login | integration | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/csm` → `307` | Wave 0 gap: /csm page does not exist yet |
| CSM-01 | CSM session → 200 on /csm | integration | curl with csm session cookie → `200` | same |
| CSM-01 | Vendedor session → redirect away from /csm | integration | curl with vendedor session cookie → `307` | same |
| CSM-02 | CSM can POST new client | integration | `curl -X POST /api/csm/clients -b csm_cookie -d '{"cnpj":"...","nome":"..."}' -w "%{http_code}"` → `201` | Wave 0 gap: route does not exist |
| CSM-02 | Anon/vendedor → blocked | integration | same curl without cookie → `401`; vendedor cookie → `403` | same |
| CSM-02 | New row appears in vendedor_projetos | db | `SELECT cnpj, nome, vendedor_id FROM vendedor_projetos WHERE cnpj='...'` confirms row + vendedor_id = bruno_uuid | same |
| CSM-03 | CSM can PATCH telefone/email via /api/csm/clients/[cnpj]/contacts | integration | `curl -X PATCH /api/csm/clients/{cnpj}/contacts -b csm_cookie -d '{"id":1,"telefone":"..."}' -w "%{http_code}"` → `200` | Wave 0 gap: route does not exist |
| CSM-03 | Vendedor blocked from PATCH | integration | same curl with vendedor cookie → `403` | same |
| CSM-03 | Only telefone/email updatable (no status_contato) | unit | Code review: verify `allowedFields = ['telefone', 'email']` in route handler | same |
| CSM-04 | GET /api/csm/comissoes returns only bruno's rows | integration | `curl /api/csm/comissoes -b csm_cookie` → JSON; all `leads[].vendedor_id` == bruno_uuid | Wave 0 gap: route does not exist |
| CSM-04 | No cross-seller data leak | db | Count distinct vendedor_ids in response — must be 1 | same |

### Nyquist Sampling Rate
- **Minimum sample interval:** After each route/page task, run the corresponding curl check manually
- **Full suite trigger:** After all 4 Phase 22 plans are complete, run all curl checks in sequence
- **Phase-complete gate:** All checks above return expected HTTP codes before moving to Phase 23
- **Estimated feedback latency per task:** ~5 seconds (curl round-trip on local dev server)

### Wave 0 Gaps (must be created before implementation)

- [ ] Verify `bruno@projetus.org` user exists in DB:
  ```bash
  # Run from web/ with DATABASE_URL set:
  npx tsx -e "
  const { query } = require('./src/lib/db')
  query(\"SELECT id, email, role FROM users WHERE email = 'bruno@projetus.org'\")
    .then(rows => { console.log(rows.length ? JSON.stringify(rows[0]) : 'NOT FOUND'); process.exit(0) })
  "
  ```
  If NOT FOUND: create user with role='csm' and a temporary password.

- [ ] No test framework to install — verification is curl-based.

*(If bruno user exists: "No user creation gap — existing test infrastructure covers pre-condition.")*

### Concrete Verification Scripts

**CSM-01 — auth gate:**
```bash
# Anon → redirect to login (307)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/csm
# Expected: 307

# Obtain CSM session token by logging in:
CSM_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "email=bruno%40projetus.org&password=<password>&csrfToken=<token>" \
  -c /tmp/csm_cookies.txt -b /tmp/csm_cookies.txt \
  | ... ) # token extraction depends on next-auth cookie flow

# CSM authenticated → 200
curl -s -o /dev/null -w "%{http_code}" \
  -b /tmp/csm_cookies.txt \
  http://localhost:3000/csm
# Expected: 200
```

**CSM-02 — add client:**
```bash
curl -s -X POST http://localhost:3000/api/csm/clients \
  -H "Content-Type: application/json" \
  -b /tmp/csm_cookies.txt \
  -d '{"cnpj":"12345678000195","nome":"Test Client CSM Phase 22"}' \
  -w "\nHTTP: %{http_code}\n"
# Expected: HTTP 201, body contains the created vendedor_projetos row id

# Isolation check — vendedor session blocked:
curl -s -X POST http://localhost:3000/api/csm/clients \
  -H "Content-Type: application/json" \
  -b /tmp/vendedor_cookies.txt \
  -d '{"cnpj":"12345678000195","nome":"Test"}' \
  -w "\nHTTP: %{http_code}\n"
# Expected: HTTP 403
```

**CSM-03 — edit contact:**
```bash
# First get a contact ID from the test client created above
CONTACT_ID=$(curl -s "http://localhost:3000/api/csm/clients/12345678000195/contacts" \
  -b /tmp/csm_cookies.txt | npx tsx -e "process.stdin.pipe(require('stream').Transform({transform(c,e,cb){process.stdout.write(JSON.parse(c)[0].id+'');cb()}}))")

curl -s -X PATCH "http://localhost:3000/api/csm/clients/12345678000195/contacts" \
  -H "Content-Type: application/json" \
  -b /tmp/csm_cookies.txt \
  -d "{\"id\": ${CONTACT_ID}, \"telefone\": \"(11) 98888-7777\"}" \
  -w "\nHTTP: %{http_code}\n"
# Expected: HTTP 200 {"success":true}
```

**CSM-04 — commission isolation:**
```bash
curl -s "http://localhost:3000/api/csm/comissoes" \
  -b /tmp/csm_cookies.txt \
  | npx tsx -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))
    const ids = new Set(data.leads.map(l => l.vendedor_id))
    console.log(ids.size === 1 ? 'PASS: single vendedor_id' : 'FAIL: data leak — multiple ids: ' + [...ids].join(','))
  "
# Expected: PASS: single vendedor_id
```

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `web/src/middleware.ts` — complete CSM block, CRM_PAGE_PATHS, isCrmApi definition
- Direct file inspection: `web/src/lib/dal.ts` — Role type, canReadTgov(), canWriteTgov(), canModifyData(), verifyLeadAccess()
- Direct file inspection: `web/src/lib/auth.ts` — JWT callback, session callback, role storage in token
- Direct file inspection: `web/src/auth.config.ts` — edge-compatible middleware auth
- Direct file inspection: `web/src/app/api/comissoes/route.ts` — commission filter logic, confirmed no CSM branch
- Direct file inspection: `web/src/app/api/leads/[cnpj]/contacts/route.ts` — canModifyData() gate, verifyLeadAccess() gate
- Direct file inspection: `web/src/components/Sidebar.tsx` — current CSM nav items (TGov only, no /csm)
- Direct file inspection: `web/src/app/layout.tsx` — RootLayout session handling
- Direct file inspection: `web/src/app/tgov/page.tsx` — established page guard pattern
- Direct file inspection: `web/src/app/api/leads/route.ts` — confirmed GET-only (no POST for add-client)
- Direct file inspection: `web/package.json` — confirmed no vitest/jest/playwright installed

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — locked architecture decisions for v6.0, bruno@projetus.org as target user
- `.planning/ROADMAP.md` — Phase 22 success criteria and phase dependencies

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct package.json + source file inspection
- Architecture: HIGH — all patterns derived from existing codebase, no assumptions
- Pitfalls: HIGH — all 6 pitfalls confirmed by direct code inspection
- Validation: MEDIUM — curl scripts are patterns; actual session token flow requires running dev server and may need adaptation for next-auth v5 cookie format

**Research date:** 2026-04-27
**Valid until:** 2026-06-01 (stable Next.js App Router RBAC patterns)
