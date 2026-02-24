---
phase: quick-54
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/bi/route.ts
  - web/src/app/bi/page.tsx
autonomous: true
must_haves:
  truths:
    - "BI funnel shows all 6 statuses including Ainda Nao and Aguardando Closer"
    - "avg_days_to_close uses fechado_em column (actual close date) not created_at"
    - "Ticket medio KPI card visible on BI page"
    - "Leads sem contato KPI visible on BI page"
    - "Taxa de telefones validos card visible on BI page"
    - "Commission KPI in BI correctly zeros gestor-role (Tito) commission"
  artifacts:
    - path: "web/src/app/api/bi/route.ts"
      provides: "corrected BI data API with new KPIs"
    - path: "web/src/app/bi/page.tsx"
      provides: "BI UI with 7 KPI cards and corrected funnel"
  key_links:
    - from: "web/src/app/bi/page.tsx"
      to: "/api/bi"
      via: "fetch in useEffect"
      pattern: "fetch.*api/bi"
---

<objective>
Audit and fix BI, comissoes, and pipeline number correctness issues, then add 3 missing KPIs to the BI dashboard.

Purpose: The BI page has several calculation bugs and is missing key metrics the team needs to evaluate performance.
Output: Corrected API with fixed calculations + expanded BI page with 7 KPI cards.
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
  <name>Task 1: Audit and fix /api/bi calculation bugs</name>
  <files>web/src/app/api/bi/route.ts</files>
  <action>
Fix 4 bugs and add 3 new KPI queries to the BI API:

**Bug 1 — avg_days_to_close uses created_at (import date) not actual close date.**
Current: `AVG(EXTRACT(DAY FROM (vp.updated_at - vp.created_at)))` — measures days from import to last update, not from assignment to close.
Fix: Check if `fechado_em` column exists in vendedor_projetos (it likely does based on schema). If yes, use:
`AVG(EXTRACT(DAY FROM (vp.fechado_em - vp.created_at)))` where `vp.fechado_em IS NOT NULL`.
If `fechado_em` does not exist, use `updated_at` but add `AND vp.status_contato = 'Fechado'` to limit it to actual closed rows. This is already the case, but add a comment explaining the limitation.

To check: Run `SELECT column_name FROM information_schema.columns WHERE table_name = 'vendedor_projetos' AND column_name = 'fechado_em'` at the start of the handler or check schema. If `fechado_em` exists, use it. If not, keep updated_at but document.

**Bug 2 — Pipeline funnel misses Ainda Nao and Aguardando Closer statuses.**
Current CASE collapses only 4 groups; `Ainda Nao` and `Aguardando Closer` fall to ELSE with gray color in UI.
Fix: Update the funnel subquery CASE to:
```sql
CASE
  WHEN COALESCE(vp.status_contato, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado', 'Novo', 'Contactado', 'Não Contatado') THEN 'Não Contatado'
  WHEN vp.status_contato = 'Ainda Não' THEN 'Ainda Não'
  WHEN vp.status_contato = 'Retorno' THEN 'Retorno'
  WHEN vp.status_contato = 'Proposta' THEN 'Proposta'
  WHEN vp.status_contato = 'Aguardando Closer' THEN 'Aguardando Closer'
  WHEN vp.status_contato = 'Fechado' THEN 'Fechado'
  ELSE vp.status_contato
END
```
Also update ORDER BY CASE to include all 6 statuses in correct funnel order:
1=Não Contatado, 2=Ainda Não, 3=Retorno, 4=Proposta, 5=Aguardando Closer, 6=Fechado.

**Bug 3 — Commission KPI includes gestor-role (Tito) commission.**
Current query: `SUM(vp.comissao_valor::numeric) FILTER (WHERE vp.status_contato = 'Fechado')` — does not exclude gestor-role leads.
Fix: Add join to users and filter out gestor role:
```sql
SELECT
  COALESCE(SUM(vp.comissao_valor::numeric) FILTER (
    WHERE vp.status_contato = 'Fechado' AND u.role != 'gestor'
  ), 0) as commission_earned,
  COALESCE(SUM(COALESCE(vp.comissao_bonus, 0)::numeric) FILTER (
    WHERE vp.status_contato = 'Fechado' AND u.role != 'gestor'
  ), 0) as commission_bonus
FROM vendedor_projetos vp
JOIN users u ON u.id = vp.vendedor_id
WHERE vp.vendedor_id IS NOT NULL
  ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
```

**Bug 4 — closed_value computed but never returned in kpis response.**
Fix: Add `closed_value` to the kpis object in the return statement so it can be displayed in UI.

**New KPI 1 — Ticket Medio (avg valor_venda for Fechado leads).**
Add to the parallel queries:
```sql
SELECT
  COALESCE(AVG(vp.valor_venda::numeric) FILTER (WHERE vp.status_contato = 'Fechado' AND vp.valor_venda > 0), 0) as ticket_medio,
  COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.status_contato = 'Fechado' AND vp.valor_venda > 0)::int as ticket_count
FROM vendedor_projetos vp
WHERE vp.vendedor_id IS NOT NULL
  ${isVendedor ? 'AND vp.vendedor_id = $1' : ''}
```

**New KPI 2 — Leads sem contato (never contacted, not Fechado).**
Add to the parallel queries:
```sql
SELECT
  COUNT(DISTINCT vp.cnpj) FILTER (
    WHERE COALESCE(vp.status_contato, 'Não Contatado') IN ('Não Contatado', 'Nao Contatado')
      AND vp.vendedor_id IS NOT NULL
  )::int as nao_contatado_count,
  COUNT(DISTINCT CASE WHEN vp.status_contato = 'Ainda Não' THEN vp.cnpj END)::int as ainda_nao_count
FROM vendedor_projetos vp
${vendedorFilter}
```
(For vendedor, use vendedorFilter. For gestor, no filter.)

**New KPI 3 — Taxa de telefones validos.**
Add to parallel queries:
```sql
SELECT
  COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'valido')::int as telefones_validos,
  COUNT(DISTINCT lc.lead_cnpj) FILTER (WHERE lc.telefone_status = 'invalido')::int as telefones_invalidos,
  COUNT(DISTINCT lc.lead_cnpj)::int as total_com_contato
FROM lead_contacts lc
${isVendedor ? 'WHERE EXISTS (SELECT 1 FROM vendedor_projetos vp WHERE vp.cnpj = lc.lead_cnpj AND vp.vendedor_id = $1)' : ''}
```

Update BIKpis interface and response to include:
- `ticket_medio: number`
- `nao_contatado_count: number`
- `ainda_nao_count: number`
- `telefones_validos: number`
- `telefones_invalidos: number`
- `closed_value: number` (already computed, just add to response)
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Visit /api/bi in browser logged in as gestor, verify JSON includes ticket_medio, nao_contatado_count, telefones_validos, and that pipeline_funnel array contains entries for Ainda Nao and Aguardando Closer when leads with those statuses exist.</manual>
  </verify>
  <done>TypeScript compiles cleanly. /api/bi response JSON includes all new KPI fields and pipeline_funnel has correct status groups including Ainda Nao and Aguardando Closer.</done>
</task>

<task type="auto">
  <name>Task 2: Update BI page UI with new KPI cards and corrected funnel colors</name>
  <files>web/src/app/bi/page.tsx</files>
  <action>
Update the BI frontend to display new KPIs and fix funnel color mapping.

**1. Update BIKpis interface** to add new fields:
```typescript
interface BIKpis {
  conversion_rate: number
  fechado_count: number
  assigned_count: number
  avg_days_to_close: number | null
  pipeline_value: number
  closed_value: number         // add
  commission_earned: number
  commission_bonus: number
  ticket_medio: number         // add
  nao_contatado_count: number  // add
  ainda_nao_count: number      // add
  telefones_validos: number    // add
  telefones_invalidos: number  // add
}
```

**2. Update FUNNEL_COLORS** to add missing statuses:
```typescript
const FUNNEL_COLORS: Record<string, string> = {
  'Nao Contatado': '#ef4444',
  'Não Contatado': '#ef4444',
  'Ainda Não': '#f43f5e',       // rose-500 (distinct from red)
  'Retorno': '#f59e0b',
  'Proposta': '#3b82f6',
  'Aguardando Closer': '#8b5cf6', // violet-500
  'Fechado': '#22c55e',
}
```

**3. Replace the 4-card KPI grid** (currently `grid-cols-2 md:grid-cols-4`) with a 7-card responsive grid showing all new metrics. Layout: `grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4`.

Cards in order:
1. Taxa de Conversao (existing) — percentage color logic unchanged
2. Ticket Medio (new) — `formatCompactCurrency(kpis.ticket_medio)`, gray if 0, label "media por venda fechada"
3. Dias p/ Fechar (existing, keep)
4. Nao Contatados (new) — show `kpis.nao_contatado_count`, red text if > 20, amber if > 10, green otherwise. Sub-label: "sem abordar" + if `kpis.ainda_nao_count > 0` add "(+ {N} Ainda Nao)" below.
5. Valor Pipeline (existing) — keep
6. Comissao Confirmada (existing) — keep
7. Telefones Validos (new) — show percentage: `(kpis.telefones_validos / (kpis.telefones_validos + kpis.telefones_invalidos) * 100).toFixed(0)%` or "-" if both 0. Sub-label: `{validos} validos / {invalidos} invalidos`. Color: green if >70%, amber if >40%, red otherwise.

For vendedor role (`isVendedor = true`), hide card 4 (Nao Contatados admin overview) — replace with closed_value card: "Faturamento Fechado" = `formatCompactCurrency(kpis.closed_value)`.

**4. No other changes** to charts section — funnel colors will auto-update from FUNNEL_COLORS fix.

Use `formatCompactCurrency` already imported for monetary values.
  </action>
  <verify>
    <automated>cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Visit /bi as gestor: verify 7 KPI cards render without overflow, funnel chart shows all active statuses with correct colors (Ainda Nao in rose, Aguardando Closer in violet). Visit /bi as vendedor: verify 7 cards still render (Faturamento Fechado replaces Nao Contatados).</manual>
  </verify>
  <done>TypeScript clean. BI page shows 7 KPI cards. Funnel includes Ainda Nao (rose) and Aguardando Closer (violet) bars when data exists. No layout breakage on mobile (2 cols) or desktop (7 cols).</done>
</task>

</tasks>

<verification>
1. `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit` — zero errors
2. `curl http://localhost:3000/api/bi` (with valid session cookie) returns JSON with: `ticket_medio`, `nao_contatado_count`, `ainda_nao_count`, `telefones_validos`, `telefones_invalidos`, `closed_value` all present
3. `pipeline_funnel` array entries include `Ainda Nao` and `Aguardando Closer` when leads with those statuses exist
4. `avg_days_to_close` uses `fechado_em` if column exists, or is clearly documented as using `updated_at` with its limitation
5. Commission KPI does not include leads where `vendedor.role = 'gestor'`
</verification>

<success_criteria>
- 7 KPI cards visible on /bi with no layout overflow
- Funnel chart has correct colors for all 6 pipeline statuses
- avg_days_to_close reflects actual close date (not import date) where possible
- Ticket medio displays correctly (R$ 0 if no Fechado leads)
- Nao Contatados card shows current count for gestor, Faturamento Fechado for vendedor
- Telefones Validos card shows percentage with color coding
- TypeScript compiles with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/54-audit-bi-numbers-improve-bi-with-more-kp/54-SUMMARY.md` with what was changed, what bugs were found and fixed, and what new KPIs were added.
</output>
