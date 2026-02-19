---
phase: quick-26
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/lead/[cnpj]/page.tsx
  - web/src/app/api/leads/[cnpj]/route.ts
autonomous: true
requirements: [QUICK-26]

must_haves:
  truths:
    - "Setting 'Aguardando Closer' from the lead detail page does NOT open SaleModal — status change goes directly to API"
    - "After setting Aguardando Closer, closer_id = Paulo's UUID in the DB (confirmed by /api/debug-closer)"
    - "The lead appears in Paulo's /leads list after the change (gestor_vendedor closer_id filter)"
    - "A vendedor can set Aguardando Closer on their own leads without being blocked"
  artifacts:
    - path: "web/src/app/lead/[cnpj]/page.tsx"
      provides: "updateProjeto no longer intercepts Aguardando Closer for SaleModal"
    - path: "web/src/app/api/leads/[cnpj]/route.ts"
      provides: "Aguardando Closer sets closer_id for both vendedor and gestor_vendedor roles"
  key_links:
    - from: "lead/[cnpj]/page.tsx updateProjeto"
      to: "PATCH /api/leads/[cnpj]"
      via: "direct fetch without SaleModal intercept for Aguardando Closer"
      pattern: "status_contato.*Aguardando Closer"
    - from: "PATCH /api/leads/[cnpj]"
      to: "vendedor_projetos.closer_id"
      via: "Paulo lookup + UPDATE closer_id after status saved"
      pattern: "pauloCloserId"
---

<objective>
Fix the remaining bug where setting "Aguardando Closer" does NOT propagate to Paulo Gabriel's lead list.

Purpose: Quick-24 fixed the gestor_vendedor permission but the bug persists because: (1) the lead detail page `/lead/[cnpj]` intercepts "Aguardando Closer" and opens SaleModal, which requires a valor_venda input — if the user doesn't complete the modal, the PATCH is never sent and closer_id is never set; (2) this explains why "mudei pelo meu usuario" didn't work — the user likely changed status from the detail page and the modal blocked it.

Output: Aguardando Closer is a direct status change (no SaleModal), closer_id gets set to Paulo's UUID, Paulo sees the lead immediately.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/lead/[cnpj]/page.tsx
@web/src/app/api/leads/[cnpj]/route.ts
@web/src/app/api/debug-closer/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove SaleModal intercept for Aguardando Closer in lead detail page</name>
  <files>web/src/app/lead/[cnpj]/page.tsx</files>
  <action>
In `updateProjeto`, the condition at line 71 currently reads:

```typescript
if (field === 'status_contato' && (value === 'Fechado' || value === 'Aguardando Closer')) {
  // opens SaleModal
  return
}
```

This incorrectly blocks "Aguardando Closer" from reaching the API. The SaleModal requires valor_venda, but "Aguardando Closer" means the lead is being handed to Paulo for closing — no sale value is known yet.

Fix: Remove 'Aguardando Closer' from the SaleModal intercept. Only 'Fechado' should open SaleModal:

```typescript
if (field === 'status_contato' && value === 'Fechado') {
  const projeto = projetos.find(p => p.id === id)
  setSaleModal({
    projetoId: id,
    tipoVendedor: projeto?.tipo_vendedor || null,
    isExclusivo: projeto?.tipo_vendedor === 'Exclusivo',
  })
  return
}
```

After this change, selecting "Aguardando Closer" from the status dropdown in the emendas table (or anywhere in updateProjeto) will go directly to the `fetch PATCH` call at line 81-87.

Also verify: the "Aguardando Closer" banner at the bottom of the page (around line 232) has two action buttons: "Fechar Venda" (which opens SaleModal) and "Cancelar" (which sets status to 'Proposta'). These are already correct — no change needed there.

No other changes to this file.
  </action>
  <verify>
1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero TypeScript errors
2. After deploy: navigate to any lead detail page, change status dropdown to "Aguardando Closer" — SaleModal should NOT open; the status badge should update immediately to purple "Aguardando Closer"
  </verify>
  <done>
- Selecting "Aguardando Closer" from lead detail page sends PATCH directly (no modal)
- Selecting "Fechado" from lead detail page still opens SaleModal (unchanged behavior)
- TypeScript compilation clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Ensure vendedor role can set Aguardando Closer on own leads + add paramIndex safety log</name>
  <files>web/src/app/api/leads/[cnpj]/route.ts</files>
  <action>
The current vendedorCondition logic for `vendedor` role is:
```typescript
if (session.role === 'vendedor') {
  values.push(session.userId)
  vendedorCondition = `AND vendedor_id = $${paramIndex + 1}`
}
```

This is correct: a vendedor can only set Aguardando Closer on their OWN leads (leads where they are the assigned vendedor). This behavior is intentional — keep it.

However, there's a subtle issue: `$${paramIndex + 1}` — this uses `paramIndex + 1` (not `paramIndex`). At this point in the code, `paramIndex` was being incremented for each field in `updates`. After pushing `updated_at = NOW()` and the projectId, the next free param slot should be `paramIndex + 1`? Let's verify this is correct:

When `body = { id: 123, status_contato: 'Aguardando Closer' }`:
- After line 30: paramIndex = 2 (consumed $1 for status_contato)
- After line 81: values has [status_value, projectId] (2 values)
- Line 89: `vendedorCondition = AND vendedor_id = $${paramIndex + 1}` = `$3`
- `values.push(session.userId)` → values = [status_value, projectId, userId]
- WHERE clause: `WHERE id = $${paramIndex}` = `WHERE id = $2` AND `vendedor_id = $3`

This is CORRECT. The existing logic is fine.

**What to change**: Add a diagnostic console.log when the Aguardando Closer block runs, so Vercel logs confirm whether closer_id is being set. This will help diagnose if the issue was only the SaleModal or if there's also a DB issue:

```typescript
// Aguardando Closer block (existing code around line 106):
if (body.status_contato === 'Aguardando Closer') {
  console.log(`[PATCH] Aguardando Closer triggered for project ${projectId} by user ${session.userId} (${session.role})`)
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
    console.log(`[PATCH] closer_id set to ${pauloCloserId} for project ${projectId}`)
  } else {
    console.error('[PATCH] Paulo Gabriel (paulo@projetus.org) NOT FOUND in users table — closer_id not set')
  }
}
```

Only add the two `console.log` lines (start of block + success confirmation). The rest of the block already exists from quick-24.

No other logic changes needed in this file.
  </action>
  <verify>
1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero TypeScript errors
2. After deploy: set any lead to Aguardando Closer → check Vercel function logs → should see `[PATCH] Aguardando Closer triggered` and `[PATCH] closer_id set to {uuid}`
3. Hit `GET /api/debug-closer` as gestor — should show `aguardando_closer_sample` with non-null closer_id values
  </verify>
  <done>
- Vercel logs show the Aguardando Closer block executing and Paulo's UUID being set
- /api/debug-closer confirms leads with status 'Aguardando Closer' have closer_id = Paulo's UUID
- TypeScript compilation clean
  </done>
</task>

<task type="auto">
  <name>Task 3: End-to-end verification using debug endpoint</name>
  <files>web/src/app/api/debug-closer/route.ts</files>
  <action>
Enhance the debug endpoint to also show whether the status change was correctly persisted. Add a new field that shows the last 5 leads ordered by updated_at where closer_id IS NOT NULL (to confirm the most recent changes):

Current debug endpoint returns: `paulo_user`, `leads_with_closer_id_count`, `aguardando_closer_sample`

Add one more field: `recent_closer_assignments` — last 5 rows ordered by updated_at DESC where closer_id IS NOT NULL:

```typescript
const recentRows = await query(
  `SELECT id, cnpj, nome, status_contato, closer_id, updated_at
   FROM vendedor_projetos
   WHERE closer_id IS NOT NULL
   ORDER BY updated_at DESC
   LIMIT 5`
)
```

Return it as `recent_closer_assignments: recentRows` in the response.

This allows instant verification post-deploy: change a lead to Aguardando Closer, hit /api/debug-closer, see the lead appear in recent_closer_assignments within seconds.
  </action>
  <verify>
1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero errors
2. Hit GET /api/debug-closer as gestor — response now includes `recent_closer_assignments` array
3. After setting any lead to Aguardando Closer — re-hit endpoint — that lead appears in recent_closer_assignments with non-null closer_id
  </verify>
  <done>
- /api/debug-closer returns 4 fields including recent_closer_assignments
- The endpoint confirms end-to-end: Paulo exists, leads have closer_id set, recent assignments visible
  </done>
</task>

</tasks>

<verification>
1. TypeScript: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero errors across all 3 modified files
2. Manual flow A (lead detail page): Navigate to /lead/{cnpj}, change any emenda status to "Aguardando Closer" → status updates without SaleModal opening → purple status badge appears
3. Manual flow B (leads list): Navigate to /leads, change a lead's status dropdown to "Aguardando Closer" → updates immediately
4. Database check: Hit GET /api/debug-closer → `recent_closer_assignments` shows the changed lead with `closer_id` = Paulo's UUID and `status_contato = 'Aguardando Closer'`
5. Paulo's view: Log in as paulo@projetus.org → /leads → the lead appears in his list
</verification>

<success_criteria>
- Setting "Aguardando Closer" from the lead detail page (/lead/[cnpj]) works without requiring valor_venda (no SaleModal)
- Setting "Aguardando Closer" from the leads list (/leads) continues to work (unchanged)
- closer_id = Paulo's UUID is set in DB after either path
- Paulo's /leads view shows the lead (gestor_vendedor closer_id filter already correct from quick-24)
- Vercel logs confirm the closer assignment via [PATCH] log lines
</success_criteria>

<output>
After completion, create `.planning/quick/26-quando-o-vendedor-coloca-aguardando-clos/26-SUMMARY.md`
</output>
