---
phase: quick-19
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/leads/page.tsx
  - web/src/components/LeadSlideOver.tsx
  - web/src/app/page.tsx
autonomous: true
requirements: [QUICK-19]

must_haves:
  truths:
    - "Leads with status_contato = 'AINDA NÃO' display a yellow badge distinct from the orange 'Não Contatado' badge"
    - "The status filter dropdown on /leads includes 'AINDA NÃO' so gestores can filter legacy leads"
    - "The slide-over badge for 'AINDA NÃO' leads shows yellow color (not orange, not red fallback)"
    - "The home dashboard STATUS_CONFIG recognizes 'AINDA NÃO' so stale_leads and recent_activity render correctly"
  artifacts:
    - path: "web/src/app/leads/page.tsx"
      provides: "STATUS_OPTIONS with AINDA NÃO + STATUS_COLORS with yellow mapping"
      contains: "AINDA NÃO"
    - path: "web/src/components/LeadSlideOver.tsx"
      provides: "STATUS_COLORS with AINDA NÃO yellow mapping"
      contains: "AINDA NÃO"
    - path: "web/src/app/page.tsx"
      provides: "STATUS_CONFIG with AINDA NÃO fallback entry"
      contains: "AINDA NÃO"
  key_links:
    - from: "web/src/app/leads/page.tsx STATUS_COLORS"
      to: "per-row status badge select"
      via: "STATUS_COLORS[lead.status_contato] fallback"
      pattern: "STATUS_COLORS\\[lead\\.status_contato\\]"
    - from: "web/src/components/LeadSlideOver.tsx STATUS_COLORS"
      to: "slide-over status span"
      via: "STATUS_COLORS[lead.status_contato] fallback"
      pattern: "STATUS_COLORS\\[lead\\.status_contato\\]"
---

<objective>
Add "AINDA NÃO" as a recognized status with a distinct yellow color scheme, differentiated from the orange "Não Contatado" status, across all status badge and filter surfaces.

Purpose: Leads in the DB that still carry the legacy `status_contato = 'AINDA NÃO'` value (from before the pipeline schema migration) currently fall back to the "Não Contatado" orange color, making them visually indistinguishable. The user needs to identify these legacy leads at a glance.
Output: STATUS_COLORS and STATUS_CONFIG maps updated with a yellow entry for "AINDA NÃO" in leads page, slide-over, and home dashboard. Filter dropdown also includes "AINDA NÃO" so gestores can filter to those legacy leads.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/leads/page.tsx
@web/src/components/LeadSlideOver.tsx
@web/src/app/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AINDA NÃO yellow color to all status maps</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/components/LeadSlideOver.tsx
    web/src/app/page.tsx
  </files>
  <action>
**web/src/app/leads/page.tsx**

1. Add "AINDA NÃO" to `STATUS_OPTIONS` array (line 10). Place it after "Não Contatado" since it's a related legacy status:
   ```ts
   const STATUS_OPTIONS = ['Não Contatado', 'AINDA NÃO', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado', 'Telefone Invalido']
   ```

2. Add "AINDA NÃO" to `STATUS_COLORS` map (lines 11-18) with yellow styling — distinct from orange "Não Contatado" and amber "Retorno":
   ```ts
   'AINDA NÃO': 'bg-yellow-50 text-yellow-700',
   ```
   Insert after the 'Não Contatado' entry. Yellow-700 is darker than amber-600 so it reads differently.

**web/src/components/LeadSlideOver.tsx**

3. Add "AINDA NÃO" to `STATUS_COLORS` map (lines 8-15) with yellow styling including border (consistent with other entries in this file):
   ```ts
   'AINDA NÃO': 'bg-yellow-50 text-yellow-700 border-yellow-300',
   ```
   Insert after the 'Não Contatado' entry.

   Also while here: update 'Não Contatado' from the stale red (`'bg-red-50 text-red-500 border-red-200'`) to orange, matching leads/page.tsx:
   ```ts
   'Não Contatado': 'bg-orange-50 text-orange-600 border-orange-200',
   ```

**web/src/app/page.tsx**

4. Add "AINDA NÃO" to `STATUS_CONFIG` map (lines 82-89) so stale_leads and recent_activity feed can render the correct color for legacy leads without falling back to undefined:
   ```ts
   'AINDA NÃO': { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', bar: 'bg-yellow-500', label: 'AINDA NÃO' },
   ```
   Insert after the 'Não Contatado' entry.

   Do NOT add "AINDA NÃO" to `STATUS_ORDER` — it is a legacy status and should not appear in the pipeline funnel cards on the home dashboard. It is only needed as a fallback lookup in STATUS_CONFIG.
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npm run build 2>&1 | tail -20`
  </verify>
  <done>
    - Build passes with no TypeScript errors
    - STATUS_OPTIONS in leads/page.tsx contains 'AINDA NÃO'
    - STATUS_COLORS in leads/page.tsx contains 'AINDA NÃO' with yellow-50/yellow-700
    - STATUS_COLORS in LeadSlideOver.tsx contains 'AINDA NÃO' with yellow-50/yellow-700/yellow-300
    - STATUS_CONFIG in page.tsx contains 'AINDA NÃO' with yellow palette
    - 'Não Contatado' in LeadSlideOver.tsx updated from red to orange
    - 'AINDA NÃO' not in STATUS_ORDER (not shown in pipeline funnel)
  </done>
</task>

</tasks>

<verification>
After task completes:
1. `npm run build` passes with zero TypeScript errors
2. In /leads page: status filter dropdown shows "AINDA NÃO" as an option
3. A lead with status_contato = 'AINDA NÃO' shows a yellow badge (bg-yellow-50 text-yellow-700) NOT orange
4. A lead with status_contato = 'Não Contatado' shows orange badge — unchanged
5. Opening the slide-over for an 'AINDA NÃO' lead shows the yellow badge in the header
6. Home dashboard stale_leads and recent_activity items with 'AINDA NÃO' render the yellow config instead of falling back to undefined
</verification>

<success_criteria>
- "AINDA NÃO" leads are visually distinct (yellow) from "Não Contatado" (orange) across all pages
- Filter dropdown allows selecting "AINDA NÃO" to surface all legacy leads
- Build passes with no TypeScript errors
- No regressions to other status colors
</success_criteria>

<output>
After completion, create `.planning/quick/19-filtro-ainda-n-o-com-esquema-de-cor-dife/19-SUMMARY.md` following the summary template.
</output>
