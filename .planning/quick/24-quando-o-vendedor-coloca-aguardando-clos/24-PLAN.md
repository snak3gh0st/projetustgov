---
phase: quick-24
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/[cnpj]/route.ts
autonomous: true
requirements: [QUICK-24]

must_haves:
  truths:
    - "When any user sets a lead status to 'Aguardando Closer', closer_id is set to Paulo's user id"
    - "The lead appears in Paulo's /leads view after status change"
    - "The status_contato = 'Aguardando Closer' is saved regardless of who makes the change"
  artifacts:
    - path: "web/src/app/api/leads/[cnpj]/route.ts"
      provides: "Fixed PATCH handler with correct closer assignment and permission logic"
  key_links:
    - from: "PATCH /api/leads/[cnpj]"
      to: "vendedor_projetos.closer_id"
      via: "Aguardando Closer block sets closer_id = Paulo's id"
      pattern: "closer_id.*pauloCloserId"
    - from: "GET /api/leads"
      to: "vendedor_projetos"
      via: "gestor_vendedor filter includes closer_id"
      pattern: "closer_id.*session.userId"
---

<objective>
Fix the bug where setting a lead status to "Aguardando Closer" does not cause the lead to appear in Paulo Gabriel's (gestor_vendedor) lead list.

Purpose: The SDR-to-Closer flow is broken. When a vendedor marks a lead as "Aguardando Closer", it should automatically assign Paulo Gabriel as the closer (closer_id) so Paulo can see and close the deal. Currently the closer_id is either not being set or the permission check is blocking the status update.

Output: Fixed PATCH handler that (1) correctly sets closer_id even when the user is gestor_vendedor editing someone else's lead, and (2) adds a fallback to find Paulo without the `active = true` filter to diagnose account state issues.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/leads/[cnpj]/route.ts
@web/src/app/api/leads/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Aguardando Closer closer_id assignment in PATCH route</name>
  <files>web/src/app/api/leads/[cnpj]/route.ts</files>
  <action>
Two bugs to fix in the PATCH handler:

**Bug 1: gestor_vendedor can't update status on leads they don't own**

Currently at lines 86-91, `gestor_vendedor` role applies the condition `AND (vendedor_id = $X OR closer_id = $X)` to the main UPDATE. When Paulo (gestor_vendedor) tries to change a lead belonging to Gabriel (vendedor_id = Gabriel's id, closer_id = NULL), the WHERE clause matches 0 rows and status_contato is NOT updated.

Fix: For `gestor_vendedor`, when the body contains `status_contato === 'Aguardando Closer'`, skip the vendedorCondition restriction for the main UPDATE (a gestor_vendedor should be able to move any lead to the closer flow). Apply it only for non-Aguardando-Closer status changes.

Implementation: Before the `vendedorCondition` assignment, check if `body.status_contato === 'Aguardando Closer'`. If so, set `vendedorCondition = ''` for both `vendedor` and `gestor_vendedor` roles (the Aguardando Closer action is a privileged status — anyone with sell access can hand a lead to the closer).

Actually, re-think: a regular `vendedor` should only be able to set Aguardando Closer on their OWN leads. So keep the `vendedor` restriction. Only relax the restriction for `gestor_vendedor`.

```typescript
let vendedorCondition = ''
if (session.role === 'vendedor') {
  values.push(session.userId)
  vendedorCondition = `AND vendedor_id = $${paramIndex + 1}`
} else if (session.role === 'gestor_vendedor') {
  // gestor_vendedor can set Aguardando Closer on any lead
  // but for other status changes, restrict to their own leads
  if (body.status_contato !== 'Aguardando Closer') {
    values.push(session.userId)
    vendedorCondition = `AND (vendedor_id = $${paramIndex + 1} OR closer_id = $${paramIndex + 1})`
  }
}
```

**Bug 2: Paulo's user may be inactive or missing — silent failure**

The query at line 104 is: `SELECT id FROM users WHERE email = 'paulo@projetus.org' AND active = true`

If Paulo's `active` column is false (or NULL), `pauloCloserId` is null, the `if (pauloCloserId)` block is skipped, and closer_id is never set. This fails silently with no error.

Fix: Add a console.error log when Paulo is not found, and also try without `active = true` filter as a fallback to detect the issue. If Paulo is found but inactive, still set closer_id (the closer should always be Paulo regardless of active state) and log a warning.

```typescript
// Aguardando Closer block:
const pauloRes = await query(
  "SELECT id, active FROM users WHERE email = 'paulo@projetus.org' LIMIT 1"
)
const pauloCloserId = pauloRes[0]?.id ?? null
if (pauloCloserId) {
  if (!pauloRes[0]?.active) {
    console.warn('[PATCH] Paulo Gabriel account is inactive — still assigning as closer')
  }
  await query(`
    UPDATE vendedor_projetos
    SET closer_id = $2, updated_at = NOW()
    WHERE id = $1
  `, [projectId, pauloCloserId])
} else {
  console.error('[PATCH] Paulo Gabriel (paulo@projetus.org) NOT FOUND in users table — closer_id not set')
}
```

Remove `AND active = true` from the Paulo lookup query in this block.
  </action>
  <verify>
1. Run `npx tsc --noEmit` in web/ — no TypeScript errors
2. Check logs after changing a lead to "Aguardando Closer" — no `[PATCH] Paulo Gabriel NOT FOUND` error in console
3. Check DB (via /api/setup-crm debug or direct query): `SELECT id, closer_id, status_contato FROM vendedor_projetos WHERE status_contato = 'Aguardando Closer' LIMIT 5` — closer_id should be Paulo's UUID, not NULL
  </verify>
  <done>
After setting any lead to "Aguardando Closer":
- DB row has closer_id = Paulo Gabriel's user UUID
- DB row has status_contato = 'Aguardando Closer'
- No silent failure when Paulo's active flag varies
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify Paulo's view includes Aguardando Closer leads via manual test</name>
  <files>web/src/app/api/leads/route.ts</files>
  <action>
Verify (no code changes needed unless a bug is found) that the /api/leads GET route correctly returns leads where `closer_id = Paulo's id` when Paulo is logged in as `gestor_vendedor`.

Review the GET handler (lines 32-35):
```typescript
} else if (session.role === 'gestor_vendedor') {
  conditions.push(`(vp.vendedor_id = $${paramIndex} OR vp.closer_id = $${paramIndex})`)
  params.push(session.userId)
  paramIndex++
```

This already includes `closer_id`. No fix needed here IF the closer_id was set correctly in Task 1.

If a bug IS found: for example, if the condition uses `$${paramIndex}` after paramIndex was already incremented, fix the paramIndex alignment.

Also add a `/api/debug-closer` endpoint (GET, temporary) that returns:
- Paulo's user record: `SELECT id, email, nome, role, active FROM users WHERE email = 'paulo@projetus.org'`
- Count of leads with closer_id set: `SELECT COUNT(*) FROM vendedor_projetos WHERE closer_id IS NOT NULL`
- Sample: `SELECT id, cnpj, nome, status_contato, closer_id FROM vendedor_projetos WHERE status_contato = 'Aguardando Closer' LIMIT 10`

Create this at `web/src/app/api/debug-closer/route.ts` — gestor-only access. This lets us verify the state after the fix is deployed.
  </action>
  <verify>
After deploying:
1. Hit `GET /api/debug-closer` as gestor — should show Paulo's record with active=true and his UUID
2. After changing a lead to Aguardando Closer, re-hit the endpoint — sample should show closer_id matching Paulo's UUID
3. Log in as Paulo (paulo@projetus.org) → navigate to /leads → lead should appear with status "Aguardando Closer"
  </verify>
  <done>
- /api/debug-closer returns Paulo's user data with valid UUID and active=true
- Lead changed to Aguardando Closer has closer_id = Paulo's UUID in debug output
- Paulo can see the lead in his /leads view
  </done>
</task>

</tasks>

<verification>
1. TypeScript: `cd web && npx tsc --noEmit` — zero errors
2. Manual flow: Change any lead to "Aguardando Closer" as gestor user → check /api/debug-closer → closer_id should be Paulo's UUID
3. Paulo's view: Login as paulo@projetus.org → /leads → lead appears
4. Revert test: Change status away from Aguardando Closer → closer_id should be cleared (existing logic in the else branch at line 204)
</verification>

<success_criteria>
- closer_id is set to Paulo's UUID whenever status_contato = 'Aguardando Closer' is saved
- The lead appears in Paulo's /leads list (gestor_vendedor role, closer_id filter)
- gestor_vendedor can set Aguardando Closer on any lead (not just their own)
- No silent failures — console logs clearly if Paulo's user is missing
</success_criteria>

<output>
After completion, create `.planning/quick/24-quando-o-vendedor-coloca-aguardando-clos/24-SUMMARY.md`
</output>
