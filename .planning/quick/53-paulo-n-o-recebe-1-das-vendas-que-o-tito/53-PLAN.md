---
phase: quick-53
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/comissoes/route.ts
autonomous: true
requirements: [QUICK-53]
must_haves:
  truths:
    - "Paulo receives 1% only on leads assigned to regular vendedores (role = 'vendedor')"
    - "Paulo does NOT receive 1% on Tito's leads (gestor role)"
    - "Paulo does NOT receive 1% on his own leads (coordenador role, assigned to himself)"
  artifacts:
    - path: "web/src/app/api/comissoes/route.ts"
      provides: "Corrected coordenadorRows SQL with role filter + self-exclusion"
      contains: "u.role = 'vendedor'"
  key_links:
    - from: "coordenadorRows query"
      to: "users table JOIN"
      via: "JOIN users u ON u.id = vp.vendedor_id"
      pattern: "u\\.role = 'vendedor'"
---

<objective>
Fix Paulo's 1% coordenador commission calculation so it only counts leads assigned to regular vendedores, excluding Tito's leads (gestor role) and Paulo's own leads.

Purpose: Paulo (coordenador) earns 1% on his team's sales, not on his own sales or Tito's (socio/gestor) sales.
Output: Corrected coordenadorRows SQL query in /api/comissoes/route.ts
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/comissoes/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix coordenadorRows query to exclude gestor leads and Paulo's own leads</name>
  <files>web/src/app/api/comissoes/route.ts</files>
  <action>
In `web/src/app/api/comissoes/route.ts`, find the `coordenadorRows` query (around line 195-205). It currently reads:

```sql
SELECT
  COALESCE(SUM(vp.valor_venda) * 0.01, 0)::numeric as total,
  COUNT(DISTINCT vp.cnpj)::int as count,
  COALESCE(SUM(vp.valor_venda), 0)::numeric as valor_venda
FROM vendedor_projetos vp
WHERE ${pauloWhere}
  AND vp.vendedor_id IS NOT NULL
  AND vp.valor_venda > 0
```

Replace it with:

```sql
SELECT
  COALESCE(SUM(vp.valor_venda) * 0.01, 0)::numeric as total,
  COUNT(DISTINCT vp.cnpj)::int as count,
  COALESCE(SUM(vp.valor_venda), 0)::numeric as valor_venda
FROM vendedor_projetos vp
JOIN users u ON u.id = vp.vendedor_id
WHERE ${pauloWhere}
  AND vp.vendedor_id IS NOT NULL
  AND vp.valor_venda > 0
  AND u.role = 'vendedor'
  AND vp.vendedor_id != $${pIdx}
```

And pass `[...pauloParams, pauloUserId]` as the params for this query (just like `exclusivoRows` does — the `$${pIdx}` already points to pauloUserId since pIdx was incremented only for start/end date params).

The two critical additions:
- `JOIN users u ON u.id = vp.vendedor_id` — needed to check the vendedor's role
- `AND u.role = 'vendedor'` — excludes Tito (gestor) and Paulo himself (coordenador) from the 1% base
- `AND vp.vendedor_id != $${pIdx}` with pauloUserId param — explicit self-exclusion guard

Note: `u.role = 'vendedor'` already excludes gestor, coordenador, gestor_vendedor, and visualizador roles. The vendedor_id != pauloUserId is a redundant safety guard (coordenador role already handles it) but makes intent explicit.

After editing, verify the `pIdx` variable value at this point in code: it starts at 1, increments once per date param (startDate adds 1, endDate adds 1). The pauloUserId param is appended as the last element in params arrays. Confirm the `$${pIdx}` placeholder matches the position of pauloUserId in `[...pauloParams, pauloUserId]`.
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>
      Login as Paulo (coordenador). Go to /comissoes. Check the "Coordenador (1%)" breakdown card.
      Before fix: the card total includes Tito's sales AND Paulo's own sales.
      After fix: the card total should only count leads where the assigned vendedor has role='vendedor' (not Paulo himself, not Tito).
      Cross-check: if Tito has R$X in sales and Paulo has R$Y in his own sales, Paulo's 1% card should be lower by (X+Y)*0.01.
    </manual>
  </verify>
  <done>Paulo's Coordenador commission card only sums valor_venda from leads where vendedor.role = 'vendedor' AND vendedor_id != Paulo's userId. Tito's leads and Paulo's own leads are excluded from the 1% base.</done>
</task>

</tasks>

<verification>
Run TypeScript check: `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit`
Confirm no type errors introduced by the JOIN addition.
Manual verify: As Paulo (coordenador), the /comissoes paulo_breakdown.coordenador.total should be lower than before, excluding Tito and Paulo's own leads.
</verification>

<success_criteria>
- TypeScript compiles without errors
- coordenadorRows SQL has JOIN users u + AND u.role = 'vendedor' + AND vp.vendedor_id != $N
- pauloUserId is passed as the last param in coordenadorRows params array
- Paulo's 1% commission only reflects regular vendedor sales
</success_criteria>

<output>
After completion, create `.planning/quick/53-paulo-n-o-recebe-1-das-vendas-que-o-tito/53-SUMMARY.md` following the summary template.
</output>
