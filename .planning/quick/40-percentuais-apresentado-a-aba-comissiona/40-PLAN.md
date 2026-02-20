---
phase: quick-40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/comissoes/page.tsx
  - web/src/app/api/dashboard-crm/route.ts
autonomous: true
requirements: [QUICK-40]

must_haves:
  truths:
    - "Pipeline percentages on Meu Pipeline and any comissoes summary show X% relative to TOTAL GERAL de Leads"
    - "No percentage uses Nao Contatado count (or subset of statuses) as the denominator"
    - "All status cards sum to approximately 100% across the pipeline"
  artifacts:
    - path: "web/src/app/comissoes/page.tsx"
      provides: "Comissionamento page with correct percentage denominators"
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "API returning correct total_leads (all statuses) as percentage base"
  key_links:
    - from: "web/src/app/page.tsx pipeline cards"
      to: "g.total_leads"
      via: "pct = count / g.total_leads"
      pattern: "total_leads"
    - from: "web/src/app/comissoes/page.tsx"
      to: "any percentage display"
      via: "denominator must be total leads not subset"
      pattern: "toFixed.*%"
---

<objective>
Fix percentages on the Comissionamento tab that incorrectly use NÃO CONTATADO count (or a non-total subset) as denominator instead of TOTAL GERAL de Leads.

Purpose: Percentages should always reflect a status count as a share of all leads, not as a share of the "Nao Contatado" bucket. Quick-20 fixed this on page.tsx; this task closes a remaining or regressed instance.
Output: All % values on pipeline and comissoes views correctly denominated by total_leads.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/quick-20/20-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Find and fix wrong percentage denominator in comissoes/pipeline views</name>
  <files>
    web/src/app/comissoes/page.tsx
    web/src/app/api/dashboard-crm/route.ts
    web/src/app/page.tsx
  </files>
  <action>
    INVESTIGATE: Find where percentages are computed using nao_contatado (or a subset of statuses) instead of total_leads.

    Check all these locations in order:

    1. web/src/app/page.tsx — pipeline cards (pct calculation around line 379).
       Confirm: `const pct = g.total_leads > 0 ? (count / g.total_leads) * 100 : 0`
       If any variant uses `totalForPipeline`, `by_status['Não Contatado']`, or a sum of non-Fechado statuses as denominator — fix it to use `g.total_leads`.

    2. web/src/app/comissoes/page.tsx — look for ANY percentage calculation.
       If there is a `pct`, `percent`, or division like `count / someSubset * 100` — fix denominator to use total leads.
       If there is a "% do total" or progress bar using wrong base — fix it.

    3. web/src/app/api/dashboard-crm/route.ts — check if `total_leads` in the API response (returned as `global.total_leads`) might be accidentally equal to `status_nao_contatado` due to a WHERE clause that filters only non-Fechado or only uncontacted leads.
       The correct query: `COUNT(DISTINCT cnpj) FROM vendedor_projetos [optional vendedor filter]` — no status filter.
       If a status filter was accidentally added to the `total_leads` count query, remove it.

    FIX: Apply whatever change resolves the denominator issue. The fix should mirror what quick-20 did for `totalForPipeline`:
    - Before (wrong): `pct = count / naoContatadoCount * 100` or `pct = count / totalForPipeline * 100`
    - After (correct): `pct = count / g.total_leads * 100` (or equivalent total)

    If no code-level bug is found (all calculations look correct), then the issue may be that `g.total_leads` from the API equals `nao_contatado` in practice because most leads have no status set. In that case, add a sub-label to the NÃO CONTATADO pipeline card showing "X de Y total" to make the math transparent to the user. Also confirm the STATUS_CONFIG fallback in comissoes page still uses `STATUS_CONFIG['Não Contatado']` (with accent, not bare 'Nao Contatado').
  </action>
  <verify>
    npx tsc --noEmit (run from web/ directory) — must pass with zero errors.
    Visually confirm: on /comissoes page or home pipeline, the NÃO CONTATADO % is clearly relative to total leads, not to itself or a subset.
  </verify>
  <done>
    Pipeline card pct uses total_leads as denominator everywhere it appears.
    No percentage in the comissoes views uses nao_contatado count as denominator.
    TypeScript compiles clean.
  </done>
</task>

</tasks>

<verification>
- npx tsc --noEmit passes from web/ directory
- Open / (home page) as vendedor — NÃO CONTATADO card shows reasonable % (e.g. 70%, not 100%)
- Open /comissoes — no percentage values appear to be inflated or relative to wrong base
- Sum of all status card percentages approximates 100% of total leads
</verification>

<success_criteria>
All percentage values in pipeline and comissoes views denominated by TOTAL GERAL de Leads. TypeScript clean.
</success_criteria>

<output>
After completion, create `.planning/quick/40-percentuais-apresentado-a-aba-comissiona/40-SUMMARY.md` following the summary template.
</output>
