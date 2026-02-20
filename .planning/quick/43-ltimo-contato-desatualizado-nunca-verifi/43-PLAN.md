---
phase: quick-43
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/leads/route.ts
  - web/src/app/api/dashboard-crm/route.ts
autonomous: true
requirements: [QUICK-43]

must_haves:
  truths:
    - "Leads with status != 'Não Contatado' show a real days-since-last-contact value, not Nunca"
    - "Leads with no contact notes but with a status change show days since that status change"
    - "Leads that are truly never contacted (status = 'Não Contatado', no notes) still show Nunca"
    - "The fix applies in both /leads page and the CRM dashboard (pipeline cards)"
  artifacts:
    - path: "web/src/app/api/leads/route.ts"
      provides: "days_since_last_contact subquery updated to use GREATEST of notes and status change"
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "same fix applied to the CRM pipeline endpoint"
  key_links:
    - from: "web/src/app/api/leads/route.ts"
      to: "vendedor_projetos.updated_at"
      via: "GREATEST subquery fallback"
      pattern: "GREATEST.*contact_notes.*updated_at"
    - from: "web/src/app/api/dashboard-crm/route.ts"
      to: "vendedor_projetos.updated_at"
      via: "GREATEST subquery fallback"
      pattern: "GREATEST.*contact_notes.*updated_at"
---

<objective>
Fix "último contato" showing "Nunca" for leads that have been contacted via status change but have no manual contact note written.

Purpose: Vendedores change lead status (e.g., Não Contatado → Contactado) which updates vendedor_projetos.updated_at, but the days_since_last_contact subquery only reads contact_notes. Leads with status != 'Não Contatado' are showing "Nunca" which is misleading and hides real CRM activity.

Output: days_since_last_contact reflects the most recent of: (1) latest contact note for that CNPJ, or (2) latest updated_at on any row for that CNPJ where status_contato != 'Não Contatado'.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix days_since_last_contact in /api/leads and /api/dashboard-crm</name>
  <files>
    web/src/app/api/leads/route.ts
    web/src/app/api/dashboard-crm/route.ts
  </files>
  <action>
In both files, replace the `days_since_last_contact` subquery that only reads `contact_notes` with one that uses GREATEST across two sources:

1. Latest `contact_notes.created_at` for that CNPJ (existing logic)
2. Latest `vendedor_projetos.updated_at` for that CNPJ where `status_contato != 'Não Contatado'` (new fallback)

The updated subquery pattern for both files:

```sql
(
  SELECT EXTRACT(DAY FROM NOW() - GREATEST(
    (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
    (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
     WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
  ))::int
) as days_since_last_contact
```

GREATEST with two NULLable values: if both are NULL (truly never contacted), GREATEST returns NULL and the UI shows "Nunca" — correct behavior preserved. If only the status-change branch is non-NULL (note never written, but status was changed), GREATEST returns updated_at and shows real days — this is the fix.

In `dashboard-crm/route.ts` also update the `last_contact_date` subquery (line ~143) in the same way:
```sql
(
  SELECT GREATEST(
    (SELECT MAX(cn.created_at) FROM contact_notes cn WHERE cn.lead_cnpj = vp.cnpj),
    (SELECT MAX(vp2.updated_at) FROM vendedor_projetos vp2
     WHERE vp2.cnpj = vp.cnpj AND vp2.status_contato != 'Não Contatado')
  )
) as last_contact_date
```

Do NOT change any other logic, conditions, or output fields. Only replace the two subqueries in each file.
  </action>
  <verify>
1. Check TypeScript compiles: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20`
2. Grep confirms the GREATEST pattern is present in both files:
   `grep -n "GREATEST" web/src/app/api/leads/route.ts web/src/app/api/dashboard-crm/route.ts`
3. Grep confirms old single-source pattern is gone:
   `grep -n "FROM contact_notes cn" web/src/app/api/leads/route.ts` — should show 0 bare occurrences inside the days_since subquery (only inside GREATEST now)
  </verify>
  <done>
Both API files use GREATEST(contact_notes MAX, vp.updated_at MAX where status != default) for days_since_last_contact. TypeScript compiles without errors. Leads with non-default status but no written notes will now show real days count instead of "Nunca".
  </done>
</task>

</tasks>

<verification>
After the fix:
- A lead with status "Contactado" and no contact notes should show the number of days since its status was last changed, not "Nunca"
- A lead with status "Não Contatado" and no notes should still show "Nunca"
- A lead with contact notes should show days since the most recent note (unchanged behavior if note is more recent than status change)
</verification>

<success_criteria>
days_since_last_contact is non-null for any lead whose status_contato != 'Não Contatado', reflecting real CRM activity. TypeScript builds cleanly. No regressions in leads list or CRM dashboard pipeline cards.
</success_criteria>

<output>
After completion, create `.planning/quick/43-ltimo-contato-desatualizado-nunca-verifi/43-SUMMARY.md`
</output>
