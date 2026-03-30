# Phase 18: Lead Distribution - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatic equalization of execution pipeline leads among active vendedores, with client-tag routing to coordenador. Includes advisory lock for concurrency safety and a manual trigger for gestores. The distribution algorithm (`distribute-execucao.ts`) already exists and runs in the sync-execucao cron — this phase adds client routing, locking, and UI trigger.

</domain>

<decisions>
## Implementation Decisions

### Client tag detection
- **D-01:** A CNPJ is "cliente" if it has `is_existing_client = true` in `vendedor_projetos` (approval pipeline). This flag is the authoritative source.
- **D-02:** During execution distribution, before round-robin, check each unassigned CNPJ against vendedor_projetos for `is_existing_client = true`. If found, route to the coordenador user instead of entering the equalization queue.
- **D-03:** The detection is automatic — no manual tagging. The `is_existing_client` flag from the approval pipeline drives routing in execution.

### Coordenador target
- **D-04:** Client-tagged leads go to the user with `role = 'coordenador'`. If multiple coordenadores exist, use the first active one (by `nome` ASC) — this is a safe default since the system currently has one coordenador (Paulo).

### Locking and concurrency
- **D-05:** Claude's discretion on implementation approach (pg_advisory_lock vs pg_try_advisory_lock). The goal is: concurrent cron + manual trigger cannot double-assign leads.

### UI trigger
- **D-06:** Claude's discretion on where to place the "Distribuir Automaticamente" button and what feedback to show. The existing `/distribuir` page handles approval-pipeline manual assignment and is the natural home for an execution tab.

### Claude's Discretion
- Locking strategy (wait vs skip-if-locked)
- Manual trigger UI placement and feedback design
- Whether to add an execution tab to `/distribuir` or add the button elsewhere
- Result display format (toast, modal, inline)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Distribution logic
- `web/src/lib/distribute-execucao.ts` — Current round-robin algorithm, assigns to vendedor with fewest leads. Needs modification to add client-tag routing and locking.
- `web/src/app/api/execucao/distribute/route.ts` — POST endpoint (gestor-only) that calls the distribution function.
- `web/src/app/api/cron/sync-execucao/route.ts` — Cron job that calls `distributeUnassignedExecucao()` after sync.

### Client detection
- `web/src/lib/types.ts:49` — `is_existing_client` field definition on VendedorProjeto type.
- `web/src/app/leads/page.tsx:176` — How `tag_cliente_existente` is derived from `is_existing_client`.

### Auth and roles
- `web/src/lib/dal.ts:35` — `isSeller()` returns true for coordenador role.
- `web/src/lib/auth.ts:63` — Role types include coordenador.

### Existing UI
- `web/src/app/distribuir/page.tsx` — Manual lead assignment page (approval pipeline only). Natural candidate for execution distribution tab.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `distribute-execucao.ts`: Complete round-robin equalization — just needs client-routing pre-step and advisory lock wrapper
- `/api/execucao/distribute` POST route: Already wired with gestor auth check
- `is_existing_client` field: Already computed and stored in vendedor_projetos
- `/distribuir` page: Full manual assignment UI — can be extended with execution tab

### Established Patterns
- Distribution runs as post-sync step in cron (`sync-execucao/route.ts` line 32)
- Auth check pattern: `session.role !== 'gestor'` for admin-only routes
- CNPJ normalization: `REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')` used throughout
- Toast notifications used for action feedback across the app

### Integration Points
- `distributeUnassignedExecucao()` is called from both cron and manual API — changes are shared
- `vendedor_projetos` table is the junction between CNPJs and vendedores for both pipelines
- `projetos_execucao` table is the source of execution CNPJs

</code_context>

<specifics>
## Specific Ideas

- "CNPJs que forem clientes no execucao, mandar para o coordenador Paulo monitorar, ja que sao clientes nao tem que ligar para vender nada"
- Client detection is automatic from approval pipeline's `is_existing_client` flag — no manual tagging
- Only execution pipeline distribution is affected — approval pipeline stays manual

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-lead-distribution*
*Context gathered: 2026-03-30*
