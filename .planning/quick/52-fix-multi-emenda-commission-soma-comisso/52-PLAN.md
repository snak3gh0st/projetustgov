---
phase: quick-52
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
autonomous: true
requirements:
  - QUICK-52-BUG1
  - QUICK-52-BUG2
must_haves:
  truths:
    - "Main row shows sum of all Fechado emendas' commissions, not just first emenda's commission"
    - "Main row is only marked Fechado when ALL emendas have status_contato = 'Fechado'"
    - "Sub-rows for Fechado emendas display their individual commission value"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "Fixed displayLeads useMemo with totalComissao + allFechado, corrected render logic"
  key_links:
    - from: "displayLeads useMemo (line ~118)"
      to: "main row value cell (line ~412)"
      via: "allFechado and totalComissao computed fields"
      pattern: "allFechado.*totalComissao"
---

<objective>
Fix two commission display bugs in the multi-emenda lead grouping logic in the leads table.

Purpose: When a CNPJ has multiple emendas, commissions should sum across all Fechado emendas, and the Fechado state should only trigger when every emenda is closed.
Output: Corrected leads page with accurate commission totals and accurate Fechado status for grouped rows.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/leads/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix displayLeads useMemo and render logic</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
Three targeted edits to `web/src/app/leads/page.tsx`:

**Edit 1 — displayLeads useMemo (lines 118-127):**

Add `totalComissao` and `allFechado` to the returned object. Replace the current `return { ...first, totalValor, emenda_count, subLeads }` block with:

```typescript
const totalComissao = cnpjLeads.reduce((sum, l) => {
  if (l.status_contato === 'Fechado') {
    return sum + (Number(l.comissao_valor) || 0) + (Number(l.comissao_bonus) || 0)
  }
  return sum
}, 0)
const allFechado = cnpjLeads.every(l => l.status_contato === 'Fechado')
return {
  ...first,
  totalValor,
  totalComissao,
  allFechado,
  emenda_count: cnpjLeads.length,
  subLeads: cnpjLeads,
}
```

**Edit 2 — main row isFechado (line 372):**

Replace:
```typescript
const isFechado = lead.status_contato === 'Fechado'
```
With:
```typescript
const isFechado = (lead as any).allFechado ?? lead.status_contato === 'Fechado'
```

**Edit 3 — main row value cell condition (lines 412-415):**

Replace `lead.comissao_valor` references in the Fechado branch with `totalComissao`. Specifically:
- Condition: `isFechado && lead.comissao_valor` → `isFechado && (lead as any).totalComissao`
- Display value: `formatCompactCurrency(lead.comissao_valor)` → `formatCompactCurrency((lead as any).totalComissao)`

The `comissao_locked` indicator and label below can remain based on `lead.comissao_locked` (first emenda's lock status is acceptable for now).

**Edit 4 — sub-row value cell (lines 548-551):**

Replace the sub-row td that always shows `valor_emenda` with logic that shows commission when the sub is Fechado, otherwise shows valor_emenda:

```typescript
<td className="px-4 py-2 whitespace-nowrap">
  {sub.status_contato === 'Fechado' && (Number(sub.comissao_valor) || 0) > 0 ? (
    <span className="text-green-600 font-medium text-xs">
      {formatCompactCurrency((Number(sub.comissao_valor) || 0) + (Number(sub.comissao_bonus) || 0))}
    </span>
  ) : (
    <span className="text-sigma-neon/70 font-medium text-xs">
      {formatCompactCurrency(Number(sub.valor_emenda) || 0)}
    </span>
  )}
</td>
```
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Open /leads, find a CNPJ with multiple emendas where at least one is Fechado. Expand cascade: verify sub-row shows commission for Fechado emenda. Verify main row only shows green commission total when ALL emendas are Fechado, otherwise shows totalValor in neon.</manual>
  </verify>
  <done>TypeScript compiles without errors. Main row isFechado is true only when every sub-emenda is Fechado. Commission total in main row sums comissao_valor+comissao_bonus across all Fechado sub-emendas. Sub-rows show green commission for Fechado emendas, neon valor_emenda for non-Fechado.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new type errors
- Multi-emenda lead with mixed statuses shows neon valor total (not green commission)
- Multi-emenda lead with all statuses Fechado shows green summed commission
- Sub-row for a Fechado emenda shows its individual commission in green
</verification>

<success_criteria>
Closing one emenda out of N does not flip the entire grouped row to Fechado. Commission displayed on grouped row equals the sum of all closed emendas' commissions.
</success_criteria>

<output>
After completion, create `.planning/quick/52-fix-multi-emenda-commission-soma-comisso/52-01-SUMMARY.md`
</output>
