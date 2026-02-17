---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/api/bi/route.ts
  - web/src/app/api/vendedores/route.ts
  - web/src/app/api/comissoes/route.ts
  - web/src/app/distribuir/page.tsx
autonomous: true
requirements: [FIX-LEAD-COUNT]

must_haves:
  truths:
    - "Total leads count across all dashboards shows COUNT(DISTINCT cnpj), not row count"
    - "Per-vendedor lead counts reflect unique CNPJs, not emenda rows"
    - "Status breakdown counts (Nao Contatado, Retorno, Proposta, Fechado) reflect unique CNPJs per status"
    - "BI conversion rate and pipeline funnel use distinct CNPJ counts"
    - "Vendedores API returns distinct CNPJ count per vendedor"
    - "Distribuir page shows unique CNPJ counts in tabs and bottom bar"
  artifacts:
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "Corrected global and per-vendedor lead counts using COUNT(DISTINCT cnpj)"
      contains: "COUNT(DISTINCT"
    - path: "web/src/app/api/bi/route.ts"
      provides: "Corrected conversion rate, funnel, and UF counts using COUNT(DISTINCT cnpj)"
      contains: "COUNT(DISTINCT"
    - path: "web/src/app/api/vendedores/route.ts"
      provides: "Corrected lead_count per vendedor using COUNT(DISTINCT cnpj)"
      contains: "COUNT(DISTINCT vp.cnpj)"
    - path: "web/src/app/api/comissoes/route.ts"
      provides: "Corrected summary and per-vendedor lead counts"
      contains: "COUNT(DISTINCT"
    - path: "web/src/app/distribuir/page.tsx"
      provides: "Corrected tab counts and bottom bar to show unique CNPJ counts"
  key_links:
    - from: "web/src/app/api/dashboard-crm/route.ts"
      to: "web/src/app/page.tsx"
      via: "JSON response total_leads field"
      pattern: "total_leads"
    - from: "web/src/app/api/vendedores/route.ts"
      to: "web/src/app/distribuir/page.tsx"
      via: "lead_count in vendedor cards"
      pattern: "lead_count"
---

<objective>
Fix total leads count across ALL dashboards and API endpoints to use COUNT(DISTINCT cnpj) instead of COUNT(*).

Purpose: vendedor_projetos has multiple rows per CNPJ (one per emenda/parlamentar). COUNT(*) overcounts leads. The correct metric for "total leads" is COUNT(DISTINCT cnpj) since each unique CNPJ is one lead regardless of how many emendas it has.

Output: All "total leads" metrics across the app reflect unique CNPJ counts. Emenda/row counts are preserved where appropriate (e.g., emenda_count display, valor sums).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@web/src/app/api/dashboard-crm/route.ts
@web/src/app/api/bi/route.ts
@web/src/app/api/vendedores/route.ts
@web/src/app/api/comissoes/route.ts
@web/src/app/distribuir/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix SQL queries in all API endpoints to use COUNT(DISTINCT cnpj)</name>
  <files>
    web/src/app/api/dashboard-crm/route.ts
    web/src/app/api/bi/route.ts
    web/src/app/api/vendedores/route.ts
    web/src/app/api/comissoes/route.ts
  </files>
  <action>
    **File: web/src/app/api/dashboard-crm/route.ts**

    Query 1 (Global stats, ~line 22-31): Change the following:
    - `COUNT(*)::int as total_leads` -> `COUNT(DISTINCT cnpj)::int as total_leads`
    - `COUNT(CASE WHEN vendedor_id IS NOT NULL THEN 1 END)::int as total_assigned` -> `COUNT(DISTINCT CASE WHEN vendedor_id IS NOT NULL THEN cnpj END)::int as total_assigned`
    - `COUNT(CASE WHEN vendedor_id IS NULL THEN 1 END)::int as total_unassigned` -> `COUNT(DISTINCT CASE WHEN vendedor_id IS NULL THEN cnpj END)::int as total_unassigned`
    - Status counts: change each SUM(CASE WHEN status_contato = X THEN 1 ELSE 0 END) to COUNT(DISTINCT CASE WHEN ...) pattern:
      - `COUNT(DISTINCT CASE WHEN COALESCE(status_contato, 'Nao Contatado') IN ('Nao Contatado', 'Novo', 'Contactado') THEN cnpj END)::int as status_nao_contatado`
      - `COUNT(DISTINCT CASE WHEN status_contato = 'Retorno' THEN cnpj END)::int as status_retorno`
      - `COUNT(DISTINCT CASE WHEN status_contato = 'Proposta' THEN cnpj END)::int as status_proposta`
      - `COUNT(DISTINCT CASE WHEN status_contato = 'Fechado' THEN cnpj END)::int as status_fechado`
    - Keep `COALESCE(SUM(valor_emenda::numeric), 0) as total_valor_emenda` as-is (total emenda value should sum ALL rows)

    Query 2 (Per-vendedor, ~line 35-52): Change:
    - `COUNT(*)::int as total_leads` -> `COUNT(DISTINCT vp.cnpj)::int as total_leads`
    - Each status count SUM -> COUNT(DISTINCT CASE WHEN ... THEN vp.cnpj END) pattern:
      - `COUNT(DISTINCT CASE WHEN COALESCE(vp.status_contato, 'Nao Contatado') IN ('Nao Contatado', 'Novo', 'Contactado') THEN vp.cnpj END)::int as nao_contatado`
      - `COUNT(DISTINCT CASE WHEN vp.status_contato = 'Retorno' THEN vp.cnpj END)::int as retorno`
      - `COUNT(DISTINCT CASE WHEN vp.status_contato = 'Proposta' THEN vp.cnpj END)::int as proposta`
      - `COUNT(DISTINCT CASE WHEN vp.status_contato = 'Fechado' THEN vp.cnpj END)::int as fechado`
    - Keep valor_total_emenda, comissao_total SUM aggregations as-is (value sums are correct summing all rows)

    **File: web/src/app/api/bi/route.ts**

    Query 1 (KPI Conversion Rate, ~line 33-35): Change:
    - `COUNT(*) FILTER (WHERE vp.status_contato = 'Fechado')::int as fechado_count` -> `COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.status_contato = 'Fechado')::int as fechado_count`
    - `COUNT(*) FILTER (WHERE vp.vendedor_id IS NOT NULL)::int as assigned_count` -> `COUNT(DISTINCT vp.cnpj) FILTER (WHERE vp.vendedor_id IS NOT NULL)::int as assigned_count`

    Query 5 (Pipeline Funnel, ~line 79): Change:
    - `COUNT(*)::int as count` -> `COUNT(DISTINCT vp.cnpj)::int as count`

    Query 7 (Leads by UF, ~line 113): Change:
    - `COUNT(*)::int as count` -> `COUNT(DISTINCT vp.cnpj)::int as count`

    DO NOT change: Query 2 (avg days), Query 3 (pipeline value - SUM is correct), Query 4 (commission SUM), Query 6 (commission by vendedor HAVING), Query 8 (activity trend - notes count is correct).

    **File: web/src/app/api/vendedores/route.ts**

    Line 15: Change:
    - `COUNT(vp.id)::int as lead_count` -> `COUNT(DISTINCT vp.cnpj)::int as lead_count`

    **File: web/src/app/api/comissoes/route.ts**

    Summary query (~line 82): Change:
    - `COUNT(*)::int as total_leads` -> `COUNT(DISTINCT vp.cnpj)::int as total_leads`

    Per-vendedor query (~line 98): Change:
    - `COUNT(*)::int as lead_count` -> `COUNT(DISTINCT vp.cnpj)::int as lead_count`

    IMPORTANT: Do NOT change any SUM(...) aggregations for valor_emenda, valor_venda, comissao_valor, etc. Those should still sum ALL rows. Only change COUNT-based "lead" metrics.
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx next build 2>&1 | tail -30` to verify no TypeScript/build errors.
    Grep all modified files for `COUNT(*)` to confirm none remain (except in subqueries like emenda_count in leads API which is not being modified):
    `grep -n "COUNT(\*)" web/src/app/api/dashboard-crm/route.ts web/src/app/api/bi/route.ts web/src/app/api/vendedores/route.ts web/src/app/api/comissoes/route.ts`
    The only allowed COUNT(*) should be in commission_breakdown query (line ~87 of dashboard-crm) where it counts commission entries, and the HAVING clause in bi/route.ts (line ~105).
  </verify>
  <done>
    All SQL queries that report "total leads" use COUNT(DISTINCT cnpj). Per-vendedor counts, global counts, status breakdowns, funnel counts, UF counts, conversion rate numerator/denominator all reflect unique CNPJs. Value SUMs remain unchanged (they correctly sum all emenda rows).
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix frontend lead counts in distribuir page</name>
  <files>
    web/src/app/distribuir/page.tsx
  </files>
  <action>
    The distribuir page fetches raw rows from /api/leads and displays row counts in several places. Fix these to show unique CNPJ counts:

    1. Add a `uniqueCnpjCount` memo near line ~104 (after cnpjCounts memo):
       ```
       const uniqueCnpjCount = useMemo(() => {
         return new Set(activeLeads.map(l => l.cnpj)).size
       }, [activeLeads])
       ```

    2. Also add memos for unassigned and assigned unique CNPJ counts:
       ```
       const uniqueUnassignedCount = useMemo(() => new Set(leads.map(l => l.cnpj)).size, [leads])
       const uniqueAssignedCount = useMemo(() => new Set(assignedLeads.map(l => l.cnpj)).size, [assignedLeads])
       const uniqueFilteredCount = useMemo(() => new Set(sortedLeads.map(l => l.cnpj)).size, [sortedLeads])
       ```

    3. Tab badge counts (~line 321 and 335): Change:
       - `{leads.length}` -> `{uniqueUnassignedCount}` (Nao Atribuidos tab)
       - `{assignedLeads.length}` -> `{uniqueAssignedCount}` (Distribuidos tab)

    4. assignedByVendedor memo (~line 179-189): Change to count unique CNPJs per vendedor instead of rows:
       ```
       const assignedByVendedor = useMemo(() => {
         const groups: Record<string, { nome: string; cnpjs: Set<string> }> = {}
         for (const l of assignedLeads) {
           const vid = l.vendedor_id || 'unknown'
           if (!groups[vid]) {
             groups[vid] = { nome: l.vendedor_nome || 'Desconhecido', cnpjs: new Set() }
           }
           groups[vid].cnpjs.add(l.cnpj)
         }
         return Object.fromEntries(
           Object.entries(groups).map(([k, v]) => [k, { nome: v.nome, count: v.cnpjs.size }])
         )
       }, [assignedLeads])
       ```

    5. Bottom bar (~line 529-531): Change:
       - `${sortedLeads.length} leads nao atribuidos` -> `${uniqueFilteredCount} leads nao atribuidos`
       - `${sortedLeads.length} leads distribuidos` -> `${uniqueFilteredCount} leads distribuidos`

    DO NOT change: selection counts (selectedLeadIds.size) -- those correctly count selected rows for the assignment action. The extraByCnpj calculation is also correct (it's about extra rows, not leads).
  </action>
  <verify>
    Run `cd /Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web && npx tsc --noEmit 2>&1 | tail -20` to verify no TypeScript errors.
    Grep for `.length` in distribuir/page.tsx to confirm no stray row counts in display positions (some .length usage is fine for array operations, just not for displayed counts).
  </verify>
  <done>
    Distribuir page tab badges, vendedor summary cards, and bottom bar all show unique CNPJ counts. Row-level operations (selection, assignment) continue to work correctly on individual rows.
  </done>
</task>

</tasks>

<verification>
1. All API endpoints return lead counts based on COUNT(DISTINCT cnpj):
   - GET /api/dashboard-crm: global.total_leads, global.total_assigned, global.total_unassigned, global.by_status.*, vendedores[].total_leads
   - GET /api/bi: kpis.fechado_count, kpis.assigned_count, pipeline_funnel[].count, leads_by_uf[].count
   - GET /api/vendedores: [].lead_count
   - GET /api/comissoes: summary.total_leads, per_vendedor[].lead_count

2. Frontend pages that consume raw rows and display counts use Set-based CNPJ deduplication:
   - /distribuir: tab counts, vendedor summary cards, bottom bar text

3. Pages already correct (no changes needed):
   - /leads (page.tsx): Already groups by CNPJ and shows `displayLeads.length` as "CNPJs"
   - /api/dashboard (route.ts): Already uses `uniqueCnpjs.size` for total_clientes
   - /page.tsx (CRM dashboard): Consumes dashboard-crm API data (fixed in Task 1)
   - /bi (page.tsx): Consumes BI API data (fixed in Task 1)
   - /comissoes (page.tsx): Consumes comissoes API data (fixed in Task 1)

4. Value aggregations (SUM of valor_emenda, valor_venda, comissao_valor) remain unchanged -- they correctly sum across all rows.
</verification>

<success_criteria>
- No COUNT(*) remaining in lead-count contexts across dashboard-crm, bi, vendedores, comissoes API routes
- Distribuir page shows unique CNPJ counts in UI display positions
- TypeScript compilation passes with no errors
- Value SUMs (emenda, venda, comissao) are NOT affected
</success_criteria>

<output>
After completion, create `.planning/quick/15-fix-total-leads-count-total-leads-count-/15-01-SUMMARY.md`
</output>
