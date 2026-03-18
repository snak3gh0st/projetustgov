---
phase: quick
plan: 260318-ook
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/components/Sidebar.tsx
autonomous: true
requirements: [QUICK-260318-ook]
must_haves:
  truths:
    - "Gestor sidebar no longer shows 'Importar Planilha' nav entry"
    - "Coordenador, vendedor, and visualizador sidebars are unaffected"
    - "App compiles without errors after removal"
  artifacts:
    - path: "web/src/components/Sidebar.tsx"
      provides: "Sidebar navigation without upload entry for gestor"
  key_links: []
---

<objective>
Remove the "Importar Planilha" sidebar navigation entry from the gestor role's nav items in the dashboard.

Purpose: The import sheets functionality is no longer needed in the sidebar navigation.
Output: Updated Sidebar.tsx without the upload nav entry for gestor role.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/components/Sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Importar Planilha nav entry from gestor sidebar</name>
  <files>web/src/components/Sidebar.tsx</files>
  <action>
    In web/src/components/Sidebar.tsx, remove line 58 which contains:
    `{ href: '/upload', label: 'Importar Planilha', icon: 'upload' },`

    This line is inside the gestor nav items array (the first ternary branch starting at line 55).
    The coordenador role (line 63-69) does NOT have this entry, so no changes needed there.

    Leave the 'upload' icon case in NavIcon (lines 24-25) — it may be used elsewhere and removing it is out of scope.

    After removal, the gestor array should be:
    ```
    ...BASE_NAV_ITEMS,
    { href: '/execucao', label: 'Projetos em Execucao', icon: 'execucao' },
    { href: '/distribuir', label: 'Distribuir Leads', icon: 'distribuir' },
    { href: '/monitoramento', label: 'Monitoramento', icon: 'monitoramento' },
    { href: '/cadastro-vendedor', label: 'Usuarios', icon: 'vendedores' },
    ```
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov && grep -c "Importar Planilha" web/src/components/Sidebar.tsx | grep -q "^0$" && echo "PASS: entry removed" || echo "FAIL: entry still present"</automated>
    <manual>Verify the gestor sidebar no longer shows "Importar Planilha"</manual>
  </verify>
  <done>Line 58 with "Importar Planilha" entry removed from gestor nav items. All other nav entries for all roles remain intact. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
1. `grep "Importar Planilha" web/src/components/Sidebar.tsx` returns no results
2. `npx tsc --noEmit` compiles without errors (or `next build` succeeds)
3. Gestor nav items array has exactly 8 entries (5 base + execucao, distribuir, monitoramento, usuarios)
</verification>

<success_criteria>
- "Importar Planilha" nav entry no longer exists in Sidebar.tsx
- No other nav entries affected
- Application compiles successfully
</success_criteria>

<output>
After completion, create `.planning/quick/260318-ook-delete-import-sheets-tab-from-dashboard/260318-ook-SUMMARY.md`
</output>
