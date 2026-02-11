---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/page.tsx
autonomous: true

must_haves:
  truths:
    - "Gestor can see total campaign stats (total leads, assigned, unassigned, total valor_emenda)"
    - "Gestor can see status pipeline visualization showing distribution across Novo/Tentativa/Contactado/Em Negociação/Sem Interesse"
    - "Gestor can see per-vendedor breakdown with their lead counts, status distribution, and total valor_emenda"
    - "Gestor can see recent activity feed showing last 10 lead updates"
  artifacts:
    - path: "web/src/app/api/dashboard-crm/route.ts"
      provides: "CRM dashboard statistics API"
      exports: ["GET"]
      min_lines: 80
    - path: "web/src/app/page.tsx"
      provides: "Admin dashboard with campaign overview and vendedor metrics"
      min_lines: 250
  key_links:
    - from: "web/src/app/page.tsx"
      to: "/api/dashboard-crm"
      via: "fetch in useEffect"
      pattern: "fetch.*api/dashboard-crm"
    - from: "web/src/app/api/dashboard-crm/route.ts"
      to: "vendedor_projetos"
      via: "SQL query with GROUP BY and aggregations"
      pattern: "FROM vendedor_projetos.*GROUP BY"
---

<objective>
Create a gestor-focused CRM dashboard showing campaign-wide metrics, vendedor performance breakdown, and status pipeline visualization.

Purpose: Give Tito (gestor) complete visibility into the sales team's work before tomorrow's 11am meeting.
Output: Admin dashboard at / with global stats, per-vendedor cards, status pipeline, and recent activity feed.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/.planning/quick/4-distribuicao-leads-crm-vendedor/4-SUMMARY.md
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/.planning/quick/5-monitoramento-financeiro/5-SUMMARY.md
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/vendedores/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/leads/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/monitoramento/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/dashboard-crm endpoint with aggregated CRM statistics</name>
  <files>web/src/app/api/dashboard-crm/route.ts</files>
  <action>
Create GET /api/dashboard-crm endpoint returning complete CRM statistics for gestor dashboard.

**Response structure:**
```typescript
{
  global: {
    total_leads: number,          // COUNT(*) from vendedor_projetos
    total_assigned: number,       // COUNT WHERE vendedor_id IS NOT NULL
    total_unassigned: number,     // COUNT WHERE vendedor_id IS NULL
    total_valor_emenda: number,   // SUM(valor_emenda)
    by_status: {                  // GROUP BY status_contato with counts
      'Novo': number,
      'Tentativa de Contato': number,
      'Contactado': number,
      'Em Negociação': number,
      'Sem Interesse': number
    }
  },
  vendedores: [                   // GROUP BY vendedor_id
    {
      vendedor_id: string,
      vendedor_nome: string,
      total_leads: number,        // COUNT for this vendedor
      novo: number,               // COUNT WHERE status_contato = 'Novo'
      tentativa: number,          // COUNT WHERE status_contato = 'Tentativa de Contato'
      contactado: number,         // COUNT WHERE status_contato = 'Contactado'
      negociacao: number,         // COUNT WHERE status_contato = 'Em Negociação'
      sem_interesse: number,      // COUNT WHERE status_contato = 'Sem Interesse'
      valor_total_emenda: number, // SUM(valor_emenda)
      last_activity: timestamp    // MAX(updated_at)
    }
  ],
  recent_activity: [              // ORDER BY updated_at DESC LIMIT 10
    {
      cnpj: string,
      nome: string,
      vendedor_nome: string,
      status_contato: string,
      updated_at: timestamp
    }
  ]
}
```

**Implementation:**
- Use `getApiSession()` from @/lib/dal for auth (reject if not authenticated)
- Query vendedor_projetos with JOINs to users table for vendedor names
- Use CASE WHEN in SELECT for status counts (e.g., `SUM(CASE WHEN status_contato = 'Novo' THEN 1 ELSE 0 END) as novo`)
- Three separate queries for clarity: (1) global stats with GROUP BY status_contato, (2) per-vendedor aggregations with GROUP BY vendedor_id, (3) recent activity with LEFT JOIN users
- Format: `export const dynamic = 'force-dynamic'` at top
- Error handling: return 401 for no session, 500 with console.error on DB failure
  </action>
  <verify>
```bash
# Test endpoint returns expected structure
curl http://localhost:3000/api/dashboard-crm | jq '.global.total_leads, .vendedores[0].vendedor_nome, .recent_activity[0].cnpj'
```

Should return numbers and strings, not errors.
  </verify>
  <done>
- GET /api/dashboard-crm returns JSON with global, vendedores, and recent_activity objects
- Global stats include total counts and by_status breakdown
- Vendedores array includes per-status counts and valor_total_emenda
- Recent activity shows last 10 updates with vendedor names
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace home page with CRM admin dashboard</name>
  <files>web/src/app/page.tsx</files>
  <action>
Completely replace the current home page with a gestor-focused CRM dashboard showing campaign overview and vendedor performance.

**Layout structure (top to bottom):**

1. **Page header**
   - Title: "Dashboard CRM — Campanha Emendas 2026"
   - Subtitle: "Visão administrativa do trabalho da equipe de vendas"

2. **Global stats cards row (5 cards, grid-cols-5)**
   - Total Leads (number)
   - Atribuídos (number with % of total)
   - Não Atribuídos (number with % of total)
   - Valor em Emendas (formatCurrency)
   - Pipeline (not a stat, just label for next section)

3. **Status pipeline horizontal bar**
   - Stacked bar chart showing % distribution across 5 statuses
   - Color coding: Novo (red), Tentativa (yellow), Contactado (blue), Negociação (green), Sem Interesse (gray)
   - Each segment shows status name + count
   - Full width, 60px height, rounded glassmorphic container

4. **Per-vendedor cards (grid-cols-1 md:grid-cols-2 xl:grid-cols-3)**
   - Card per vendedor showing:
     - Vendedor name (text-xl font-bold)
     - Total leads atribuídos (large number)
     - Mini status breakdown: 5 colored badges with icon + count (🔴 Novo: 12, 🟡 Tentativa: 5, etc.)
     - Valor total emendas (formatCompactCurrency in cyan)
     - Last activity: "Última atividade há {timeAgo}" (use updated_at, format as "há 2h", "há 3 dias", etc.)
   - Glassmorphic card with hover:scale-[1.02] transition

5. **Recent activity feed**
   - Title: "Atividade Recente"
   - List of last 10 updates: "{vendedor_nome} atualizou {nome} ({formatCNPJ(cnpj)}) para {status_contato} — há {timeAgo}"
   - Striped rows, text-sm, status badge inline

**Data fetching:**
- useState for dashboardData with GlobalStats, VendedorStats[], RecentActivity[] types
- useEffect to fetch /api/dashboard-crm on mount
- Loading state with skeleton cards (same structure but animated pulse)

**Styling:**
- Sigma dark theme: bg-gray-950, glassmorphic cards (bg-gray-900/40 backdrop-blur-sm border border-gray-800)
- Neon cyan accents (#06b6d4) for valores and highlights
- Status colors matching client legend: Novo red-500, Tentativa amber-500, Contactado blue-500, Negociação emerald-500, Sem Interesse gray-500
- Use formatCurrency and formatCompactCurrency from @/lib/format
- Use formatCNPJ from @/lib/format

**Time ago helper:**
```typescript
function timeAgo(date: string): string {
  const now = new Date().getTime()
  const then = new Date(date).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `há ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}
```

**Important:**
- This replaces web/src/app/page.tsx entirely (not /dashboard-crm route)
- Client component ('use client' at top)
- No role check needed (already protected by middleware for /api/dashboard-crm)
- Responsive: single column on mobile, multi-column on desktop
  </action>
  <verify>
```bash
# Visit home page
open http://localhost:3000

# Should show:
# - 5 stat cards at top
# - Horizontal status pipeline bar with colors
# - Grid of vendedor cards with status breakdowns
# - Recent activity feed at bottom
```

Visual verification: dashboard loads, shows real data, glassmorphic styling, status colors match client legend.
  </verify>
  <done>
- Home page (/) displays CRM admin dashboard
- Global stats show totals, attribution breakdown, and valor em emendas
- Status pipeline bar visualizes distribution with color coding
- Per-vendedor cards show lead counts, status breakdown, valor, and last activity
- Recent activity feed displays last 10 updates with vendedor names and time ago
- Sigma dark theme with glassmorphism and neon cyan accents applied throughout
  </done>
</task>

</tasks>

<verification>
**Manual checks:**
1. Visit http://localhost:3000 and confirm dashboard loads with real data
2. Verify global stats match database counts
3. Verify status pipeline colors match client legend (🔴🟡🔵🟢⚫)
4. Verify per-vendedor cards show accurate lead counts and status breakdowns
5. Verify recent activity feed shows meaningful updates with time ago formatting
6. Verify responsive layout works on mobile and desktop
7. Confirm glassmorphic styling and neon cyan accents are applied

**API check:**
```bash
curl http://localhost:3000/api/dashboard-crm | jq '.'
```
Should return complete dashboard data structure.
</verification>

<success_criteria>
- [ ] GET /api/dashboard-crm returns structured JSON with global stats, vendedores array, and recent_activity
- [ ] Home page displays complete CRM dashboard with 5 sections (stats, pipeline, vendedor cards, activity)
- [ ] Status colors match client's legend (Novo=red, Tentativa=yellow, Contactado=blue, Negociação=green, Sem Interesse=gray)
- [ ] Per-vendedor cards show breakdown by status with colored badges
- [ ] Recent activity feed displays last 10 updates with time ago formatting
- [ ] All currency values formatted correctly (BRL format)
- [ ] Sigma dark theme with glassmorphism applied consistently
- [ ] Dashboard ready for tomorrow's 11am meeting
</success_criteria>

<output>
After completion, create `web/.planning/quick/6-dashboard-crm-gestor/6-SUMMARY.md` with:
- What was built (API endpoint + home page dashboard)
- Key implementation details (aggregation queries, status color mapping)
- Any deviations from plan
- Screenshots or data examples
- Readiness confirmation for meeting
</output>
