---
phase: quick-31
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/repo-sync.ts
  - web/src/app/leads/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Paulo (gestor_vendedor) is excluded from round-robin lead assignment"
    - "Paulo's 442 today-leads are redistributed evenly across 4 vendedores"
    - "Leads page shows SUM of all emendas on main row for multi-emenda CNPJs"
    - "Sort by valor uses totalValor (sum) for multi-emenda CNPJs"
    - "Individual emenda values still show correctly in cascade sub-rows"
  artifacts:
    - path: "web/src/lib/repo-sync.ts"
      provides: "Round-robin query excluding gestor_vendedor role"
      contains: "WHERE role = 'vendedor'"
    - path: "web/src/app/leads/page.tsx"
      provides: "displayLeads useMemo with totalValor computed and used"
      contains: "totalValor"
  key_links:
    - from: "repo-sync.ts line 491"
      to: "vendedor assignment"
      via: "role = 'vendedor' only"
      pattern: "WHERE role = 'vendedor'"
    - from: "leads/page.tsx displayLeads useMemo"
      to: "table render valor cell"
      via: "totalValor spread into result object"
      pattern: "totalValor.*reduce"
---

<objective>
Fix two production issues: (1) Paulo (gestor_vendedor) is incorrectly included in the round-robin lead assignment — exclude him by changing the role filter, then redistribute his 442 today-leads to the 4 active vendedores. (2) The /leads page cascade shows the highest individual emenda value on the main row instead of the sum — fix to display totalValor (sum of all emendas) on the main row while keeping individual values in sub-rows.

Purpose: Paulo should not be selling; he manages. Cascade main row should reflect total opportunity value, not just the largest single emenda.
Output: Updated repo-sync.ts, updated leads/page.tsx, and Paulo's 442 leads redistributed via SQL script.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Exclude gestor_vendedor from round-robin + redistribute Paulo's leads</name>
  <files>web/src/lib/repo-sync.ts</files>
  <action>
    1. In `web/src/lib/repo-sync.ts` line 491, change the query from:
       `WHERE role IN ('vendedor', 'gestor_vendedor') AND active = true`
       to:
       `WHERE role = 'vendedor' AND active = true`

    2. Run a Node.js redistribution script (inline via Bash) to reassign Paulo's 442 today-leads to the 4 vendedores using round-robin. Use the pg module from the web/ directory.

       Script logic:
       - Connect to: `postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:6543/postgres`
       - Paulo's id: `8d78f046-f44f-4ed4-a3b8-c5d30308fbf0`
       - Fetch Paulo's today-leads: SELECT id FROM vendedor_projetos WHERE vendedor_id = '8d78f046-f44f-4ed4-a3b8-c5d30308fbf0' AND DATE(created_at) = CURRENT_DATE AND is_existing_client = false ORDER BY id
       - Round-robin assign to these 4 vendedores in order:
           index 0 -> Elisson:    a30f038f-ccc6-4809-91bb-94f22f1a036b
           index 1 -> Gabriel:    90a0b64e-4e4e-4199-b53f-f06a624a4621
           index 2 -> Vitoria:    da10547e-fa49-45af-84e4-7b54f61e7e44
           index 3 -> Wellington: ff96e488-4536-4e1a-b1a4-28d4b70f618b
       - For each lead at index i: UPDATE vendedor_projetos SET vendedor_id = vendedores[i % 4] WHERE id = lead.id
       - Log how many assigned to each vendedor and total updated.

    Run the script from the web/ directory so pg is available via node_modules.
  </action>
  <verify>
    - `grep "WHERE role" /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/repo-sync.ts` — confirms `role = 'vendedor'` only
    - Script output shows ~110 leads assigned to each of the 4 vendedores (442 / 4 ≈ 110-111 each)
    - SQL spot check: `SELECT vendedor_id, COUNT(*) FROM vendedor_projetos WHERE DATE(created_at) = CURRENT_DATE AND is_existing_client = false GROUP BY vendedor_id` — Paulo's id should have 0 or only existing-client leads
  </verify>
  <done>
    repo-sync.ts line 491 uses `role = 'vendedor'` only. Paulo's 442 today new-leads are distributed ~evenly to Elisson, Gabriel, Vitoria, Wellington.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix cascade main row to show SUM of all emendas instead of highest valor</name>
  <files>web/src/app/leads/page.tsx</files>
  <action>
    In `web/src/app/leads/page.tsx`:

    1. In the `displayLeads` useMemo (lines 112-119), update the map to compute and include `totalValor`:

       Change from:
       ```
       let result = Object.entries(leadsByCnpj).map(([cnpj, cnpjLeads]) => {
         const first = cnpjLeads[0] // highest value (ORDER BY valor_emenda DESC)
         return {
           ...first,
           emenda_count: cnpjLeads.length,
           subLeads: cnpjLeads, // all emendas for cascade (including first)
         }
       })
       ```

       Change to:
       ```
       let result = Object.entries(leadsByCnpj).map(([cnpj, cnpjLeads]) => {
         const first = cnpjLeads[0] // highest value (ORDER BY valor_emenda DESC)
         const totalValor = cnpjLeads.reduce((sum, l) => sum + (Number(l.valor_emenda) || 0), 0)
         return {
           ...first,
           totalValor,
           emenda_count: cnpjLeads.length,
           subLeads: cnpjLeads,
         }
       })
       ```

    2. Fix the sort case 'valor' (line 135) to use totalValor when available:

       Change from:
       ```
       case 'valor': va = Number(a.valor_emenda) || 0; vb = Number(b.valor_emenda) || 0; break
       ```

       Change to:
       ```
       case 'valor': va = (a as any).totalValor ?? Number(a.valor_emenda) ?? 0; vb = (b as any).totalValor ?? Number(b.valor_emenda) ?? 0; break
       ```

    3. Fix the table render valor cell (line 397, the `formatCompactCurrency` call on the main row). The current code:
       ```
       {formatCompactCurrency(Number(lead.valor_emenda) || 0)}
       ```
       Change to:
       ```
       {formatCompactCurrency((lead as any).totalValor ?? Number(lead.valor_emenda) ?? 0)}
       ```

    The cascade sub-rows at line 498 already use `sub.valor_emenda` — leave those unchanged.

    Note: If `totalValor` needs to be added to the TypeScript type, use `(lead as any).totalValor` to avoid type errors rather than modifying the interface (keeps change minimal).
  </action>
  <verify>
    - TypeScript build: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20` — no new errors
    - `grep -n "totalValor" /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/leads/page.tsx` — confirms 3 occurrences (reduce, spread, render)
  </verify>
  <done>
    For multi-emenda CNPJs, main row displays sum of all emenda valores. Sort by valor uses the sum. Sub-rows still show individual values. No TypeScript errors introduced.
  </done>
</task>

</tasks>

<verification>
1. `grep "WHERE role" /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/lib/repo-sync.ts` returns `role = 'vendedor'` (not IN with gestor_vendedor)
2. Redistribution script output confirms ~110 leads per vendedor, 0 remaining for Paulo (for new non-existing leads today)
3. `npx tsc --noEmit` passes without new errors in web/src/app/leads/page.tsx
4. `grep -n "totalValor" web/src/app/leads/page.tsx` shows 3 hits
</verification>

<success_criteria>
- Paulo is excluded from future round-robin assignments (role filter is 'vendedor' only)
- Paulo's 442 today-leads are redistributed evenly (~110-111 each) to Elisson, Gabriel, Vitoria, Wellington
- /leads page main row shows totalValor (sum) for multi-emenda CNPJs
- Sort by valor column correctly ranks by total value
- Cascade sub-rows still show individual emenda values unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/31-fix-paulo-roleta-exclusion-cascade-sum-v/31-SUMMARY.md`
</output>
