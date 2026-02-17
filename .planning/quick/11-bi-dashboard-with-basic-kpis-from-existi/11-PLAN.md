---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/bi/route.ts
  - web/src/app/bi/page.tsx
  - web/src/components/Sidebar.tsx
autonomous: true
requirements: [BI-01]

must_haves:
  truths:
    - "User can navigate to /bi from the sidebar"
    - "Gestor sees KPIs computed across all leads and vendedores"
    - "Vendedor sees KPIs scoped to their own assigned leads only"
    - "Four KPI cards display conversion rate, avg days to close, total pipeline value, and commission earned"
    - "Four charts render: pipeline funnel, commission by vendedor, leads by UF, and activity trend over time"
    - "Page loads without errors and charts render with real data from the database"
  artifacts:
    - path: "web/src/app/api/bi/route.ts"
      provides: "All BI metrics in a single API call"
      exports: ["GET"]
    - path: "web/src/app/bi/page.tsx"
      provides: "BI dashboard page with KPI cards and Recharts visualizations"
      min_lines: 150
    - path: "web/src/components/Sidebar.tsx"
      provides: "Navigation link to /bi page"
      contains: "/bi"
  key_links:
    - from: "web/src/app/bi/page.tsx"
      to: "/api/bi"
      via: "fetch in useEffect"
      pattern: "fetch.*api/bi"
    - from: "web/src/app/api/bi/route.ts"
      to: "vendedor_projetos, contact_notes, users"
      via: "SQL queries with role-based filtering"
      pattern: "getApiSession|vendedor_projetos"
    - from: "web/src/components/Sidebar.tsx"
      to: "/bi"
      via: "nav link"
      pattern: "href.*bi"
---

<objective>
Create a dedicated BI dashboard page at /bi with KPI summary cards and interactive Recharts visualizations, powered by a single /api/bi endpoint that computes all metrics from existing CRM data with role-based access control.

Purpose: Give gestors an analytical view of the sales operation (conversion rates, team performance, regional distribution, activity trends) and give vendedores insight into their own performance metrics. This complements the operational dashboard (/) which focuses on day-to-day pipeline management.

Output: New /bi page with 4 KPI cards + 4 charts, new /api/bi API route, sidebar navigation link.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@web/src/app/api/dashboard-crm/route.ts
@web/src/app/api/comissoes/route.ts
@web/src/app/api/dashboard-enhanced/route.ts
@web/src/app/page.tsx
@web/src/components/DashboardCharts.tsx
@web/src/components/KPICard.tsx
@web/src/components/Sidebar.tsx
@web/src/lib/db.ts
@web/src/lib/dal.ts
@web/src/lib/format.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/bi endpoint with all BI metrics</name>
  <files>web/src/app/api/bi/route.ts</files>
  <action>
Create a GET endpoint at `web/src/app/api/bi/route.ts` that computes all BI metrics in a single request. Follow the exact same patterns as `/api/dashboard-crm/route.ts`:

- Import `{ NextResponse }` from `next/server`, `{ query }` from `@/lib/db`, `{ getApiSession }` from `@/lib/dal`
- Set `export const dynamic = 'force-dynamic'`
- Check session, return 401 if unauthorized
- Apply role-based filtering: vendedor/gestor_vendedor sees only their leads (`WHERE vendedor_id = $1`), gestor/visualizador sees all
- Run all queries in parallel via `Promise.all` to avoid sequential connection queuing (CRITICAL: same pattern as dashboard-crm)

Queries to compute (all against `vendedor_projetos` table with vendedor filter):

1. **KPI: Conversion Rate** — `COUNT(*) FILTER (WHERE status_contato = 'Fechado')` / `COUNT(*) FILTER (WHERE vendedor_id IS NOT NULL)` as percentage. Return both numerator and denominator.

2. **KPI: Avg Days to Close** — For leads with `status_contato = 'Fechado'`, compute average of `EXTRACT(DAY FROM (vp.updated_at - vp.created_at))`. Return as integer days. If no Fechado leads, return null.

3. **KPI: Total Pipeline Value** — `SUM(valor_emenda::numeric)` for all non-Fechado assigned leads (these are "in pipeline"). Also include `SUM(valor_venda::numeric) FILTER (WHERE status_contato = 'Fechado')` as closed value.

4. **KPI: Commission Earned** — `SUM(comissao_valor::numeric) FILTER (WHERE status_contato = 'Fechado')` and `SUM(COALESCE(comissao_bonus, 0)::numeric) FILTER (WHERE status_contato = 'Fechado')`.

5. **Chart: Pipeline Funnel** — COUNT per status_contato ('Nao Contatado', 'Retorno', 'Proposta', 'Fechado') for assigned leads. Return as array of `{ status, count }`. Treat NULL/Novo/Contactado as 'Nao Contatado' (same logic as dashboard-crm: `COALESCE(status_contato, 'Nao Contatado') IN ('Nao Contatado', 'Novo', 'Contactado')`).

6. **Chart: Commission by Vendedor** — Per vendedor: `vendedor_nome`, `total_comissao` (SUM of comissao_valor WHERE Fechado), `total_bonus` (SUM of comissao_bonus WHERE Fechado). Only include vendedores with at least one Fechado lead. Order by total_comissao DESC. For vendedor role, this still returns just their row.

7. **Chart: Leads by UF** — `GROUP BY uf`, COUNT(*) and SUM(valor_emenda::numeric). Only include rows where `uf IS NOT NULL AND uf != ''`. Order by count DESC. Limit to top 15.

8. **Chart: Activity Trend** — Monthly aggregation from `contact_notes` table: `DATE_TRUNC('month', cn.created_at)` as month, COUNT(*) as total_notes, COUNT(DISTINCT cn.lead_cnpj) as unique_leads. Join with vendedor filter if vendedor role: `JOIN vendedor_projetos vp ON vp.cnpj = cn.lead_cnpj WHERE vp.vendedor_id = $1`. Order by month ASC. Limit to last 6 months (`WHERE cn.created_at >= NOW() - INTERVAL '6 months'`).

Return JSON structure:
```json
{
  "role": "gestor",
  "kpis": {
    "conversion_rate": 12.5,
    "fechado_count": 10,
    "assigned_count": 80,
    "avg_days_to_close": 14,
    "pipeline_value": 50000000,
    "closed_value": 8000000,
    "commission_earned": 120000,
    "commission_bonus": 5000
  },
  "pipeline_funnel": [
    { "status": "Nao Contatado", "count": 45 },
    { "status": "Retorno", "count": 20 },
    { "status": "Proposta", "count": 5 },
    { "status": "Fechado", "count": 10 }
  ],
  "commission_by_vendedor": [
    { "vendedor_nome": "Paulo", "total_comissao": 80000, "total_bonus": 3000 }
  ],
  "leads_by_uf": [
    { "uf": "SP", "count": 30, "valor_emenda": 20000000 }
  ],
  "activity_trend": [
    { "month": "2026-01-01", "total_notes": 45, "unique_leads": 20 }
  ]
}
```

Use `COALESCE` and `::numeric` casts consistently. Convert all numbers with `Number()` before returning (same as dashboard-crm). Wrap in try/catch, log errors with `console.error('BI query error:', error)`, return 500 on failure.
  </action>
  <verify>
Run `npx tsc --noEmit web/src/app/api/bi/route.ts 2>&1 | head -20` to verify no TypeScript errors. Then test locally with `curl http://localhost:3000/api/bi` (requires running dev server with auth session).
  </verify>
  <done>
API route at /api/bi returns all 8 metrics (4 KPIs + 4 chart datasets) in a single JSON response. Role filtering works: vendedor sees own data, gestor sees all. All queries run in parallel.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /bi page with KPI cards and Recharts visualizations</name>
  <files>web/src/app/bi/page.tsx</files>
  <action>
Create `web/src/app/bi/page.tsx` as a `'use client'` component. Follow the exact same patterns as `web/src/app/page.tsx` (the main dashboard):

**Data Fetching:**
- `useState` for data, loading, error states
- `useEffect` to `fetch('/api/bi')` on mount
- Loading skeleton with same structure as page.tsx (animated pulse cards)
- Error state: "Erro ao carregar BI dashboard"

**Page Header:**
- Title: "BI Analytics" for gestor, "Meu Desempenho" for vendedor/gestor_vendedor
- Subtitle: "Indicadores de performance e tendencias da operacao de vendas"
- Use same CSS classes as page.tsx: `font-heading text-2xl font-bold text-gray-900`

**Section 1 — KPI Cards (grid of 4):**
Use `grid grid-cols-2 md:grid-cols-4 gap-4`. Each card in white bg with same styling as page.tsx cards:

1. **Taxa de Conversao** — Display `kpis.conversion_rate` as percentage (e.g., "12.5%"). Subtitle: "{fechado_count} de {assigned_count} leads". Color: green-600 if > 10%, amber-600 if 5-10%, red-600 if < 5%.

2. **Dias p/ Fechar (media)** — Display `kpis.avg_days_to_close` as integer days (e.g., "14 dias"). Show "-" if null. Color: green-600 if < 15, amber-600 if 15-30, red-600 if > 30.

3. **Valor Pipeline** — Display `formatCompactCurrency(kpis.pipeline_value)`. Subtitle: `formatCurrency(kpis.pipeline_value)` full value. Use text-[#0072F7] (brand blue).

4. **Comissao Confirmada** — Display `formatCompactCurrency(kpis.commission_earned)`. Subtitle shows bonus if > 0: `"+ ${formatCurrency(kpis.commission_bonus)} bonus"`. Color: text-green-600.

**Section 2 — Charts (2x2 grid on desktop):**
Use `grid grid-cols-1 md:grid-cols-2 gap-4`. Each chart in a white card with title and border (same pattern as DashboardCharts.tsx).

Import from recharts: `{ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList, PieChart, Pie, AreaChart, Area }`

Note: Recharts FunnelChart may not be available in v2.12. Instead use a horizontal BarChart for the funnel visualization.

**Chart 1: Pipeline Funnel** — Horizontal BarChart (layout="vertical") showing status counts. Use same status colors as page.tsx: Nao Contatado = #ef4444 (red), Retorno = #f59e0b (amber), Proposta = #3b82f6 (blue), Fechado = #22c55e (green). Data from `pipeline_funnel`. Height 200px.

**Chart 2: Comissao por Vendedor** — Vertical BarChart showing commission per vendedor. X axis = vendedor_nome, Y axis = total_comissao formatted as compact currency. Use brand blue #0072F7 for bars. If vendedor role, show single bar. Data from `commission_by_vendedor`. Height 250px. Add a second stacked bar for bonus in lighter blue #60a5fa.

**Chart 3: Leads por UF** — Horizontal BarChart (layout="vertical") showing top UFs by lead count. Use gradient from #0072F7 to #60a5fa. Data from `leads_by_uf`, take top 10. Height 300px. Show count on bars.

**Chart 4: Tendencia de Atividade** — AreaChart showing monthly activity trend. X axis = month (formatted as "Jan", "Fev", etc. using pt-BR month names), Y axis = total_notes. Use green gradient fill (same pattern as ExecutionChart in DashboardCharts.tsx with linearGradient). Data from `activity_trend`. Height 200px. Add a second line for unique_leads in dotted blue.

**Tooltip styling** — Use same contentStyle as DashboardCharts.tsx: `{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }`.

**Chart card wrapper** — Each chart in: `<div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4">` with `<h3 className="text-sm font-semibold text-gray-900 mb-2">Title</h3>`.

Import `formatCompactCurrency`, `formatCurrency` from `@/lib/format`.

**Empty states:** If no data for a chart section (e.g., no commission_by_vendedor), show a centered gray text "Sem dados" inside the chart card instead of an empty chart.
  </action>
  <verify>
Run `npx tsc --noEmit web/src/app/bi/page.tsx 2>&1 | head -20` to verify no TypeScript errors. Start dev server and navigate to /bi — page should render with KPI cards and charts populated from real data.
  </verify>
  <done>
BI page at /bi renders 4 KPI cards and 4 charts using Recharts. Page is role-aware (different title for vendedor vs gestor). All visualizations render correctly with data from /api/bi. Loading and error states handled.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add BI link to Sidebar navigation</name>
  <files>web/src/components/Sidebar.tsx</files>
  <action>
Update `web/src/components/Sidebar.tsx`:

1. Add a 'bi' case to the `NavIcon` switch statement with an analytics/chart icon:
```tsx
case 'bi':
  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg>
```
(This is the Heroicons "presentation-chart-line" icon matching the existing icon style.)

2. Add `{ href: '/bi', label: 'BI Analytics', icon: 'bi' }` to the `BASE_NAV_ITEMS` array, after the 'Comissoes' entry. This ensures ALL roles (gestor, vendedor, gestor_vendedor, visualizador) can see the BI link.

The final BASE_NAV_ITEMS should be:
```tsx
const BASE_NAV_ITEMS = [
  { href: '/', label: 'Pipeline', icon: 'pipeline' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
  { href: '/comissoes', label: 'Comissoes', icon: 'comissoes' },
  { href: '/bi', label: 'BI Analytics', icon: 'bi' },
]
```
  </action>
  <verify>
Run `npx tsc --noEmit web/src/components/Sidebar.tsx 2>&1 | head -20` to verify no TypeScript errors. Visually confirm "BI Analytics" link appears in sidebar for all roles and navigates to /bi.
  </verify>
  <done>
Sidebar shows "BI Analytics" navigation link with chart icon for all user roles. Clicking navigates to /bi. Active state highlights correctly when on /bi page.
  </done>
</task>

</tasks>

<verification>
1. `cd web && npx tsc --noEmit` — no TypeScript errors across the project
2. Navigate to /bi as gestor — all 4 KPI cards show real computed values, all 4 charts render with data
3. Navigate to /bi as vendedor — KPIs and charts scoped to vendedor's own leads only, title shows "Meu Desempenho"
4. Sidebar shows "BI Analytics" link for all roles with correct active state highlighting
5. Loading state shows skeleton cards while data loads
6. If no data for a chart section, "Sem dados" placeholder shown instead of broken chart
</verification>

<success_criteria>
- /api/bi returns all metrics in a single JSON payload with role-based filtering
- /bi page renders 4 KPI cards (conversion rate, avg days to close, pipeline value, commission earned)
- /bi page renders 4 charts (pipeline funnel, commission by vendedor, leads by UF, activity trend)
- Recharts visualizations use consistent styling with existing DashboardCharts.tsx
- All roles can access /bi from sidebar navigation
- Role filtering works: vendedor sees own data, gestor sees all
</success_criteria>

<output>
After completion, create `.planning/quick/11-bi-dashboard-with-basic-kpis-from-existi/11-SUMMARY.md`
</output>
