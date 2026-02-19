---
phase: quick-27
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/page.tsx
  - web/src/app/leads/page.tsx
  - web/src/components/LeadSlideOver.tsx
  - web/src/components/DashboardCharts.tsx
autonomous: true
requirements: [QUICK-27]

must_haves:
  truths:
    - "AINDA NÃO status displays in a visually distinct color from Não Contatado (orange) and Retorno (amber)"
    - "Pipeline card sub-labels never show values above 100% (e.g., 300% de Aguardando Closer no longer appears)"
    - "All status surfaces (pipeline cards, leads table badge, slide-over badge, BI charts) use the new AINDA NÃO color consistently"
  artifacts:
    - path: "web/src/app/page.tsx"
      provides: "STATUS_CONFIG for AINDA NÃO updated + pipeline conversionRate guard"
      contains: "AINDA NÃO"
    - path: "web/src/app/leads/page.tsx"
      provides: "STATUS_COLORS for AINDA NÃO updated"
      contains: "AINDA NÃO"
    - path: "web/src/components/LeadSlideOver.tsx"
      provides: "STATUS_COLORS for AINDA NÃO updated"
      contains: "AINDA NÃO"
    - path: "web/src/components/DashboardCharts.tsx"
      provides: "Chart color for AINDA NÃO updated"
      contains: "AINDA NÃO"
  key_links:
    - from: "STATUS_CONFIG in page.tsx"
      to: "pipeline card top bar and badge"
      via: "cfg.bar and cfg.color classes"
    - from: "conversionRate guard in page.tsx"
      to: "sub-label render"
      via: "conditional render only when conversionRate <= 100"
---

<objective>
Two focused UI fixes for the CRM pipeline dashboard:

1. Change AINDA NAO color scheme from yellow (too close to amber/Retorno) to rose/pink so it is visually distinct from Não Contatado (orange) and Retorno (amber).
2. Fix pipeline card conversion sub-labels to never display percentages above 100% — when Fechado count exceeds Aguardando Closer count the current code shows "300% de Aguardando Closer" which is confusing.

Purpose: Client feedback — AINDA NÃO looks indistinguishable from nearby statuses; sub-label math shows nonsensical values.
Output: Updated color classes across 4 files and a one-line guard on the conversionRate sub-label.
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
  <name>Task 1: Change AINDA NÃO color to rose across all status surfaces</name>
  <files>
    web/src/app/page.tsx
    web/src/app/leads/page.tsx
    web/src/components/LeadSlideOver.tsx
    web/src/components/DashboardCharts.tsx
  </files>
  <action>
Replace every AINDA NÃO color reference from yellow to rose across all 4 files:

web/src/app/page.tsx — line ~84, STATUS_CONFIG entry:
  BEFORE: 'AINDA NÃO': { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', bar: 'bg-yellow-500', label: 'AINDA NÃO' }
  AFTER:  'AINDA NÃO': { color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', bar: 'bg-rose-500', label: 'AINDA NÃO' }

web/src/app/leads/page.tsx — line ~14, STATUS_COLORS entry:
  BEFORE: 'AINDA NÃO': 'bg-yellow-50 text-yellow-700'
  AFTER:  'AINDA NÃO': 'bg-rose-50 text-rose-600'

web/src/components/LeadSlideOver.tsx — line ~10, STATUS_COLORS entry:
  BEFORE: 'AINDA NÃO': 'bg-yellow-50 text-yellow-700 border-yellow-300'
  AFTER:  'AINDA NÃO': 'bg-rose-50 text-rose-600 border-rose-300'

web/src/components/DashboardCharts.tsx — line ~12, color map entry:
  BEFORE: 'AINDA NÃO': '#eab308'   (yellow-500 hex)
  AFTER:  'AINDA NÃO': '#f43f5e'   (rose-500 hex)

Rationale: rose/pink is clearly distinct from orange (Não Contatado), amber (Retorno), yellow (unused after this change), blue (Proposta), purple (Aguardando Closer), green (Fechado), gray (Telefone Invalido). Yellow was too close to amber visually.
  </action>
  <verify>npx tsc --noEmit --project /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/tsconfig.json 2>&1 | tail -5</verify>
  <done>TypeScript compiles with zero errors. All 4 files have rose-* classes or #f43f5e hex for AINDA NÃO — no yellow references remain for this status.</done>
</task>

<task type="auto">
  <name>Task 2: Guard pipeline conversionRate sub-label against values above 100%</name>
  <files>
    web/src/app/page.tsx
  </files>
  <action>
In web/src/app/page.tsx, find the pipeline card rendering block (around line 289-293).

Current code:
  {conversionRate && (
    &lt;p className="text-[10px] text-gray-400 mt-1.5"&gt;
      {conversionRate}% de {STATUS_CONFIG[STATUS_ORDER[idx - 1]].label}
    &lt;/p&gt;
  )}

Change the condition to only render when conversionRate is numerically <= 100:
  {conversionRate && Number(conversionRate) <= 100 && (
    &lt;p className="text-[10px] text-gray-400 mt-1.5"&gt;
      {conversionRate}% de {STATUS_CONFIG[STATUS_ORDER[idx - 1]].label}
    &lt;/p&gt;
  )}

This silently hides the sub-label when the conversion rate exceeds 100% (e.g., when Fechado count > Aguardando Closer count). The card still shows the absolute count and the % of total in the top-right — only the contextually-confusing stage conversion sub-label is suppressed.
  </action>
  <verify>npx tsc --noEmit --project /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/tsconfig.json 2>&1 | tail -5</verify>
  <done>TypeScript compiles clean. The conditional now reads `conversionRate && Number(conversionRate) <= 100 &&` — values above 100% produce no sub-label on the pipeline card.</done>
</task>

</tasks>

<verification>
After both tasks:
1. Run `npx tsc --noEmit` from web/ — zero errors expected.
2. Visually: AINDA NÃO badges/cards should appear rose/pink, clearly distinct from orange (Não Contatado) and amber (Retorno).
3. Pipeline cards: the Fechado card should no longer show "300% de Aguardando Closer" when Fechado count > Aguardando Closer count.
</verification>

<success_criteria>
- AINDA NÃO status is rose/pink in pipeline cards, leads table badges, slide-over badge, and BI charts.
- No yellow-* Tailwind classes remain for AINDA NÃO in any of the 4 modified files.
- Pipeline sub-labels only appear when conversion rate is 1–100%; values over 100% produce no label.
- TypeScript compilation passes with zero errors.
</success_criteria>

<output>
After completion, create `.planning/quick/27-filtro-ainda-nao-com-esquema-de-cor-dife/27-SUMMARY.md` following the summary template.
</output>
