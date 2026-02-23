---
phase: quick-44
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/lead/[cnpj]/page.tsx
autonomous: true
requirements:
  - QUICK-44
must_haves:
  truths:
    - "AINDA NÃO appears as an option in the status dropdown on the lead detail page"
    - "Selecting AINDA NÃO saves correctly and shows the correct color badge"
  artifacts:
    - path: "web/src/app/lead/[cnpj]/page.tsx"
      provides: "Updated STATUS_OPTIONS array and STATUS_COLORS map with Ainda Não"
      contains: "Ainda Não"
  key_links:
    - from: "STATUS_OPTIONS"
      to: "select dropdown"
      via: "STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)"
      pattern: "Ainda Não"
    - from: "STATUS_COLORS"
      to: "select className"
      via: "STATUS_COLORS[p.status_contato]"
      pattern: "Ainda Não.*rose"
---

<objective>
Add "Ainda Não" to the status dropdown on the lead detail page (/lead/[cnpj]).

Purpose: Vendedores need to set this status from the detail page, same as they can from the leads list and pipeline.
Output: Updated STATUS_OPTIONS and STATUS_COLORS in web/src/app/lead/[cnpj]/page.tsx.
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
  <name>Task 1: Add Ainda Não to STATUS_OPTIONS and STATUS_COLORS</name>
  <files>web/src/app/lead/[cnpj]/page.tsx</files>
  <action>
In web/src/app/lead/[cnpj]/page.tsx, make two changes at the top of the file (lines 12-20):

1. Update STATUS_OPTIONS (line 12) — insert 'Ainda Não' between 'Não Contatado' and 'Retorno':
   BEFORE: ['Não Contatado', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado', 'Telefone Invalido']
   AFTER:  ['Não Contatado', 'Ainda Não', 'Retorno', 'Proposta', 'Aguardando Closer', 'Fechado', 'Telefone Invalido']

2. Add entry to STATUS_COLORS after the 'Não Contatado' entry:
   'Ainda Não': 'bg-rose-500/20 text-rose-600',

   This matches the color used in page.tsx STATUS_CONFIG (text-rose-600 / bg-rose-500).

No other changes needed — the dropdown already maps STATUS_OPTIONS to <option> elements and reads STATUS_COLORS for the className.
  </action>
  <verify>
Search the file for 'Ainda Não' — it should appear in both STATUS_OPTIONS and STATUS_COLORS.
Run: grep -n "Ainda" web/src/app/lead/\[cnpj\]/page.tsx
Expected: two matching lines (one in the array, one in the colors map).
  </verify>
  <done>
"Ainda Não" is present in STATUS_OPTIONS and STATUS_COLORS with color 'bg-rose-500/20 text-rose-600'. The dropdown at line ~489 will render it as an option automatically.
  </done>
</task>

</tasks>

<verification>
grep -n "Ainda" web/src/app/lead/\[cnpj\]/page.tsx
— Expect two lines: one in STATUS_OPTIONS array, one in STATUS_COLORS map.
</verification>

<success_criteria>
The lead detail page status dropdown includes "Ainda Não" as a selectable option with a rose color badge, consistent with the main leads list display.
</success_criteria>

<output>
After completion, create .planning/quick/44-adicionar-status-ainda-n-o-no-dropdown-d/44-SUMMARY.md
</output>
