---
phase: quick
plan: 260410-kmx
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/tgov/TGovDashboardClient.tsx
autonomous: true
requirements: [QUICK-260410-kmx]

must_haves:
  truths:
    - "Prestacao de Contas tab last column shows 'Atraso' (red) or 'Em tempo' (green) based on diaLimitePrestContas date"
    - "Execucao tab last column remains unchanged — still shows Desembolso Sim/Nao"
  artifacts:
    - path: "web/src/app/tgov/TGovDashboardClient.tsx"
      provides: "ExecucaoTable with mode-aware last column"
  key_links:
    - from: "ExecucaoTable"
      to: "diaLimitePrestContas field"
      via: "date comparison against today"
      pattern: "diaLimitePrestContas.*new Date"
---

<objective>
Change the last column of the Prestacao de Contas tab table from "Desembolso" (Sim/Nao) to show "Atraso" or "Em tempo" based on the Limite PC date (diaLimitePrestContas). When diaLimitePrestContas is in the past, show "Atraso" (red). When in the future or today, show "Em tempo" (green). When null, show a dash.

The Execucao tab must remain unchanged — it keeps the Desembolso Sim/Nao column.

Purpose: Business users need to see at a glance which prestacao de contas entries are overdue vs on time.
Output: Updated ExecucaoTable component with mode-aware last column.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/tgov/TGovDashboardClient.tsx
@web/src/lib/tgov.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mode prop to ExecucaoTable and render Atraso/Em tempo for prestacao_contas</name>
  <files>web/src/app/tgov/TGovDashboardClient.tsx</files>
  <action>
1. Add a `mode` prop to the `ExecucaoTable` component: `mode?: 'execucao' | 'prestacao_contas'` (default `'execucao'`).

2. Update the two call sites (lines ~755-768) to pass `mode`:
   - `activeTab === 'prestacao_contas'` block: pass `mode="prestacao_contas"`
   - `activeTab === 'execucao'` block: pass `mode="execucao"` (or omit, uses default)

3. In the `<thead>`, make the last data column header conditional on `mode`:
   - `mode === 'prestacao_contas'` -> header label: `"Prazo PC"` (sortable via `SortableTh` on col `"diasPrestContas"`)
   - `mode === 'execucao'` (default) -> keep current: `<th>Desembolso</th>` (non-sortable, as-is)

4. In the `<tbody>` row rendering, make the last data `<td>` conditional on `mode`:
   - `mode === 'prestacao_contas'`:
     - Compute: `const limiteDate = row.diaLimitePrestContas ? new Date(row.diaLimitePrestContas + 'T00:00:00') : null`
     - Compute: `const isAtraso = limiteDate ? limiteDate < new Date(new Date().toISOString().slice(0,10) + 'T00:00:00') : null`
     - If `isAtraso === null`: show `"—"` in gray
     - If `isAtraso === true`: show badge with red dot + "Atraso" (use same pill style: `bg-red-50 text-red-600`, dot `bg-red-400`)
     - If `isAtraso === false`: show badge with green dot + "Em tempo" (use same pill style: `bg-green-50 text-green-700`, dot `bg-green-500`)
   - `mode === 'execucao'`: keep current Desembolso Sim/Nao logic unchanged

5. Do NOT change the sidecard (ExecucaoSidecard) — it still shows Desembolso info regardless of tab.
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov && npx tsc --noEmit --project web/tsconfig.json 2>&1 | head -30</automated>
    <manual>Open /tgov, switch to Prestacao de Contas tab. Last column should show "Atraso" (red) or "Em tempo" (green). Switch to Execucao tab — last column should still show Desembolso Sim/Nao.</manual>
  </verify>
  <done>Prestacao de Contas tab shows Prazo PC column with Atraso/Em tempo badges based on diaLimitePrestContas date. Execucao tab unchanged with Desembolso Sim/Nao.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Prestacao de Contas tab last column reads "Prazo PC" header and shows Atraso/Em tempo
- Execucao tab last column still reads "Desembolso" and shows Sim/Nao
- Rows with null diaLimitePrestContas show dash in Prestacao de Contas tab
</verification>

<success_criteria>
- Prestacao de Contas tab last column displays "Atraso" for past Limite PC dates, "Em tempo" for future/today dates
- Execucao tab behavior completely unchanged
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/260410-kmx-ultima-coluna-da-prestacao-de-contas-tgo/260410-kmx-SUMMARY.md`
</output>
