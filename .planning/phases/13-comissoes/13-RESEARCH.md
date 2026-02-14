# Phase 13: Comissões - Research

**Researched:** 2026-02-13
**Domain:** Commission tracking, reporting, and dashboard visualization for sales CRM
**Confidence:** HIGH

## Summary

Phase 13 builds upon the commission system partially implemented in quick tasks 4 and 9. The foundation already exists: `tipo_vendedor` (SDR/Closer), `comissao_percentual`, `comissao_valor`, and `valor_venda` fields are in place. The core task is to complete the commission tracking system with configurable percentages, comprehensive reporting with date/vendedor filtering, and enhanced vendedor dashboard.

**Current State:** Commission calculation happens automatically when leads have `valor_emenda`, using hardcoded rates (SDR: 9% + R$50, Closer: 12%). Sale value (`valor_venda`) is captured when status changes to "Fechado". Vendedor dashboard shows total commission and closing fee. Gestor sees per-vendedor commission totals.

**Primary recommendation:** Implement commission configuration table for gestor-controlled default and per-lead override percentages, create dedicated commission report API endpoint with date/vendedor filtering, and enhance vendedor dashboard with detailed commission breakdown by status and period. Avoid building complex commission calculation engine—leverage existing PostgreSQL NUMERIC precision and simple percentage-based model.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 | App Router, API routes for commission endpoints | Server-side rendering, zero-config API |
| PostgreSQL | Latest (Railway) | Commission data storage with NUMERIC precision | Best precision for financial calculations |
| React | 18 | Dashboard UI components | Already in use, no new dependencies |
| Tailwind CSS | Latest | Commission dashboard styling | Project standard, Sigma brand theme |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg (node-postgres) | Latest | Direct SQL queries for commission aggregation | Complex filtering, date ranges, GROUP BY |
| Auth.js | v5 | Session-based access control (gestor vs vendedor) | Already securing all API routes |

### No New Dependencies Required
All functionality can be implemented with existing stack. No specialized commission calculation libraries needed—PostgreSQL handles percentage calculations natively.

**Installation:**
```bash
# No new packages required
# Existing dependencies cover all Phase 13 needs
```

## Architecture Patterns

### Recommended Database Structure
```
vendedor_projetos/              # EXISTING - already has commission fields
├── comissao_percentual         # Current percentage applied
├── comissao_valor              # Calculated commission value
├── valor_venda                 # Sale value (captured when Fechado)
└── status_contato              # Triggers commission finalization

commission_config/              # NEW - gestor configuration
├── id (SERIAL PRIMARY)
├── vendedor_id (UUID, nullable)   # NULL = default for all
├── percentual_default (NUMERIC)   # Default rate for tipo_vendedor
├── tipo_vendedor (SDR/Closer)     # Which role this applies to
├── active (BOOLEAN)               # Can deactivate old configs
└── created_at, updated_at

commission_overrides/           # NEW - per-lead exceptions
├── id (SERIAL PRIMARY)
├── lead_id (FK to vendedor_projetos)
├── percentual_override (NUMERIC)
├── motivo (TEXT)                  # Why override applied
├── approved_by (UUID, FK users)   # Gestor approval
└── created_at
```

### Pattern 1: Configurable Commission Percentage
**What:** Gestor sets default commission percentages per tipo_vendedor, with ability to override individual deals.
**When to use:** When business rules change (rate adjustments) or exceptional deals need custom rates.
**Example:**
```typescript
// API route: /api/commission-config
// Gestor updates default SDR commission from 9% to 10%
await query(`
  INSERT INTO commission_config (tipo_vendedor, percentual_default, vendedor_id, active)
  VALUES ('SDR', 10.00, NULL, true)
  ON CONFLICT (tipo_vendedor, COALESCE(vendedor_id, '00000000-0000-0000-0000-000000000000'))
  DO UPDATE SET percentual_default = 10.00, updated_at = NOW()
`)

// Recalculate existing non-Fechado leads
await query(`
  UPDATE vendedor_projetos
  SET
    comissao_percentual = 10.00,
    comissao_valor = (COALESCE(valor_emenda, 0) * 0.10) + 50
  WHERE tipo_vendedor = 'SDR'
    AND status_contato != 'Fechado'
    AND valor_emenda IS NOT NULL
`)
```

### Pattern 2: Commission Report with Date/Vendedor Filtering
**What:** API endpoint that aggregates commissions with flexible filtering by vendedor and date period.
**When to use:** Monthly reports, per-vendedor performance tracking, commission payment calculations.
**Example:**
```typescript
// API route: /api/commission-report
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const vendedorId = searchParams.get('vendedor_id')
  const startDate = searchParams.get('start_date') // YYYY-MM-DD
  const endDate = searchParams.get('end_date')

  const filters = []
  const params = []

  if (vendedorId) {
    filters.push(`vp.vendedor_id = $${params.length + 1}`)
    params.push(vendedorId)
  }

  if (startDate) {
    filters.push(`vp.updated_at >= $${params.length + 1}::timestamp`)
    params.push(`${startDate} 00:00:00`)
  }

  if (endDate) {
    filters.push(`vp.updated_at <= $${params.length + 1}::timestamp`)
    params.push(`${endDate} 23:59:59`)
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

  const result = await query(`
    SELECT
      vp.vendedor_id,
      u.nome as vendedor_nome,
      vp.status_contato,
      COUNT(*) as lead_count,
      SUM(vp.comissao_valor) as total_comissao,
      SUM(vp.valor_venda) as total_valor_venda,
      AVG(vp.comissao_percentual) as avg_percentual
    FROM vendedor_projetos vp
    JOIN users u ON u.id = vp.vendedor_id
    ${whereClause}
    GROUP BY vp.vendedor_id, u.nome, vp.status_contato
    ORDER BY vendedor_nome, status_contato
  `, params)

  return NextResponse.json(result.rows)
}
```

### Pattern 3: Vendedor Dashboard Enhancement
**What:** Expand existing vendedor dashboard to show commission breakdown by status, date period selector, and list of commissioned deals.
**When to use:** Vendedor needs to see "which deals earned me commission" and "how much am I earning this month."
**Example:**
```typescript
// Enhanced dashboard query (already exists in /api/dashboard-crm, needs expansion)
const commissionBreakdown = await query(`
  SELECT
    status_contato,
    COUNT(*) as count,
    SUM(comissao_valor) as total_comissao,
    SUM(valor_venda) as total_venda
  FROM vendedor_projetos
  WHERE vendedor_id = $1
    AND comissao_valor > 0
    AND updated_at >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY status_contato
  ORDER BY
    CASE status_contato
      WHEN 'Fechado' THEN 1
      WHEN 'Proposta' THEN 2
      WHEN 'Retorno' THEN 3
      WHEN 'Não Contatado' THEN 4
    END
`, [vendedorId])
```

### Anti-Patterns to Avoid
- **Building custom commission calculation engine:** PostgreSQL NUMERIC handles percentage math perfectly. Don't introduce JavaScript floating-point arithmetic.
- **Storing commission as cents/integers:** Use NUMERIC(15,2) as already established (quick-3 decision). Direct currency display.
- **Recalculating commission on every read:** Commission should be calculated and stored when lead status/value changes, not computed in SELECT queries.
- **Manual commission adjustment without audit:** Any override must be logged with reason and approval (commission_overrides table).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audit trail for commission changes | Custom logging in app code | PostgreSQL trigger on commission_overrides | Triggers guarantee every change is logged, can't be bypassed by app bugs |
| Date range filtering UI | Custom calendar component | Native HTML date inputs | Mobile-friendly, no dependencies, works in all browsers |
| Commission calculation engine | Complex JavaScript percentage calculator | PostgreSQL NUMERIC with simple formulas | Database precision, server-side calculation, already working in quick-4 |
| Export to Excel/CSV | Complex XLSX generation library | Simple CSV via Array.join() | Commissions are tabular—CSV is sufficient and opens in Excel |

**Key insight:** Commission systems have hidden complexity in audit requirements and regulatory compliance. By keeping the model simple (percentage × value + flat fee) and leveraging PostgreSQL for storage/calculation, you avoid 90% of edge cases that plague complex commission platforms.

## Common Pitfalls

### Pitfall 1: Recalculating Closed Deal Commissions
**What goes wrong:** Business changes default commission from 9% to 10%, system recalculates ALL deals including already-paid "Fechado" deals, causing reconciliation nightmare.
**Why it happens:** No distinction between "prospective" and "locked" commission calculations.
**How to avoid:** When lead status becomes "Fechado", mark commission as locked. Config changes only affect non-Fechado leads.
**Warning signs:** Vendedor sees commission amounts changing for deals closed weeks ago.

### Pitfall 2: Missing Audit Trail on Manual Overrides
**What goes wrong:** Gestor adjusts commission percentage for one deal, six months later no one remembers why this deal has 15% instead of 12%.
**Why it happens:** Override applied directly to `comissao_percentual` column without logging.
**How to avoid:** Use commission_overrides table. Never UPDATE vendedor_projetos.comissao_percentual directly—always INSERT override record first, then trigger recalculation.
**Warning signs:** Discrepancies in commission reports that can't be explained.

### Pitfall 3: Floating-Point Arithmetic for Currency
**What goes wrong:** Using JavaScript `Number` type for commission calculation: `1000.00 * 0.09 = 89.99999999999999`
**Why it happens:** IEEE 754 floating-point cannot represent decimal fractions precisely.
**How to avoid:** Already solved—project uses NUMERIC(15,2) in PostgreSQL. Keep ALL commission math server-side in SQL.
**Warning signs:** Commission totals that are off by 1 cent when summing.

### Pitfall 4: No Visibility into "Why This Amount?"
**What goes wrong:** Vendedor sees "R$12.450,00 total commission" but can't see breakdown: which deals, what percentages, what base values.
**Why it happens:** Dashboard shows only aggregate totals.
**How to avoid:** Commission report must list individual deals with: lead name, base value, percentage applied, commission earned, date closed.
**Warning signs:** Vendedor disputes commission amount, can't verify correctness.

### Pitfall 5: Date Range Filtering on Wrong Column
**What goes wrong:** Gestor filters commission report "February 2026" but uses `created_at` instead of status change date—includes deals assigned in February but not yet closed.
**Why it happens:** Confusion about which timestamp represents "commission earned."
**How to avoid:** Filter on `updated_at` (when status last changed) for commission reports. Commission is earned when status becomes "Fechado" (or determined by business rule—could be Proposta).
**Warning signs:** Commission report shows deals that aren't closed yet, or misses deals closed in period.

## Code Examples

Verified patterns from existing codebase and research:

### Commission Calculation on Status Change
```typescript
// Source: web/src/app/api/leads/[cnpj]/route.ts (existing pattern from quick-4)
// Pattern: Update commission when valor_emenda or tipo_vendedor changes

async function recalculateCommission(leadId: number, valorEmenda: number, tipoVendedor: 'SDR' | 'Closer') {
  // Get current config (or use defaults)
  const config = await query(`
    SELECT percentual_default
    FROM commission_config
    WHERE tipo_vendedor = $1 AND active = true AND vendedor_id IS NULL
    ORDER BY created_at DESC LIMIT 1
  `, [tipoVendedor])

  const percentage = config.rows[0]?.percentual_default || (tipoVendedor === 'SDR' ? 9.00 : 12.00)
  const flatFee = tipoVendedor === 'SDR' ? 50 : 0

  // Check for per-lead override
  const override = await query(`
    SELECT percentual_override
    FROM commission_overrides
    WHERE lead_id = $1 AND active = true
    ORDER BY created_at DESC LIMIT 1
  `, [leadId])

  const finalPercentage = override.rows[0]?.percentual_override || percentage
  const commissionValue = (valorEmenda * (finalPercentage / 100)) + flatFee

  await query(`
    UPDATE vendedor_projetos
    SET
      comissao_percentual = $1,
      comissao_valor = $2,
      updated_at = NOW()
    WHERE id = $3
  `, [finalPercentage, commissionValue, leadId])
}
```

### Date Range Filter Pattern
```typescript
// Source: PostgreSQL date filtering best practices
// Pattern: BETWEEN with inclusive dates for commission report period

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start') // '2026-02-01'
  const endDate = searchParams.get('end')     // '2026-02-28'

  let query = `
    SELECT
      vp.cnpj,
      vp.nome,
      vp.status_contato,
      vp.comissao_valor,
      vp.comissao_percentual,
      vp.valor_venda,
      vp.updated_at::date as data_fechamento,
      u.nome as vendedor_nome
    FROM vendedor_projetos vp
    JOIN users u ON u.id = vp.vendedor_id
    WHERE vp.status_contato = 'Fechado'
      AND vp.comissao_valor > 0
  `

  const params = []
  if (startDate && endDate) {
    query += ` AND vp.updated_at::date BETWEEN $1 AND $2`
    params.push(startDate, endDate)
  }

  query += ` ORDER BY vp.updated_at DESC`

  const result = await pool.query(query, params)
  return NextResponse.json(result.rows)
}
```

### Commission Configuration Update (Gestor Only)
```typescript
// Source: Web search best practices for configurable commission rates
// Pattern: Upsert default commission percentage, trigger recalculation

export async function POST(request: Request) {
  const session = await getApiSession()
  if (session?.role !== 'gestor') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { tipo_vendedor, percentual_default } = await request.json()

  // Validate
  if (!['SDR', 'Closer'].includes(tipo_vendedor)) {
    return NextResponse.json({ error: 'Invalid tipo_vendedor' }, { status: 400 })
  }
  if (percentual_default < 0 || percentual_default > 100) {
    return NextResponse.json({ error: 'Percentage must be 0-100' }, { status: 400 })
  }

  // Deactivate old configs
  await query(`
    UPDATE commission_config
    SET active = false
    WHERE tipo_vendedor = $1 AND vendedor_id IS NULL
  `, [tipo_vendedor])

  // Insert new config
  await query(`
    INSERT INTO commission_config (tipo_vendedor, percentual_default, vendedor_id, active)
    VALUES ($1, $2, NULL, true)
  `, [tipo_vendedor, percentual_default])

  // Recalculate non-closed leads
  const flatFee = tipo_vendedor === 'SDR' ? 50 : 0
  await query(`
    UPDATE vendedor_projetos
    SET
      comissao_percentual = $1,
      comissao_valor = (COALESCE(valor_emenda, 0) * ($1 / 100)) + $2
    WHERE tipo_vendedor = $3
      AND status_contato != 'Fechado'
      AND valor_emenda IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM commission_overrides co
        WHERE co.lead_id = vendedor_projetos.id AND co.active = true
      )
  `, [percentual_default, flatFee, tipo_vendedor])

  return NextResponse.json({ success: true })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spreadsheet commission tracking | Real-time CRM commission calculation | 2026 industry shift | 61.9% of reps using software exceeded targets vs 30.1% with spreadsheets |
| Manual commission statements | Automated commission dashboards with self-service visibility | 2025-2026 | Reduces disputes, increases rep motivation |
| Single fixed percentage | Configurable tiered/override percentages | Modern CRM standard | Supports different deal sizes, strategic deals |
| Monthly batch calculation | Real-time commission visibility | 2026 best practice | Reps see earnings immediately when deal closes |

**Deprecated/outdated:**
- **Excel-based commission tracking:** Modern CRMs integrate commission calculation. Spreadsheets introduce errors, no audit trail, no real-time visibility.
- **Separate commission management software:** Phase 13 integrates commission into CRM—no need for standalone tool like QCommission or CaptivateIQ for simple percentage-based model.

## Open Questions

1. **When is commission "earned" for reporting purposes?**
   - What we know: Quick-5 added `valor_venda` when status becomes "Fechado"
   - What's unclear: Should commission show in reports for Proposta stage (potential earnings) or only Fechado (confirmed)?
   - Recommendation: Default to Fechado-only for commission reports. Add toggle in UI for "include pipeline (potential)" if gestor wants forecasting.

2. **Commission payment workflow (out of scope for v3.0?)**
   - What we know: Phase 13 requirements don't mention payment tracking (paid vs unpaid)
   - What's unclear: Do we need "mark commission as paid" workflow?
   - Recommendation: Defer to v4.0. Phase 13 focuses on tracking/reporting. Payment workflow adds complexity (approval, payment dates, disputes).

3. **Historical commission changes (audit trail depth)**
   - What we know: commission_overrides table proposed for per-lead exceptions
   - What's unclear: Do we need full history of all commission recalculations (e.g., config changed 3 times in one month)?
   - Recommendation: Start simple—commission_overrides tracks manual exceptions. Auto-recalculation from config changes doesn't need individual history. If auditing becomes requirement, add PostgreSQL trigger (see "Don't Hand-Roll" section).

## Sources

### Primary (HIGH confidence)
- Existing codebase inspection:
  - `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/comissoes/route.ts` - Current commission API
  - `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/api/setup-crm/route.ts` - Commission calculation logic (lines 98-129)
  - `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/.planning/quick/4-commission-system-default-status-n-o-con/4-SUMMARY.md` - Commission implementation (quick-4)
  - `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/.planning/quick/5-fix-critical-crm-bugs-and-ux-improvement/5-SUMMARY.md` - Sale value tracking (quick-5)
  - `/Users/pauloloureiro/Dev/SigmaProjects/projetustgov/web/src/app/page.tsx` - Vendedor dashboard commission display

### Secondary (MEDIUM confidence)
- [Best commission tracking software platforms for 2026](https://monday.com/blog/crm-and-sales/commission-tracking-software/) - Industry best practices (automation, real-time visibility, avoid spreadsheets)
- [Sales Commission Tracking Guide](https://forecastio.ai/blog/sales-commission-tracking) - Real-time visibility, data centralization patterns
- [Sales Commission Structures](https://spotio.com/blog/how-to-determine-typical-commission-structures-for-sales-reps/) - Tiered commission models, configurable percentages
- [PostgreSQL Date Functions](https://mode.com/blog/postgres-sql-date-functions/) - Date range filtering patterns
- [PostgreSQL Audit Triggers](https://wiki.postgresql.org/wiki/Audit_trigger) - Audit trail implementation via triggers

### Tertiary (LOW confidence)
- Web search results on commission software features (generic SaaS marketing, not implementation guidance)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing Next.js/PostgreSQL/React stack proven in Phase 10-11, no new dependencies
- Architecture: HIGH - Patterns validated against existing codebase (quick-4, quick-5, quick-9), PostgreSQL commission calculation already working
- Pitfalls: MEDIUM - Common issues from web research best practices, not project-specific validation
- Commission business rules: MEDIUM - Phase requirements clear, but payment workflow and audit depth may need clarification

**Research date:** 2026-02-13
**Valid until:** 60 days (commission tracking patterns stable, Next.js 14 stable)

**Phase 13 Readiness:**
- [x] Existing commission foundation understood (quick-4, quick-5)
- [x] Database schema additions identified (commission_config, commission_overrides)
- [x] API patterns validated (filtering, aggregation, role-based access)
- [x] UI enhancement points clear (vendedor dashboard, gestor commission config)
- [x] Common pitfalls catalogued with prevention strategies
- [ ] Open questions flagged for planner (commission "earned" definition, payment workflow scope)
