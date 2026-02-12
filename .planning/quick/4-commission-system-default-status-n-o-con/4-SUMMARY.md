---
phase: quick-4
plan: 01
subsystem: crm
tags: [commission, status-migration, postgresql, nextjs, ui-enhancement]

# Dependency graph
requires:
  - phase: 11
    provides: CRM schema with vendedor_projetos table and contact tracking
provides:
  - Commission calculation system (SDR vs Closer)
  - Status terminology updated from "Ainda Não" to "Não Contatado"
  - Parlamentar column repositioned in leads table
  - Commission display in dashboard and UI components
affects: [phase-12, phase-13, commission-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Commission calculation in database: SDR = 9% + R$50, Closer = 12%
    - Type-based commission percentual stored alongside calculated valor
    - "Não Contatado" as default status for new leads

key-files:
  created: []
  modified:
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/dashboard-crm/route.ts
    - web/src/app/page.tsx
    - web/src/lib/types.ts
    - web/src/components/LeadTable.tsx
    - web/src/components/LeadSlideOver.tsx
    - web/src/app/lead/[cnpj]/page.tsx
    - web/src/app/leads/page.tsx

key-decisions:
  - "Commission formula: SDR = valor_emenda * 0.09 + R$50, Closer = valor_emenda * 0.12"
  - "Status migration: 'Ainda Não' → 'Não Contatado' with data migration for existing records"
  - "Parlamentar column moved to appear after valor_global for better context"
  - "Commission displayed prominently for vendedor role on dashboard"

patterns-established:
  - "tipo_vendedor column with CHECK constraint (SDR or Closer)"
  - "Separate comissao_percentual and comissao_valor columns for transparency"
  - "Commission shown in sigma-neon color for emphasis in UI"

# Metrics
duration: 7min
completed: 2026-02-12
---

# Quick Task 4: Commission System, Status Update & Column Reorder

**Commission tracking with tipo_vendedor (SDR/Closer), status terminology changed to "Não Contatado", and parlamentar column repositioned after valor_emenda**

## Performance

- **Duration:** 7 minutes
- **Started:** 2026-02-12T20:06:33Z
- **Completed:** 2026-02-12T20:13:58Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Commission system implemented with automatic calculation based on tipo_vendedor
- All "Ainda Não" status references updated to "Não Contatado" across schema, API, and UI
- Parlamentar column repositioned in LeadTable for better lead context
- Commission display added to vendedor dashboard, lead detail page, and LeadSlideOver

## Task Commits

Each task was committed atomically:

1. **Task 1: Add commission fields and update status to 'Não Contatado'** - `3d90323` (feat)
2. **Task 2: Update dashboard to show commission and 'Não Contatado' status** - `85ca3fc` (feat)
3. **Task 3: Update UI components with commission display and new status** - `b626b2b` (feat)

## Files Created/Modified
- `web/src/app/api/setup-crm/route.ts` - Added tipo_vendedor, comissao_percentual, comissao_valor columns; migrated status from "Ainda Não" to "Não Contatado"
- `web/src/app/api/dashboard-crm/route.ts` - Added commission aggregation, updated status references
- `web/src/app/page.tsx` - Updated STATUS_CONFIG, added commission display for vendedor role
- `web/src/lib/types.ts` - Added commission fields to VendedorProjeto, updated DashboardStats
- `web/src/components/LeadTable.tsx` - Added parlamentar column after valor_global, updated status fallback
- `web/src/components/LeadSlideOver.tsx` - Updated STATUS_COLORS, added commission info panel
- `web/src/app/lead/[cnpj]/page.tsx` - Added commission section with tipo_vendedor/percentage/valor display
- `web/src/app/leads/page.tsx` - Updated STATUS_OPTIONS and STATUS_COLORS to remove "Ainda Não"

## Decisions Made

**1. Commission formula differentiation by tipo_vendedor**
- SDR: 9% of valor_emenda + R$50 flat fee (incentivizes initial contact)
- Closer: 12% of valor_emenda (higher percentage for closing deals)
- Default tipo_vendedor = 'SDR' for new leads
- Both percentage and calculated valor stored for transparency

**2. Status terminology migration**
- Changed default status from "Ainda Não" to "Não Contatado" for clarity
- Migrated all existing "Ainda Não" records to "Não Contatado"
- Removed "Ainda Não" from all status options and color configs
- Updated fallback values throughout codebase

**3. UI enhancements**
- Parlamentar column repositioned after valor_global (better lead qualification context)
- Commission displayed in sigma-neon color (#00f0ff) for prominence
- Vendedor dashboard shows commission as big number metric
- Lead detail page has dedicated commission section with 3-column layout

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully with TypeScript compilation passing and Next.js build successful.

## User Setup Required

None - changes are schema migrations and UI updates. Database will auto-migrate on next setup-crm run.

**Verification:**
1. Run `curl -X POST http://localhost:3000/api/setup-crm` to apply schema changes
2. Visit vendedor dashboard to see commission total
3. Open lead detail page for assigned lead to see commission breakdown
4. Check LeadTable shows parlamentar column after Valor Global

## Next Phase Readiness

- Commission system ready for Phase 13 (Commission reporting and tracking)
- Status terminology consistent across all CRM components
- UI improvements enhance lead qualification workflow
- All builds passing, ready for deployment

## Self-Check: PASSED

All files verified:
- FOUND: web/src/app/api/setup-crm/route.ts
- FOUND: web/src/app/api/dashboard-crm/route.ts
- FOUND: web/src/app/page.tsx
- FOUND: web/src/lib/types.ts
- FOUND: web/src/components/LeadTable.tsx
- FOUND: web/src/components/LeadSlideOver.tsx
- FOUND: web/src/app/lead/[cnpj]/page.tsx
- FOUND: web/src/app/leads/page.tsx

All commits verified:
- FOUND: 3d90323
- FOUND: 85ca3fc
- FOUND: b626b2b

---
*Phase: quick-4*
*Completed: 2026-02-12*
