---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/setup-crm/route.ts
  - web/src/app/api/dashboard-crm/route.ts
  - web/src/app/page.tsx
  - web/src/app/leads/page.tsx
  - web/src/app/lead/[cnpj]/page.tsx
  - web/src/components/LeadTable.tsx
  - web/src/components/LeadSlideOver.tsx
  - web/src/lib/types.ts
  - web/src/app/api/leads/route.ts
  - web/src/app/api/leads/[cnpj]/route.ts
autonomous: true

must_haves:
  truths:
    - "Commission is calculated automatically for each vendedor_projeto based on tipo_vendedor"
    - "Default status for new leads is 'Não Contatado' instead of 'Ainda Não'"
    - "Parlamentar column appears next to valor_emenda in leads table"
    - "Vendedor dashboard shows total commission as prominent metric"
    - "Commission appears on lead detail page"
  artifacts:
    - path: "web/src/app/api/setup-crm/route.ts"
      provides: "Schema migration: adds tipo_vendedor, comissao_percentual, comissao_valor columns; updates status default to 'Não Contatado'"
      contains: "ALTER TABLE vendedor_projetos ADD COLUMN tipo_vendedor"
    - path: "web/src/lib/types.ts"
      provides: "VendedorProjeto type with commission fields"
      exports: ["VendedorProjeto"]
    - path: "web/src/app/page.tsx"
      provides: "Dashboard with commission display for vendedor role"
      contains: "comissao_total"
    - path: "web/src/components/LeadTable.tsx"
      provides: "Leads table with parlamentar column repositioned"
      contains: "parlamentar"
  key_links:
    - from: "web/src/app/api/setup-crm/route.ts"
      to: "vendedor_projetos table"
      via: "ALTER TABLE migration"
      pattern: "ALTER TABLE vendedor_projetos"
    - from: "web/src/app/page.tsx"
      to: "/api/dashboard-crm"
      via: "fetch commission data"
      pattern: "fetch.*dashboard-crm"
---

<objective>
Implement 3 feature updates from meeting notes:

1. **Commission System**: Add tipo_vendedor field to vendedor_projetos and calculate commission automatically (SDR: base 8% + R$50 + 1%, Closer: base 8% + 4%). Display on vendedor dashboard and lead detail page.

2. **Status Rename**: Change default status from "Ainda Não" to "Não Contatado" across all CRM components and migrate existing data.

3. **Column Reorder**: Move parlamentar column to appear after valor_emenda in LeadTable component for better context.

Purpose: Improve commission tracking visibility and align status terminology with business process.

Output: Commission fields in database, commission display in UI, status terminology updated, parlamentar column repositioned.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Current commission calculation formula from meeting notes:
# Base = 8% of valor_emenda
# If tipo_vendedor = 'SDR': comissao = (valor_emenda * 0.08) + 50 + (valor_emenda * 0.01) = valor_emenda * 0.09 + 50
# If tipo_vendedor = 'Closer': comissao = (valor_emenda * 0.08) + (valor_emenda * 0.04) = valor_emenda * 0.12
# Default tipo_vendedor = 'SDR'

# Current status system:
# Existing: "Ainda Não", "Retorno", "Proposta", "Fechado"
# New: "Não Contatado", "Retorno", "Proposta", "Fechado"
</context>

<tasks>

<task type="auto">
  <name>Add commission fields to schema and update status default</name>
  <files>
    web/src/app/api/setup-crm/route.ts
    web/src/lib/types.ts
  </files>
  <action>
**setup-crm/route.ts:**
- Add 3 new columns to vendedor_projetos table:
  - `tipo_vendedor VARCHAR(20) DEFAULT 'SDR' CHECK (tipo_vendedor IN ('SDR', 'Closer'))`
  - `comissao_percentual NUMERIC(5,2)` (stores the percentage as decimal, e.g., 9.00 for SDR, 12.00 for Closer)
  - `comissao_valor NUMERIC(15,2)` (stores calculated R$ value)
- Add computed column trigger or update logic to calculate commission:
  - SDR: `comissao_percentual = 9.00`, `comissao_valor = (valor_emenda * 0.09) + 50`
  - Closer: `comissao_percentual = 12.00`, `comissao_valor = valor_emenda * 0.12`
- Replace ALL instances of `'Ainda Não'` with `'Não Contatado'` in:
  - Default column value
  - Status migration queries (lines 96-98, 133-143)
  - Comments
- Update migration on line 96 to: `UPDATE vendedor_projetos SET status_contato = 'Não Contatado' WHERE status_contato IN ('Ainda Não', 'Novo', 'Contactado') OR status_contato IS NULL;`
- Use ALTER TABLE with IF NOT EXISTS pattern for new columns (safe for re-runs)

**types.ts:**
- Add to VendedorProjeto interface:
  - `tipo_vendedor: 'SDR' | 'Closer' | null`
  - `comissao_percentual: number | null`
  - `comissao_valor: number | null`
- Update DashboardStats.by_status to replace `'Ainda Não'` key with `'Não Contatado'`
  </action>
  <verify>
Run setup: `curl -X POST http://localhost:3000/api/setup-crm`
Check response contains no errors
Verify in database: `SELECT tipo_vendedor, comissao_percentual, comissao_valor FROM vendedor_projetos LIMIT 3`
Check TypeScript compiles: `cd web && npx tsc --noEmit`
  </verify>
  <done>
vendedor_projetos table has tipo_vendedor (default 'SDR'), comissao_percentual, comissao_valor columns
All status references changed from "Ainda Não" to "Não Contatado"
TypeScript types updated with commission fields
No compilation errors
  </done>
</task>

<task type="auto">
  <name>Update status handling in API routes and dashboard queries</name>
  <files>
    web/src/app/api/dashboard-crm/route.ts
    web/src/app/api/leads/route.ts
    web/src/app/api/leads/[cnpj]/route.ts
    web/src/app/page.tsx
  </files>
  <action>
**dashboard-crm/route.ts:**
- Line 25: Replace `COALESCE(status_contato, 'Ainda Não') IN ('Ainda Não', 'Novo', 'Contactado')` with `COALESCE(status_contato, 'Não Contatado') IN ('Não Contatado', 'Novo', 'Contactado')`
- Line 40: Same update for vendedor aggregations
- Line 81: Replace `COALESCE(vp.status_contato, 'Ainda Não')` with `COALESCE(vp.status_contato, 'Não Contatado')`
- Line 98: Change object key from `'Ainda Não'` to `'Não Contatado'`
- Add commission aggregation to vendedores query (around line 44):
  - `SUM(COALESCE(vp.comissao_valor, 0)) as comissao_total`
- Add commission to return object per vendedor
- For vendedor role, also return individual lead commission total in global stats

**leads/route.ts and leads/[cnpj]/route.ts:**
- Update any status references from 'Ainda Não' to 'Não Contatado'
- Include tipo_vendedor, comissao_percentual, comissao_valor in SELECT queries
- When creating/updating leads, calculate commission if valor_emenda changes

**page.tsx (Dashboard):**
- Line 8-12: Update StatusCounts interface, replace `'Ainda Não'` with `'Não Contatado'`
- Line 30: Add `comissao_total: number` to VendedorStats interface
- Line 54: Update STATUS_CONFIG, replace `'Ainda Não'` key with `'Não Contatado'`, update label
- Line 60: Update STATUS_ORDER array to use `'Não Contatado'`
- For vendedor role: Add commission display as big number metric (similar to valor_total_emenda display pattern around line 156+)
  - Show as "Comissão Total: R$ {formatCurrency(comissao_total)}"
  - Use sigma-neon color for emphasis
  </action>
  <verify>
Start dev server: `cd web && npm run dev`
Visit http://localhost:3000 and verify:
- Status cards show "Não Contatado" instead of "Ainda Não"
- Vendedor dashboard shows commission total
Check API response: `curl http://localhost:3000/api/dashboard-crm` (with auth cookie)
Verify comissao_total appears in vendedores array
  </verify>
  <done>
Dashboard queries aggregate commission per vendedor
Status "Não Contatado" appears in all API responses and UI
Vendedor dashboard displays total commission as prominent metric
All status handling code uses new terminology
  </done>
</task>

<task type="auto">
  <name>Update UI components: status options, commission display, column order</name>
  <files>
    web/src/app/leads/page.tsx
    web/src/app/lead/[cnpj]/page.tsx
    web/src/components/LeadSlideOver.tsx
    web/src/components/LeadTable.tsx
  </files>
  <action>
**leads/page.tsx, lead/[cnpj]/page.tsx:**
- Replace any hardcoded 'Ainda Não' with 'Não Contatado' in status displays or fallbacks
- On lead detail page, add commission display section:
  - Show tipo_vendedor badge (SDR or Closer)
  - Show comissao_percentual as "X% comissão"
  - Show comissao_valor as "R$ X,XXX.XX" using formatCurrency
  - Position near valor_emenda display for context
  - Only show if lead has vendedor_id (assigned)

**LeadSlideOver.tsx:**
- Line 9: Update STATUS_COLORS object, replace `'Ainda Não'` key with `'Não Contatado'`
- Line 99: Update fallback from `STATUS_COLORS['Ainda Não']` to `STATUS_COLORS['Não Contatado']`
- Add commission display in panel (around line 110+ in info grid):
  - Show only if lead.comissao_valor exists
  - Format: "Comissão: R$ {formatCurrency(lead.comissao_valor)} ({lead.comissao_percentual}%)"
  - Use subtle styling (text-gray-400)

**LeadTable.tsx:**
- Reorder columns array (lines 24-57):
  - Current order: CNPJ, Nome, Programa, Valor Global, Situacao, UF, Status, Vendedor
  - New order: CNPJ, Nome, Programa, Valor Global, **Parlamentar**, Situacao, UF, Status, Vendedor
  - Move parlamentar accessor (currently doesn't exist) to position after valor_global
  - Use existing pattern: `columnHelper.accessor('parlamentar', { header: 'Parlamentar', cell: (info) => <span className="text-xs">{info.getValue() || '-'}</span> })`
- Line 51: Update fallback from `'Ainda Não'` to `'Não Contatado'`
  </action>
  <verify>
Visit http://localhost:3000/leads
Check LeadTable shows parlamentar column after Valor Global
Visit lead detail page (click any lead)
Verify commission info displays with tipo_vendedor, percentage, and R$ value
Open LeadSlideOver (click lead in various places)
Verify status badge says "Não Contatado" instead of "Ainda Não"
Check TypeScript: `cd web && npx tsc --noEmit`
  </verify>
  <done>
LeadTable shows parlamentar column immediately after valor_emenda (valor_global)
Lead detail page displays commission calculation (tipo_vendedor, percentage, valor)
LeadSlideOver shows commission in info panel
All UI components use "Não Contatado" status terminology
No TypeScript errors
  </done>
</task>

</tasks>

<verification>
**Functional checks:**
- [ ] Database schema has tipo_vendedor, comissao_percentual, comissao_valor columns
- [ ] Default status is 'Não Contatado' (not 'Ainda Não')
- [ ] Existing leads migrated to new status terminology
- [ ] Commission calculated based on tipo_vendedor (SDR or Closer)
- [ ] Vendedor dashboard shows total commission metric
- [ ] Lead detail page shows commission breakdown
- [ ] LeadSlideOver displays commission info
- [ ] LeadTable shows parlamentar column after valor_emenda
- [ ] All status displays show "Não Contatado"

**Technical checks:**
- [ ] TypeScript compiles without errors: `cd web && npx tsc --noEmit`
- [ ] Dev server runs: `cd web && npm run dev`
- [ ] Setup route creates schema: `curl -X POST http://localhost:3000/api/setup-crm`
- [ ] Dashboard API returns commission data: `curl http://localhost:3000/api/dashboard-crm`
</verification>

<success_criteria>
1. Commission system implemented:
   - tipo_vendedor field in vendedor_projetos (default 'SDR')
   - Commission automatically calculated: SDR = valor_emenda * 0.09 + R$50, Closer = valor_emenda * 0.12
   - Vendedor dashboard shows total commission as big number
   - Lead detail page shows commission breakdown
   - Commission appears in LeadSlideOver panel

2. Status terminology updated:
   - Default status changed from "Ainda Não" to "Não Contatado"
   - All existing "Ainda Não" records migrated to "Não Contatado"
   - Dashboard, tables, cards, slide-over all display new terminology
   - API routes use "Não Contatado" in queries and responses

3. Table layout improved:
   - Parlamentar column appears immediately after Valor Emenda in LeadTable
   - Column order provides better context for lead qualification

4. Application builds and runs without errors
</success_criteria>

<output>
After completion, create `.planning/quick/4-commission-system-default-status-n-o-con/4-SUMMARY.md` with:
- Schema changes applied
- Commission calculation implemented
- Status migration completed
- UI updates verified
- Screenshots of commission display and repositioned column
</output>
