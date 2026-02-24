---
phase: quick-55
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/bi/route.ts
  - web/src/app/api/dashboard-crm/route.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "BI commission_by_vendedor chart never shows Tito (gestor role) as a bar"
    - "BI ainda_nao_count only counts CNPJs with an assigned vendedor"
    - "BI ticket_medio is the average of per-CNPJ averages (not per-emenda-row)"
    - "dashboard-crm commission_breakdown query excludes gestor-role users from comissao_valor sum"
    - "Paulo's comissoes page Total card shows correct value including 1% coordenador commission"
  artifacts:
    - path: "web/src/app/api/bi/route.ts"
      provides: "Fixed BI queries: gestor exclusion in chart 9, vendedor_id guard in KPI 6, per-CNPJ ticket_medio in KPI 5"
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "Fixed commission_breakdown query 5 with gestor role exclusion"
  key_links:
    - from: "web/src/app/api/bi/route.ts"
      to: "users table"
      via: "JOIN users u ON u.id = vp.vendedor_id"
      pattern: "u\\.role != 'gestor'"
    - from: "web/src/app/api/dashboard-crm/route.ts"
      to: "users table"
      via: "JOIN users u ON u.id = vp.vendedor_id"
      pattern: "u\\.role != 'gestor'"
---

<objective>
Fix 5 audit-identified bugs in BI and dashboard-crm APIs. All bugs are SQL-level fixes with exact remedies provided — no investigation required.

Purpose: Ensure BI numbers are accurate (gestor excluded from commission chart, ainda_nao correctly scoped to assigned leads, ticket_medio averaged per-CNPJ not per-emenda-row) and dashboard-crm commission breakdown excludes Tito. Paulo's summary total already correctly uses paulo_breakdown.total_geral in the frontend.

Output: Corrected SQL in bi/route.ts and dashboard-crm/route.ts.
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
  <name>Task 1: Fix 3 BI SQL bugs (gestor filter, ainda_nao guard, ticket_medio subquery)</name>
  <files>web/src/app/api/bi/route.ts</files>
  <action>
Apply three targeted SQL fixes in web/src/app/api/bi/route.ts:

**Fix A — Query 9 (commission_by_vendedor): exclude gestor role**

Current WHERE clause:
```
WHERE vp.vendedor_id IS NOT NULL
${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
GROUP BY u.nome
HAVING COUNT(*) FILTER (WHERE vp.status_contato = 'Fechado') > 0
```

Add `AND u.role != 'gestor'` to the WHERE clause, before the GROUP BY:
```sql
WHERE vp.vendedor_id IS NOT NULL
  AND u.role != 'gestor'
  ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
GROUP BY u.nome
HAVING COUNT(*) FILTER (WHERE vp.status_contato = 'Fechado') > 0
```

**Fix B — Query 6 (kpi Leads sem contato): add vendedor_id IS NOT NULL guard to ainda_nao_count**

Current:
```sql
COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' THEN vp.cnpj END)::int as ainda_nao_count
```

Replace with:
```sql
COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' AND vp.vendedor_id IS NOT NULL THEN vp.cnpj END)::int as ainda_nao_count
```

**Fix C — Query 5 (ticket_medio): average per-CNPJ first, then average across CNPJs**

Current query (inside Promise.all at position 5):
```sql
SELECT
  COALESCE(AVG(vp.valor_venda::numeric) FILTER (
    WHERE vp.status_contato = 'Fechado' AND vp.valor_venda > 0
  ), 0) as ticket_medio,
  COUNT(DISTINCT vp.cnpj) FILTER (
    WHERE vp.status_contato = 'Fechado' AND vp.valor_venda > 0
  )::int as ticket_count
FROM vendedor_projetos vp
WHERE vp.vendedor_id IS NOT NULL
${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
```

Replace with a subquery that first averages per CNPJ then averages across CNPJs:
```sql
SELECT
  COALESCE(AVG(cnpj_avg), 0) as ticket_medio,
  COUNT(*)::int as ticket_count
FROM (
  SELECT vp.cnpj, AVG(vp.valor_venda::numeric) as cnpj_avg
  FROM vendedor_projetos vp
  WHERE vp.vendedor_id IS NOT NULL
    AND vp.status_contato = 'Fechado'
    AND vp.valor_venda > 0
    ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
  GROUP BY vp.cnpj
) t
```

Note: the isVendedor template literal must be interpolated correctly inside the subquery WHERE. This query still uses `vendedorParams` as its parameter array — no change needed to the params.
  </action>
  <verify>
    <automated>curl -s http://localhost:3000/api/bi | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('ainda_nao_count:', d.kpis.ainda_nao_count); console.log('ticket_medio:', d.kpis.ticket_medio); console.log('commission_by_vendedor names:', d.commission_by_vendedor.map(r=>r.vendedor_nome).join(', '))"</automated>
    <manual>In /bi page: commission bar chart should not show Tito. ainda_nao count should only reflect assigned leads. ticket_medio should differ from previous value if CNPJs have multiple emendas.</manual>
  </verify>
  <done>Query 9 excludes gestor-role users from the commission chart. Query 6 ainda_nao_count has vendedor_id IS NOT NULL guard. Query 5 computes ticket_medio as AVG of per-CNPJ averages.</done>
</task>

<task type="auto">
  <name>Task 2: Fix dashboard-crm commission_breakdown to exclude gestor role + verify Paulo summary total</name>
  <files>web/src/app/api/dashboard-crm/route.ts</files>
  <action>
**Fix dashboard-crm query 5 (commission_breakdown):**

Current query 5 (starting at the comment `// 5. Commission breakdown — só Fechados ganham comissão`):
```sql
SELECT
  'Fechado' as status_contato,
  COUNT(*)::int as count,
  SUM(vp.comissao_valor)::numeric as total_comissao,
  COALESCE(SUM(vp.valor_venda), 0)::numeric as total_venda,
  SUM(CASE WHEN vp.comissao_locked = true THEN 1 ELSE 0 END)::int as locked_count
FROM vendedor_projetos vp
WHERE vp.vendedor_id IS NOT NULL
  AND vp.comissao_valor IS NOT NULL
  AND vp.comissao_valor > 0
  AND vp.status_contato = 'Fechado'
  ${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
```

Add a JOIN to users and a role exclusion condition. The query already has no join on users, so add one:
```sql
SELECT
  'Fechado' as status_contato,
  COUNT(*)::int as count,
  SUM(CASE WHEN u.role != 'gestor' THEN vp.comissao_valor ELSE 0 END)::numeric as total_comissao,
  COALESCE(SUM(vp.valor_venda), 0)::numeric as total_venda,
  SUM(CASE WHEN vp.comissao_locked = true THEN 1 ELSE 0 END)::int as locked_count
FROM vendedor_projetos vp
JOIN users u ON u.id = vp.vendedor_id
WHERE vp.vendedor_id IS NOT NULL
  AND vp.comissao_valor IS NOT NULL
  AND vp.comissao_valor > 0
  AND vp.status_contato = 'Fechado'
  ${isFiltered ? ' AND (vp.vendedor_id = $1 OR vp.closer_id = $1)' : ''}
```

This uses a CASE expression so the row count (COUNT(*)) is unchanged but the comissao sum zeroes out gestor rows, consistent with the approach already used in query 2 of the same file (see the `comissao_total` CASE WHEN u.role != 'gestor' pattern on line ~55).

**Verify Paulo summary total (Bug 5 — no code change needed):**

Read comissoes/page.tsx lines 327-336. The coordenador view already shows `paulo_breakdown.total_geral` as "Minha Comissao Total". This is correct and requires no change. Confirm by grep — if line 333 shows `paulo_breakdown.total_geral`, Bug 5 is already resolved.

Run: `grep -n "paulo_breakdown.total_geral\|Minha Comissao Total" /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/comissoes/page.tsx`

If both appear together in the coordenador card block, no further change is needed. Document this in the summary.
  </action>
  <verify>
    <automated>curl -s http://localhost:3000/api/dashboard-crm | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const cr=d.commission_rows||[d.commission]; console.log('commission data:', JSON.stringify(d.commission_breakdown||d.commissionRows||'check field name',null,2))"</automated>
    <manual>In /dashboard-crm gestor view: commission totals should exclude Tito's comissao_valor entries. In /comissoes as Paulo (coordenador): "Minha Comissao Total" card should show the correct total including 1% coordenador commission.</manual>
  </verify>
  <done>dashboard-crm commission_breakdown query uses CASE WHEN u.role != 'gestor' so Tito's commission rows are zeroed. Paulo's /comissoes page already uses paulo_breakdown.total_geral confirmed by code inspection.</done>
</task>

</tasks>

<verification>
- GET /api/bi returns commission_by_vendedor array with no entry named "Tito" (or the gestor user's name)
- GET /api/bi returns ainda_nao_count that only reflects CNPJs with vendedor_id assigned
- GET /api/bi returns ticket_medio computed as AVG of per-CNPJ averages (verifiable by comparing to old value when CNPJs have multiple emenda rows)
- GET /api/dashboard-crm commission_breakdown total_comissao does not include gestor-role user commission values
- /comissoes page for coordenador role shows "Minha Comissao Total" using paulo_breakdown.total_geral (already confirmed in code)
</verification>

<success_criteria>
All 5 audit bugs addressed: 3 SQL fixes in bi/route.ts, 1 SQL fix in dashboard-crm/route.ts, 1 confirmed-already-resolved for Paulo summary total. No TypeScript errors introduced. Existing functionality unaffected.
</success_criteria>

<output>
After completion, create `.planning/quick/55-fix-5-audit-bugs-bi-chart-gestor-filter-/55-SUMMARY.md` with what was changed, what was already correct (Bug 5), and any edge cases noted.
</output>
