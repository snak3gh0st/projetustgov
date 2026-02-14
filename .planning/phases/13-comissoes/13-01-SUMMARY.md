---
phase: 13-comissoes
plan: 01
subsystem: commission-backend
tags: [commission, config, database, api]

dependency_graph:
  requires:
    - vendedor_projetos table (Phase 10)
    - users table with gestor role (Phase 10)
    - Auth.js session (Phase 10)
  provides:
    - commission_config table
    - commission_overrides table
    - /api/commission-config CRUD endpoint
    - Config-based commission calculation on Fechado
  affects:
    - Lead PATCH flow (adds commission locking)
    - vendedor_projetos schema (adds comissao_locked column)

tech_stack:
  added:
    - commission_config PostgreSQL table (NUMERIC precision)
    - commission_overrides PostgreSQL table
  patterns:
    - Database-driven configuration (not hardcoded rates)
    - CTE-based commission calculation in PostgreSQL
    - Commission locking on deal closure
    - Per-lead override tracking with audit trail (motivo + approved_by)

key_files:
  created:
    - web/src/app/api/commission-config/route.ts
  modified:
    - web/src/app/api/setup-crm/route.ts
    - web/src/app/api/leads/[cnpj]/route.ts

decisions:
  - decision: "Commission rates stored in database, not hardcoded"
    rationale: "Enables gestor to adjust rates without code deployment, supports future per-vendedor rates"
    alternatives: ["Environment variables (not flexible enough)", "Hardcoded (requires redeploy)"]
  - decision: "Separate commission_overrides table instead of columns on vendedor_projetos"
    rationale: "Preserves audit trail, supports multiple overrides over time, tracks approval + motivo"
    alternatives: ["Add override columns to vendedor_projetos (loses history)"]
  - decision: "Lock commission when status becomes Fechado, unlock when status changes away"
    rationale: "Prevents retroactive rate changes affecting closed deals, allows re-opening leads"
    alternatives: ["Never recalculate after first Fechado (prevents corrections)"]
  - decision: "All commission math in PostgreSQL using NUMERIC type"
    rationale: "Avoids floating-point precision errors, keeps calculation logic close to data"
    alternatives: ["JavaScript calculation (precision issues, data fetching overhead)"]
  - decision: "Ensure vendedor_id on Fechado (COM-01 requirement)"
    rationale: "Links vendedor to deal at closure time, prevents orphaned commissions"
    alternatives: ["Require vendedor_id before allowing Fechado (blocks workflow)"]

metrics:
  duration_seconds: 159
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
  completed_at: "2026-02-14T05:05:10Z"
---

# Phase 13 Plan 01: Commission Configuration Backend Summary

**One-liner:** Database-driven commission configuration with gestor CRUD API, per-lead override tracking, and automatic commission locking on deal closure using PostgreSQL NUMERIC precision.

## What Was Built

### Database Schema (Phase 13 Plan 01 Task 1)

**commission_config table:**
- Stores default commission rates per tipo_vendedor (SDR/Closer)
- Supports future per-vendedor custom rates (vendedor_id column)
- Tracks active/inactive configs for historical audit
- Seeded with default values: SDR 9%+R$50, Closer 12%+R$0

**commission_overrides table:**
- Per-lead commission rate adjustments
- Requires motivo (reason) and approved_by for audit trail
- Supports percentage override and optional fixed fee override
- Active flag allows deactivating old overrides when creating new ones

**vendedor_projetos schema update:**
- Added comissao_locked BOOLEAN column
- Existing Fechado leads automatically marked as locked
- Prevents retroactive rate changes affecting closed deals

### Commission Configuration API (Phase 13 Plan 01 Task 2)

**GET /api/commission-config (gestor-only):**
- Returns all active commission configs (default rates per tipo_vendedor)
- Returns last 20 active per-lead overrides with lead details
- Used by gestor to view current commission structure

**POST /api/commission-config (gestor-only):**
- Updates default commission config for SDR or Closer
- Validates: tipo_vendedor in ['SDR', 'Closer'], percentual 0-100, taxa_fixa >= 0
- Deactivates old config, inserts new config
- Recalculates commission for non-locked, non-overridden leads
- Returns count of recalculated leads

**PUT /api/commission-config (gestor-only):**
- Creates per-lead commission override
- Requires motivo (non-empty string) for audit trail
- Deactivates any existing override for that lead
- Recalculates lead commission if not locked
- Tracks approved_by as current session user

### Lead Status Flow Update (Phase 13 Plan 01 Task 2)

**When status changes to Fechado:**
1. Ensure vendedor_id is set (assign session.userId if NULL) - fulfills COM-01
2. Calculate commission using hierarchy:
   - Per-lead override (if exists)
   - Default config for tipo_vendedor (if exists)
   - Hardcoded fallback (SDR: 9%+R$50, Closer: 12%)
3. Lock commission (comissao_locked = true)
4. All calculation happens in PostgreSQL CTE for NUMERIC precision

**When status changes away from Fechado:**
- Unlock commission (comissao_locked = false)
- Allows recalculation if rate changes or status toggled back

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### Commission Calculation Query
```sql
WITH lead_info AS (
  SELECT id, tipo_vendedor, valor_emenda, comissao_locked
  FROM vendedor_projetos WHERE id = $1
),
override_check AS (
  SELECT percentual_override, taxa_fixa_override
  FROM commission_overrides
  WHERE lead_id = $1 AND active = true
  ORDER BY created_at DESC LIMIT 1
),
config_check AS (
  SELECT percentual_default, taxa_fixa
  FROM commission_config
  WHERE tipo_vendedor = (SELECT tipo_vendedor FROM lead_info)
    AND vendedor_id IS NULL AND active = true
  ORDER BY created_at DESC LIMIT 1
)
UPDATE vendedor_projetos
SET comissao_percentual = COALESCE(
      (SELECT percentual_override FROM override_check),
      (SELECT percentual_default FROM config_check),
      CASE WHEN tipo_vendedor = 'SDR' THEN 9.00 ELSE 12.00 END
    ),
    comissao_valor = (valor_emenda * percentual / 100) + taxa_fixa,
    comissao_locked = true
WHERE id = $1 AND (comissao_locked IS NOT true)
```

### Recalculation Logic
- **POST /api/commission-config:** Recalculates all leads matching tipo_vendedor WHERE comissao_locked IS NOT true AND no active override exists
- **PUT /api/commission-config:** Recalculates single lead WHERE comissao_locked IS NOT true
- **Lead PATCH to Fechado:** Calculates commission once using current config, then locks
- **Lead PATCH away from Fechado:** Unlocks commission (allows future recalculation)

### Authorization
- All commission-config endpoints: gestor-only (403 for vendedor/visualizador)
- Lead PATCH: vendedor can update own leads, gestor can update any lead
- commission_overrides.approved_by: tracks which gestor created the override

## Impact

**For Gestor:**
- Can now change commission rates without code deployment
- Can create special deals with custom rates + documented reason
- Historical audit trail of all rate changes and overrides
- Closed deals (Fechado) are protected from retroactive rate changes

**For Vendedor:**
- No change to workflow (commission calculation is automatic)
- Transparency: commission locked when deal closes
- Commission recalculates if gestor changes rates before closure

**For System:**
- Commission logic moved from hardcoded to database-driven
- Foundation for future features: per-vendedor rates, tiered rates, time-based rates
- All financial math uses PostgreSQL NUMERIC (no floating-point errors)

## Verification Results

### Manual Testing Recommended
1. Visit /api/setup-crm to create tables and seed defaults
2. GET /api/commission-config (gestor session) → returns SDR/Closer configs
3. POST /api/commission-config with new rate → recalculates non-locked leads
4. PUT /api/commission-config with lead override → creates override record
5. PATCH lead to Fechado → vendedor_id set, commission calculated and locked
6. PATCH lead away from Fechado → commission unlocked
7. GET /api/commission-config (vendedor session) → 403 Forbidden

### TypeScript Compilation
Not verified in this session (npm dependencies not installed in execution environment). Recommend running `cd web && npm run build` before deployment.

## Self-Check

Verifying created files exist:

```bash
[ -f "web/src/app/api/commission-config/route.ts" ] && echo "FOUND: commission-config API"
[ -f "web/src/app/api/setup-crm/route.ts" ] && echo "FOUND: setup-crm with commission tables"
[ -f "web/src/app/api/leads/[cnpj]/route.ts" ] && echo "FOUND: lead PATCH with commission locking"
```

Verifying commits exist:

```bash
git log --oneline --all | grep -q "6ea6670" && echo "FOUND: Task 1 commit (6ea6670)"
git log --oneline --all | grep -q "289c48d" && echo "FOUND: Task 2 commit (289c48d)"
```

## Self-Check: PASSED

All files created and all commits verified:
- FOUND: commission-config API (web/src/app/api/commission-config/route.ts)
- FOUND: setup-crm with commission tables (web/src/app/api/setup-crm/route.ts)
- FOUND: lead PATCH with commission locking (web/src/app/api/leads/[cnpj]/route.ts)
- FOUND: Task 1 commit (6ea6670)
- FOUND: Task 2 commit (289c48d)
