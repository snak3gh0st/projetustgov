---
phase: quick-49
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/page.tsx
autonomous: true
requirements: [QUICK-49]

must_haves:
  truths:
    - "Pipeline status cards show percentage relative to Não Contatado count, not total leads"
    - "Não Contatado card shows 100% (reference point), other statuses show their count as fraction of Não Contatado"
    - "Progress bars visually reflect the new denominator"
  artifacts:
    - path: "web/src/app/page.tsx"
      provides: "Pipeline card pct denominator changed to Não Contatado count"
      contains: "g.by_status['Não Contatado']"
  key_links:
    - from: "web/src/app/page.tsx line ~383"
      to: "g.by_status['Não Contatado']"
      via: "pct denominator"
      pattern: "by_status.*Não Contatado"
---

<objective>
Fix pipeline card percentage calculations on the main dashboard so percentages are relative to "Não Contatado" count instead of total_leads.

Purpose: Percentages should represent funnel conversion from the initial pool of uncontacted leads. "Não Contatado" is the funnel entry point — showing each downstream status as a % of that pool is more meaningful than % of total leads.
Output: page.tsx with updated pct denominator on pipeline status cards.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Change pipeline card pct denominator to Não Contatado</name>
  <files>web/src/app/page.tsx</files>
  <action>
    In the Pipeline de Vendas section (around line 381-383), change the pct calculation:

    Current (uses total_leads as denominator):
    ```
    const pct = g.total_leads > 0 ? (count / g.total_leads) * 100 : 0
    ```

    Change to (uses Não Contatado count as denominator):
    ```
    const naoContatadoCount = g.by_status['Não Contatado'] || 0
    const pct = naoContatadoCount > 0 ? (count / naoContatadoCount) * 100 : 0
    ```

    Place the `naoContatadoCount` derivation OUTSIDE the `STATUS_ORDER.map()` call (before it, once) since it's a constant for the entire map iteration.

    The progress bar already uses `pct` so it will update automatically. Cap the bar width at 100% — already handled by `Math.max(pct, 2)` but add `Math.min(pct, 100)` guard: `style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}`. This prevents Não Contatado's bar (100%) from overflowing and prevents any rounding > 100%.

    No changes needed to the tooltip text, label, or conversion rate sub-label (those use different values).
  </action>
  <verify>npx tsc --noEmit --project /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/tsconfig.json 2>&1 | tail -5</verify>
  <done>TypeScript compiles with zero errors. page.tsx pct denominator uses g.by_status['Não Contatado']. Não Contatado card shows ~100%, other status cards show their count as fraction of Não Contatado pool.</done>
</task>

</tasks>

<verification>
- TypeScript compiles clean: `npx tsc --noEmit` in web/ directory passes
- `g.by_status['Não Contatado']` appears as denominator in page.tsx pipeline cards section
- Progress bar width capped at 100% via Math.min guard
</verification>

<success_criteria>
Pipeline status cards show percentages relative to Não Contatado count. Não Contatado = 100% reference, downstream statuses (Retorno, Proposta, Fechado) show as fraction of that pool. TypeScript clean.
</success_criteria>

<output>
After completion, create `.planning/quick/49-fix-percentuais-na-aba-comissionamento-c/49-SUMMARY.md`
</output>
