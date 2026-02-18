---
phase: quick-21
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
autonomous: true
requirements: [QUICK-21]

must_haves:
  truths:
    - "Multi-emenda main row shows the highest individual emenda value, not the sum"
    - "Sort by valor uses the highest individual emenda value, not the sum"
    - "Sub-rows continue to show their own individual valor_emenda unchanged"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Corrected valor display and sort logic"
  key_links:
    - from: "web/src/app/leads/page.tsx (line ~396)"
      to: "lead.valor_emenda"
      via: "Remove subLeads.reduce sum branch"
      pattern: "Number\\(lead\\.valor_emenda\\)"
    - from: "web/src/app/leads/page.tsx (line ~133)"
      to: "a.valor_emenda / b.valor_emenda"
      via: "Replace subLeads.reduce in sort case 'valor'"
      pattern: "Number\\(a\\.valor_emenda\\)"
---

<objective>
Remove the summed valor display for multi-emenda main rows in the leads table. The main row should always show `lead.valor_emenda` (the highest individual emenda value, since leads are ordered by valor_emenda DESC) instead of the sum of all sub-lead emenda values.

Purpose: The sum is misleading — it inflates the displayed value and does not correspond to any real single contract value. The highest individual emenda is more useful as a representative value.
Output: Two targeted edits to `web/src/app/leads/page.tsx`.
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
  <name>Task 1: Remove subLeads.reduce from valor display and sort logic</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
    Two edits in `web/src/app/leads/page.tsx`:

    **Edit 1 — Main row valor display (around line 395-399):**

    Replace the ternary that sums subLeads for multi-emenda rows:
    ```tsx
    // BEFORE
    {formatCompactCurrency(
      hasMultipleEmendas
        ? lead.subLeads.reduce((sum: number, sub: VendedorProjeto) => sum + (Number(sub.valor_emenda) || 0), 0)
        : Number(lead.valor_emenda) || 0
    )}

    // AFTER
    {formatCompactCurrency(Number(lead.valor_emenda) || 0)}
    ```

    Remove the entire `hasMultipleEmendas ? ... :` branch. Always use `Number(lead.valor_emenda) || 0` directly.

    **Edit 2 — Sort by valor (around line 133):**

    Replace the sort case for 'valor' that also sums subLeads:
    ```tsx
    // BEFORE
    case 'valor': va = a.subLeads ? a.subLeads.reduce((s: number, sub: VendedorProjeto) => s + (Number(sub.valor_emenda) ?? 0), 0) : Number(a.valor_emenda) || 0; vb = b.subLeads ? b.subLeads.reduce((s: number, sub: VendedorProjeto) => s + (Number(sub.valor_emenda) ?? 0), 0) : Number(b.valor_emenda) || 0; break

    // AFTER
    case 'valor': va = Number(a.valor_emenda) || 0; vb = Number(b.valor_emenda) || 0; break
    ```

    Remove all subLeads.reduce logic. Always use the lead's own valor_emenda directly.

    Do NOT touch the sub-row valor display (around lines 483-501) — those already show individual emenda values correctly.
  </action>
  <verify>
    Run TypeScript check: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20`
    Visually confirm: `grep -n "subLeads.reduce" web/src/app/leads/page.tsx` returns no matches in the valor display or sort sections.
  </verify>
  <done>
    No subLeads.reduce calls remain for valor display or sort. TypeScript compiles without new errors. The main row for multi-emenda CNPJs shows the highest single emenda value (lead.valor_emenda) followed by the emenda count badge.
  </done>
</task>

</tasks>

<verification>
1. `grep -n "subLeads.reduce" web/src/app/leads/page.tsx` — should return zero matches (or only matches in non-valor contexts if any exist)
2. TypeScript compilation passes: `npx tsc --noEmit`
3. In the UI, a multi-emenda CNPJ main row valor should now match the valor shown in its first sub-row (the highest emenda), not exceed it
</verification>

<success_criteria>
Multi-emenda main rows display the highest individual emenda value. Sort by valor column uses the same highest individual value. No TypeScript errors introduced.
</success_criteria>

<output>
After completion, create `.planning/quick/21-remove-summed-valor-from-multi-emenda-ma/21-SUMMARY.md`
</output>
