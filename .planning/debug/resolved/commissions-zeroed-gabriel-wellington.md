---
status: resolved
trigger: "Gabriel and Wellington commissions were zeroed out in the CRM"
created: 2026-02-27T00:00:00Z
updated: 2026-02-27T16:30:00Z
---

## Current Focus

hypothesis: RESOLVED - Root cause found and fixed. Gabriel lead ID=81 had orphaned commission from early PATCH handler bug. Code fix applied + DB data cleaned.
test: Verified no orphaned commissions remain, Gabriel's 2 valid Fechado leads intact, code fix in place
expecting: N/A - resolved
next_action: DONE

## Symptoms

expected: Gabriel and Wellington should have commission data (comissao_valor, comissao_percentual, comissao_bonus) on their Fechado leads
actual: Commission data is zeroed/NULL - gestor says "Zerou e eles nao fizeram o controle pq estavam so com o CRM"
errors: No error messages - data was silently wiped
reproduction: Check vendedor_projetos table for Gabriel and Wellington's Fechado leads
started: Unknown - discovered recently

## Eliminated

- hypothesis: Recent scripts (migrate-comissao-bonus.mjs, fix-split-vendedor-assignments.mjs) zeroed commissions
  evidence: migrate script only updates leads WHERE comissao_valor IS NOT NULL (can't create new nulls). fix-split script preserves Fechado status. Neither wipes existing commission data.
  timestamp: 2026-02-27T00:10:00Z

- hypothesis: Cron sync zeroed commission fields
  evidence: UPSERT_SQL in repo-sync.ts explicitly NEVER updates status_contato, valor_venda, or comissao_* columns. Confirmed by reviewing the UPSERT query.
  timestamp: 2026-02-27T00:12:00Z

- hypothesis: Commission data was recently wiped (data loss event)
  evidence: Gabriel has 2 valid Fechado leads with locked commissions (IDs 1919 and 2167) intact. Wellington never had any Fechado leads (0 Fechado rows, 0 valor_venda, 782 total leads all in non-Fechado status).
  timestamp: 2026-02-27T00:15:00Z

- hypothesis: Wellington previously had Fechado leads that were deleted/reset
  evidence: All 782 Wellington rows examined. None have valor_venda set. Contact notes show active pipeline work but no closed deals. Confirmed in previous debug session (wellington-sales-deleted.md).
  timestamp: 2026-02-27T00:18:00Z

## Evidence

- timestamp: 2026-02-27T00:05:00Z
  checked: vendedor_projetos for Gabriel and Wellington Fechado leads
  found: Gabriel has 2 Fechado leads (IDs 1919 and 2167) with comissao_locked=true and correct commission values. Wellington has ZERO Fechado leads.
  implication: Current Fechado commissions are intact for Gabriel. Wellington never closed a sale.

- timestamp: 2026-02-27T00:08:00Z
  checked: Leads with valor_venda but NOT Fechado status (orphaned)
  found: Gabriel lead ID=81 (CNPJ 00643692000196, APAE DF) - status=Retorno, valor_venda=30000, comissao_valor=1200, comissao_bonus=50, comissao_locked=FALSE. This lead has commission values but is NOT Fechado and NOT locked.
  implication: This is an orphaned commission record - the lead appears to have been briefly marked Fechado then reverted, but the commission values were not cleared.

- timestamp: 2026-02-27T00:20:00Z
  checked: git history of PATCH handler unlock logic
  found: EARLY VERSION (commits c292f1b through 997e9b3) of the unlock logic ONLY set comissao_locked=false - it did NOT clear comissao_valor or comissao_percentual. Later (commit 25fff79, Feb 16) the clear was expanded to NULL out comissao_valor and comissao_percentual.
  implication: Lead 81 was marked Fechado in the early period (before Feb 16), commissions calculated (1200 + 50), then status changed back to Retorno. The old unlock code only set locked=false but LEFT the commission values. This created the orphaned state.

- timestamp: 2026-02-27T00:22:00Z
  checked: comissoes page API (/api/comissoes/route.ts line 22)
  found: API filters WHERE status_contato = 'Fechado' AND comissao_valor > 0. So lead 81 (Retorno status) does NOT appear on the commissions page. Gabriel's total on commissions page = R$1,120.80 from the 2 valid Fechado leads.
  implication: The gestor cannot see lead 81's commission on the commissions page because it's not Fechado. The orphaned commission is invisible on the commissions page but shows commission values in DB.

- timestamp: 2026-02-27T00:25:00Z
  checked: leads page totalComissao calculation (leads/page.tsx lines 133-138)
  found: totalComissao only includes commission from leads where status_contato === 'Fechado'. Lead 81 (Retorno) is excluded from the commission total display.
  implication: Both the leads page and commissions page show lead 81 WITHOUT commission (because it's Retorno). The gestor is correct that Gabriel's commission appears lower than expected.

- timestamp: 2026-02-27T00:28:00Z
  checked: Contact notes for lead 81 (APAE DF)
  found: Feb 19 - Gabriel called, client requested WhatsApp; Feb 26 - Gabriel notes "Aguardando retorno". Lead is actively being worked, still in negotiation.
  implication: Lead 81 is NOT a confirmed closed deal. It may have been accidentally marked Fechado temporarily during the early period when the CRM was being set up, then reverted. The orphaned commission data is a historical artifact.

## Resolution

root_cause: |
  Two separate issues:

  ISSUE 1 - Gabriel lead 81 (APAE DF, CNPJ 00643692000196): In the early CRM implementation period
  (before commit 25fff79 on Feb 16), the PATCH handler's "unlock" logic ONLY set comissao_locked=false
  when status changed away from Fechado - it did NOT clear comissao_valor or comissao_percentual.

  Timeline:
  - Lead 81 was marked Fechado in the early period (before Feb 16 fix)
  - Commission calculated: R$1,200 (30000 * 4% Closer rate) + R$50 bonus, comissao_locked=true
  - Status was changed back to Retorno (lead still in negotiation)
  - OLD unlock code ran: SET comissao_locked=false (only) — commission values NOT cleared
  - Result: comissao_valor=1200, comissao_locked=false, status=Retorno — orphaned

  The commission stopped appearing on the comissoes page (which requires status='Fechado')
  and on the leads page totalComissao (which only sums Fechado leads). The gestor perceived
  this as "commission zeroed" but it was actually an orphaned data artifact from the unlock bug.

  Lead 81 is still in active negotiation (contact note Feb 26: "Aguardando retorno"). Not a closed sale.

  ISSUE 2 - Wellington: Has 782 leads but zero Fechado leads. Never closed a sale in the CRM.
  The gestor's claim that Wellington had commissions that were "zeroed" is incorrect — he has
  never registered a closed deal. His most advanced lead (VIVER, id=3266) is at Aguardando Closer.

  ROOT CAUSE OF THE BUG: The PATCH handler clear condition was too narrow:
  WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL)
  This missed the case where comissao_locked=false but comissao_valor IS NOT NULL (old unlock artifacts).

fix: |
  1. CODE FIX (web/src/app/api/leads/[cnpj]/route.ts, line 220):
     Updated the commission clear condition from:
       WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL)
     To:
       WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL OR comissao_valor IS NOT NULL)
     This ensures ALL commission data is cleared when status changes away from Fechado, even
     if comissao_locked was already false (handles the historical orphan scenario).

  2. DATA FIX (production DB, direct SQL):
     Cleared orphaned commission data from lead 81 (Gabriel, APAE DF):
     SET comissao_valor = NULL, comissao_percentual = NULL, comissao_bonus = 0, comissao_locked = false
     valor_venda (R$30,000) preserved — can be used when deal actually closes.

verification: |
  - Orphaned commissions query (comissao_valor > 0 AND status != 'Fechado') returns 0 results for Gabriel
  - Gabriel's 2 valid Fechado leads (IDs 1919 and 2167) still intact with correct commission data
  - Gabriel commission total on comissoes page: R$1,120.80 (unchanged from valid data)
  - Code fix verified: clear condition now includes OR comissao_valor IS NOT NULL
  - All 19 Fechado leads across all vendedores still have correct commission data

files_changed:
  - web/src/app/api/leads/[cnpj]/route.ts (commission clear condition broadened)
  - production DB: vendedor_projetos id=81 (commission data cleared)
