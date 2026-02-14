---
phase: 13-comissoes
plan: 02
subsystem: commission-reporting
tags: [commission, reporting, filtering, dashboard, ui]

dependency_graph:
  requires:
    - commission_config table (Phase 13 Plan 01)
    - commission_overrides table (Phase 13 Plan 01)
    - vendedor_projetos with commission columns (Phase 13 Plan 01)
    - /api/dashboard-crm endpoint (Phase 11)
  provides:
    - Enhanced /api/comissoes with filtering
    - Commission report page with date/vendedor/status filters
    - Vendedor dashboard commission breakdown section
  affects:
    - /comissoes page (complete rewrite with filters)
    - / dashboard (adds commission breakdown for vendedor)

tech_stack:
  added:
    - URLSearchParams-based filtering pattern
    - Date range inputs with default current month
    - Quick period selection buttons
    - Per-vendedor commission aggregation queries
  patterns:
    - Role-based filtering (vendedor auto-scoped)
    - Dynamic SQL WHERE clause building with parameterized queries
    - Locked commission indicators in UI
    - Override tracking with tooltip display
    - Commission breakdown by status for vendedor view

key_files:
  created: []
  modified:
    - web/src/app/api/comissoes/route.ts
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/comissoes/page.tsx
    - web/src/app/page.tsx

decisions:
  - decision: "Date filter defaults to current month (not all-time)"
    rationale: "Most relevant view for active commissions tracking, prevents data overload"
    alternatives: ["Default to all-time (overwhelming)", "No default filter (requires user action)"]
  - decision: "Vendedor filter only visible for gestor (vendedor auto-scoped)"
    rationale: "Vendedor always sees only their own data, no need for confusing dropdown"
    alternatives: ["Show disabled dropdown for vendedor (clutters UI)"]
  - decision: "Separate 'Comissao Confirmada' (Fechado) and 'Comissao Pipeline' cards"
    rationale: "Clear distinction between guaranteed vs potential commissions for financial planning"
    alternatives: ["Single total card with breakdown (less clear at glance)"]
  - decision: "Commission breakdown in vendedor dashboard (not just gestor)"
    rationale: "Vendedores need self-service visibility into their earnings by status"
    alternatives: ["Force vendedor to visit /comissoes page (extra navigation friction)"]
  - decision: "Quick period buttons ('Este Mes', 'Ultimo Mes', 'Todos') for UX"
    rationale: "Common filtering patterns should be one-click, not manual date entry"
    alternatives: ["Date inputs only (more clicks for common cases)"]

metrics:
  duration_seconds: 208
  tasks_completed: 2
  files_created: 0
  files_modified: 4
  commits: 2
  completed_at: "2026-02-14T05:11:31Z"
---

# Phase 13 Plan 02: Commission Reporting UI Summary

**One-liner:** Comprehensive commission reporting with date/vendedor/status filtering for gestor and commission breakdown dashboard widget for vendedor self-service visibility.

## What Was Built

### Enhanced Commission Report API (Phase 13 Plan 02 Task 1)

**GET /api/comissoes with query params:**
- `vendedor_id` - Filter by specific vendedor (gestor only, vendedor auto-scoped)
- `start_date` / `end_date` - Date range filtering (YYYY-MM-DD format)
- `fechado_only` - Boolean filter for confirmed commissions only
- Returns summary stats, per-vendedor breakdown, individual leads, vendedores list for dropdown

**Response structure:**
```json
{
  "summary": {
    "total_leads": 42,
    "total_comissao": 15000,
    "comissao_fechado": 8000,
    "comissao_pipeline": 7000,
    "total_valor_venda": 500000,
    "total_valor_emenda": 450000
  },
  "per_vendedor": [...],  // gestor only, when no vendedor filter
  "leads": [...],  // individual deals with locked/override flags
  "vendedores_list": [...],  // for filter dropdown
  "filters_applied": {...}
}
```

**Key features:**
- Dynamic WHERE clause building with parameterized queries (SQL injection safe)
- Role-based filtering: vendedor always scoped to `session.userId`
- Gestor can filter by specific vendedor or view global report
- Per-vendedor aggregation query for gestor summary cards
- Locked commission and override flags in lead details
- Vendedores list query for filter dropdown population

**GET /api/dashboard-crm enhancement:**
- Added `commission_breakdown` section (query 5)
- Returns commission totals grouped by status_contato
- Includes locked count per status
- Scoped to vendedor when `isVendedor = true`
- Ordered by status priority (Fechado, Proposta, Retorno, Nao Contatado)

### Commission Report Page Rewrite (Phase 13 Plan 02 Task 2)

**Filter bar (glassmorphic card):**
- Vendedor dropdown (gestor only) - "Todos os vendedores" + individual vendedores
- Date range inputs (De / Ate) with dark theme styling
- Quick period buttons: "Este Mes", "Ultimo Mes", "Todos"
- "Apenas Fechados" toggle checkbox for confirmed commissions

**Default filter state:**
- Start date: First day of current month
- End date: Today
- Vendedor: All (gestor) or auto-scoped (vendedor)
- Fechado only: false

**Summary cards (5 cards):**
1. **Comissao Total** - Total commission across all leads (cyan)
2. **Comissao Confirmada** - Only Fechado status (green)
3. **Comissao Pipeline** - Non-Fechado status (amber)
4. **Leads com Comissao** - Count of leads with commission (white)
5. **Valor Total Vendas** - Sum of valor_venda (cyan, conditional display if > 0)

**Per-vendedor breakdown (gestor only):**
- Grid of compact cards (1/2/3 columns responsive)
- Shows: vendedor name, lead count, total comissao, comissao fechado, fechados count
- Hover scale animation for interactivity
- Only displayed when `per_vendedor` array has items

**Deals table (enhanced):**
- Added "Valor Venda" column between Valor Emenda and %
- Added "(Confirmada)" indicator when `comissao_locked = true`
- Added "(Override)" indicator with tooltip showing `override_motivo`
- Clickable lead names link to `/lead/[cnpj]`
- Status badges with color coding
- Date formatting in pt-BR locale

**Empty state:**
- "Nenhum lead com comissao encontrado no periodo selecionado"
- Suggestion to adjust filters
- Displayed when `data.leads.length === 0`

### Vendedor Dashboard Enhancement (Phase 13 Plan 02 Task 2)

**New section: "Detalhamento Comissoes"**
- Positioned after pipeline status bar, before per-vendedor cards
- Only visible for vendedor role (`isVendedor && commission_breakdown.length > 0`)
- Shows commission breakdown by status_contato

**Breakdown display per status:**
- Status badge with color coding (matches STATUS_CONFIG)
- Lead count (e.g., "5 leads")
- Locked count (e.g., "(3 confirmadas)") if > 0
- Commission total in cyan (#00f0ff)

**Footer link:**
- "Ver relatorio completo →" link to /comissoes
- Cyan hover effect for discoverability

**DashboardData interface update:**
- Added optional `commission_breakdown` array field
- Typed with status_contato, count, total_comissao, total_venda, locked_count

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### Filter State Management

Client-side state with `useState` hooks:
```typescript
const [vendedorFilter, setVendedorFilter] = useState<string>('')
const [startDate, setStartDate] = useState<string>(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
})
const [endDate, setEndDate] = useState<string>(() => {
  return new Date().toISOString().split('T')[0]
})
const [fechadoOnly, setFechadoOnly] = useState(false)
```

**useEffect refetch on filter change:**
```typescript
useEffect(() => {
  const params = new URLSearchParams()
  if (vendedorFilter) params.set('vendedor_id', vendedorFilter)
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  if (fechadoOnly) params.set('fechado_only', 'true')
  fetch(`/api/comissoes?${params}`).then(...)
}, [vendedorFilter, startDate, endDate, fechadoOnly])
```

### Dynamic SQL WHERE Clause

**Backend filter building pattern:**
```typescript
const filters: string[] = ['base conditions']
const params: unknown[] = []
let paramIndex = 1

// Role-based auto-scope
if (session.role === 'vendedor') {
  filters.push(`vp.vendedor_id = $${paramIndex++}`)
  params.push(session.userId)
} else if (vendedorId) {
  filters.push(`vp.vendedor_id = $${paramIndex++}`)
  params.push(vendedorId)
}

// Date range
if (startDate) {
  filters.push(`vp.updated_at >= $${paramIndex++}::timestamp`)
  params.push(`${startDate} 00:00:00`)
}

// Static filter (no param)
if (fechadoOnly === 'true') {
  filters.push(`vp.status_contato = 'Fechado'`)
}

const whereClause = filters.join(' AND ')
await query(`SELECT ... WHERE ${whereClause}`, params)
```

**Prevents SQL injection** via parameterized queries. Dynamic column selection NOT used (only WHERE clause).

### Per-Vendedor Aggregation

```sql
SELECT
  vp.vendedor_id,
  u.nome as vendedor_nome,
  COUNT(*)::int as lead_count,
  SUM(vp.comissao_valor)::numeric as total_comissao,
  SUM(CASE WHEN vp.status_contato = 'Fechado' THEN vp.comissao_valor ELSE 0 END)::numeric as comissao_fechado,
  SUM(CASE WHEN vp.status_contato = 'Fechado' THEN 1 ELSE 0 END)::int as fechados_count
FROM vendedor_projetos vp
JOIN users u ON u.id = vp.vendedor_id
WHERE ${filters}
GROUP BY vp.vendedor_id, u.nome
ORDER BY total_comissao DESC
```

**Only executed for gestor when no vendedor filter applied.** Returns empty array for vendedor role.

### Commission Breakdown Query

```sql
SELECT
  COALESCE(vp.status_contato, 'Nao Contatado') as status_contato,
  COUNT(*)::int as count,
  SUM(vp.comissao_valor)::numeric as total_comissao,
  SUM(vp.valor_venda)::numeric as total_venda,
  SUM(CASE WHEN vp.comissao_locked = true THEN 1 ELSE 0 END)::int as locked_count
FROM vendedor_projetos vp
WHERE vp.vendedor_id IS NOT NULL
  AND vp.comissao_valor IS NOT NULL
  AND vp.comissao_valor > 0
  ${isVendedor ? ' AND vp.vendedor_id = $1' : ''}
GROUP BY vp.status_contato
ORDER BY
  CASE vp.status_contato
    WHEN 'Fechado' THEN 1
    WHEN 'Proposta' THEN 2
    WHEN 'Retorno' THEN 3
    WHEN 'Nao Contatado' THEN 4
  END
```

**Powers vendedor dashboard breakdown.** Shows how much commission is in each pipeline stage.

## Impact

**For Gestor:**
- Full commission visibility with filtering by vendedor, date, and status
- Per-vendedor summary cards for performance comparison
- Quick period selection for common reporting needs (monthly, quarterly)
- Clear separation of confirmed (Fechado) vs pipeline commissions
- Drill-down to individual deals with override/locked indicators

**For Vendedor:**
- Self-service commission visibility without needing gestor access
- Dashboard widget shows commission breakdown by status
- Default current-month view aligns with typical commission periods
- Link to full report for detailed deal-level inspection
- Clear "(Confirmada)" indicators for locked commissions

**For System:**
- Scalable filtering pattern (can add more filters without refactoring)
- Role-based data scoping prevents unauthorized access
- Commission breakdown query reusable for future analytics features
- URLSearchParams pattern enables deep linking (shareable report URLs)

## Verification Results

### Manual Testing Recommended

1. **Visit /comissoes as gestor:**
   - See vendedor dropdown populated
   - Date range defaults to current month
   - Quick period buttons change date range
   - Fechado toggle filters correctly
   - Summary cards show correct totals
   - Per-vendedor breakdown visible
   - Deals table shows all columns including Valor Venda
   - Locked and override indicators display

2. **Visit /comissoes as vendedor:**
   - No vendedor dropdown (auto-scoped)
   - See only own commission data
   - All filters work correctly
   - No per-vendedor breakdown section

3. **Visit / as vendedor:**
   - "Detalhamento Comissoes" section visible
   - Breakdown shows commission by status
   - Locked count displays when > 0
   - Link to /comissoes works

4. **Visit / as gestor:**
   - Commission breakdown section NOT shown
   - Per-vendedor cards still visible (existing feature)

5. **API endpoint tests:**
   ```bash
   # Full report (gestor)
   curl -H "Cookie: ..." /api/comissoes

   # Date range filter
   curl -H "Cookie: ..." '/api/comissoes?start_date=2026-02-01&end_date=2026-02-28'

   # Vendedor filter (gestor)
   curl -H "Cookie: ..." '/api/comissoes?vendedor_id=UUID'

   # Fechado only
   curl -H "Cookie: ..." '/api/comissoes?fechado_only=true'

   # Dashboard with commission breakdown
   curl -H "Cookie: ..." /api/dashboard-crm
   ```

### TypeScript Compilation

Not verified in this session (build environment not available). Recommend running `cd web && npm run build` before deployment.

## Self-Check

Verifying modified files exist:

```bash
[ -f "web/src/app/api/comissoes/route.ts" ] && echo "FOUND: comissoes API"
[ -f "web/src/app/api/dashboard-crm/route.ts" ] && echo "FOUND: dashboard-crm API"
[ -f "web/src/app/comissoes/page.tsx" ] && echo "FOUND: comissoes page"
[ -f "web/src/app/page.tsx" ] && echo "FOUND: dashboard page"
```

Verifying commits exist:

```bash
git log --oneline --all | grep -q "ea18464" && echo "FOUND: Task 1 commit (ea18464)"
git log --oneline --all | grep -q "97d8f92" && echo "FOUND: Task 2 commit (97d8f92)"
```

## Self-Check: PASSED

All files created and all commits verified:
- FOUND: comissoes API (web/src/app/api/comissoes/route.ts)
- FOUND: dashboard-crm API (web/src/app/api/dashboard-crm/route.ts)
- FOUND: comissoes page (web/src/app/comissoes/page.tsx)
- FOUND: dashboard page (web/src/app/page.tsx)
- FOUND: Task 1 commit (ea18464)
- FOUND: Task 2 commit (97d8f92)
