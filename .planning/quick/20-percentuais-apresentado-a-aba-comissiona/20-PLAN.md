---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/page.tsx
autonomous: true
requirements: [QUICK-20]

must_haves:
  truths:
    - "Pipeline cards show percentage relative to TOTAL GERAL de Leads (g.total_leads), not active pipeline subtotal"
    - "Detalhamento Comissoes section renders correctly with proper color/bg styling (no undefined cfg)"
  artifacts:
    - path: "web/src/app/page.tsx"
      provides: "Fixed pct denominator and fixed STATUS_CONFIG fallback key"
      contains: "g.total_leads"
  key_links:
    - from: "totalForPipeline (removed)"
      to: "g.total_leads"
      via: "pct = count / g.total_leads * 100"
      pattern: "g\\.total_leads"
    - from: "STATUS_CONFIG fallback line 410"
      to: "STATUS_CONFIG['Não Contatado']"
      via: "correct accent key"
      pattern: "STATUS_CONFIG\\['Não Contatado'\\]"
---

<objective>
Fix two percentage/display bugs in the CRM Dashboard home page:

1. Pipeline card percentages use `totalForPipeline` (sum of active statuses, dominated by Não Contatado) as denominator. User wants percentages relative to TOTAL GERAL de Leads (`g.total_leads`).
2. `STATUS_CONFIG['Nao Contatado']` fallback on line 410 uses wrong key (missing accent) — `STATUS_CONFIG['Nao Contatado']` is `undefined` because the map only has `'Não Contatado'`. This causes cfg to be `undefined`, breaking the Detalhamento Comissoes section.

Purpose: Percentages must reflect each status as a share of all leads, not just the active pipeline subtotal.
Output: Updated `web/src/app/page.tsx` with correct denominator and correct fallback key.
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
  <name>Task 1: Fix pipeline pct denominator + STATUS_CONFIG fallback key</name>
  <files>web/src/app/page.tsx</files>
  <action>
Two independent fixes in web/src/app/page.tsx:

**Fix 1 — pct denominator (lines 156-161, 242):**

Remove `totalForPipeline` entirely (lines 156-161):
```
const totalForPipeline = (
  (g.by_status['Não Contatado'] || 0) +
  (g.by_status['Retorno'] || 0) +
  (g.by_status['Proposta'] || 0) +
  (g.by_status['Aguardando Closer'] || 0)
) || 1
```

On line 242, replace:
```
const pct = totalForPipeline > 0 ? (count / totalForPipeline) * 100 : 0
```
with:
```
const pct = g.total_leads > 0 ? (count / g.total_leads) * 100 : 0
```

This makes each pipeline card show its count as a percentage of ALL leads (total_leads from global stats), not just the active pipeline subset. The progress bar width on line 267 also uses `pct` so it will automatically reflect the correct scale.

**Fix 2 — STATUS_CONFIG fallback key (line 410):**

Change:
```
const cfg = STATUS_CONFIG[item.status_contato] || STATUS_CONFIG['Nao Contatado']
```
to:
```
const cfg = STATUS_CONFIG[item.status_contato] || STATUS_CONFIG['Não Contatado']
```

`'Nao Contatado'` (no accent) does not exist in STATUS_CONFIG — only `'Não Contatado'` does. This fix ensures the fallback resolves to a valid config object instead of `undefined`, preventing potential runtime errors and ensuring correct color/bg styling in the Detalhamento Comissoes section.
  </action>
  <verify>
1. Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20` — should produce no new errors.
2. Search for `totalForPipeline` in page.tsx — should return no results (variable fully removed).
3. Search for `'Nao Contatado'` in page.tsx — should return no results (accent restored on fallback).
  </verify>
  <done>
- `totalForPipeline` variable is gone; `pct` on line 242 divides by `g.total_leads`.
- Pipeline card percentages now sum to ~100% across all 5 statuses (including Fechado).
- STATUS_CONFIG fallback on the commission breakdown row uses `'Não Contatado'` (with accent).
- TypeScript compilation passes with no new errors.
  </done>
</task>

</tasks>

<verification>
After the fix, visually confirm on the dashboard:
- The 5 pipeline cards show percentages that add up to approximately 100% (e.g., if Não Contatado is 60% of total leads, it should show ~60%, not inflate to near 100%).
- The "Detalhamento Comissoes" section (visible for vendedor role) renders status badges with correct orange/amber/blue/green colors, not broken/unstyled items.
</verification>

<success_criteria>
- `totalForPipeline` removed from page.tsx; pct uses `g.total_leads` as denominator.
- STATUS_CONFIG fallback key corrected to `'Não Contatado'` (with cedilla+tilde).
- `npx tsc --noEmit` passes with no new type errors.
</success_criteria>

<output>
After completion, create `.planning/quick/20-percentuais-apresentado-a-aba-comissiona/20-SUMMARY.md` using the summary template.
</output>
