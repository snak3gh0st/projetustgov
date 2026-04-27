---
phase: 22-csm-rbac-foundation
plan: 02
subsystem: api
tags: [csm, rbac, api, vendedor_projetos, existing_clients, lead_contacts]

# Dependency graph
requires:
  - phase: 22-01
    provides: "canCsm() in dal.ts; /api/csm/* middleware exemption"
provides:
  - "POST /api/csm/clients — create vendedor_projetos row with vendedor_id = session.userId"
  - "ON CONFLICT idempotency — existing CNPJ returns 200 + already_existed:true instead of erroring"
  - "existing_clients mirror — every CSM-added client is flagged is_existing_client=true in CRM views"
  - "GET /api/csm/clients/[cnpj]/contacts — list contacts for any CNPJ (no ownership check)"
  - "PATCH /api/csm/clients/[cnpj]/contacts — update telefone/email only (strict allowedFields)"
affects:
  - "22-03 (comissoes proxy uses same getApiSession + canCsm pattern)"
  - "Phase 23 (CSM client list will read from vendedor_projetos rows added via this endpoint)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canCsm() gate pattern: getApiSession() + !canCsm(session.role) before any mutation"
    - "CNPJ normalisation: .replace(/\\D/g, '') before all DB queries"
    - "Strict allowedFields=['telefone','email'] whitelist in dynamic UPDATE builder"
    - "ON CONFLICT (cnpj) DO NOTHING — idempotent inserts on both vendedor_projetos and existing_clients"

key-files:
  created:
    - "web/src/app/api/csm/clients/route.ts"
    - "web/src/app/api/csm/clients/[cnpj]/contacts/route.ts"
  modified: []

key-decisions:
  - "status_contato = 'Não Contatado' (accented) — plan template had 'Nao Contatado' (no accent) but production SQL in repo-sync.ts and api/leads/route.ts consistently uses the accented form; corrected to prevent silent bucket mismatch in pipeline queries"
  - "updated_at omitted from PATCH — lead_contacts table has no updated_at column (existing /api/leads/[cnpj]/contacts PATCH does not set it either)"
  - "verifyLeadAccess() and canModifyData() intentionally excluded — CSM-03 requires cross-ownership access; these helpers would deny it"
  - "Separate allowedFields=['telefone','email'] array vs. leads route's broader list — scope boundary is load-bearing for CSM trust model"

patterns-established:
  - "Pattern: CSM API routes use getApiSession() + canCsm() — no canModifyData(), no verifyLeadAccess()"
  - "Pattern: POST /api/csm/clients mirrors into existing_clients immediately after vendedor_projetos insert"

requirements-completed:
  - CSM-02
  - CSM-03

# Metrics
duration: 15min
completed: 2026-04-27
---

# Phase 22 Plan 02: CSM Clients API Summary

**POST /api/csm/clients (CSM-02) and GET+PATCH /api/csm/clients/[cnpj]/contacts (CSM-03) — canCsm()-gated routes under /api/csm/* namespace**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-27
- **Tasks:** 2 auto
- **Files created:** 2

## Accomplishments

- `POST /api/csm/clients` creates a `vendedor_projetos` row with `vendedor_id = session.userId` and mirrors into `existing_clients`; idempotent via `ON CONFLICT (cnpj) DO NOTHING`
- `GET /api/csm/clients/[cnpj]/contacts` lists all contacts for any CNPJ (CSM has cross-ownership read access)
- `PATCH /api/csm/clients/[cnpj]/contacts` updates only `telefone` and `email` — strict `allowedFields` enforced; rejects all other fields with 400
- Both routes: 401 for anonymous, 403 for non-csm roles

## Task Commits

1. **Task 1: POST /api/csm/clients** — `2d2e060`
2. **Task 2: GET + PATCH /api/csm/clients/[cnpj]/contacts** — `9faaefe`

## Files Created

- `web/src/app/api/csm/clients/route.ts` — POST handler (78 lines)
- `web/src/app/api/csm/clients/[cnpj]/contacts/route.ts` — GET + PATCH handlers (93 lines)

## Decisions Made

- `status_contato = 'Não Contatado'` used with accent — the plan template had 'Nao Contatado' (no accent), but production SQL (repo-sync.ts, api/leads/route.ts) consistently uses the accented form. Using the unaccented form would create rows that fall into the wrong bucket in existing pipeline queries.
- `updated_at` omitted from the PATCH UPDATE — `lead_contacts` table has no `updated_at` column; the existing `/api/leads/[cnpj]/contacts` PATCH does not set it either.
- `verifyLeadAccess()` and `canModifyData()` explicitly not called — CSM-03 intentionally provides cross-ownership contact editing; these helpers would block it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] status_contato literal corrected from 'Nao Contatado' to 'Não Contatado'**

- **Found during:** Task 1 implementation
- **Issue:** Plan template used `'Nao Contatado'` (no accent) but production SQL everywhere uses `'Não Contatado'` (with accent). An unaccented INSERT would create rows that filter queries treating `!= 'Não Contatado'` as "already contacted" would silently misclassify.
- **Fix:** Used `'Não Contatado'` in the INSERT statement
- **Files modified:** `web/src/app/api/csm/clients/route.ts`
- **Commit:** `2d2e060`

## Manual Verification (Deferred — requires running dev server)

The following curl checks require a running Next.js dev server and session cookies; not executed automatically:

- POST with CSM cookie → expect 201 with row
- POST idempotency → expect 200 with `already_existed:true`
- Anonymous POST → expect 401
- Vendedor POST → expect 403
- PATCH with valid contact id → expect 200 `{"success":true}`
- PATCH with `status_contato` field → expect 400 (no updatable fields)
- DB verification: `SELECT cnpj FROM existing_clients WHERE cnpj = '99888777000166'`

## Next Phase Readiness

- Plan 22-03 can execute immediately (uses same `canCsm()` + `/api/csm/*` namespace)
- `tsc --noEmit` passes cleanly

---
*Phase: 22-csm-rbac-foundation*
*Completed: 2026-04-27*
