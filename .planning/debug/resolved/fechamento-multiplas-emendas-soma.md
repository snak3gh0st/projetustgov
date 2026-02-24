---
status: resolved
trigger: "fechamento-multiplas-emendas-soma"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:30:00Z
---

## Current Focus

hypothesis: RESOLVED - Two bugs found and fixed.
test: Fixed comissoes/route.ts summary totals and leads/page.tsx locked status display
expecting: Summary totals now match sum of visible table rows; lock icon correctly reflects all Fechado emendas
next_action: Done

## Symptoms

expected: Exibir valor correto no faturamento (soma de todas as emendas fechadas)
actual: Valor incorreto - provavelmente mostra só uma emenda ou valor parcial
errors: Nenhum erro visível
reproduction: CNPJ com múltiplas emendas, algumas ou todas fechadas
started: Desconhecido

## Eliminated

- hypothesis: valor_venda is being duplicated across emendas automatically
  evidence: PATCH handler only updates WHERE id = $projectId (single emenda). No propagation code found.
  timestamp: 2026-02-24T00:20:00Z

- hypothesis: totalComissao on leads page is not summing all Fechado emendas
  evidence: Lines 133-138 of leads/page.tsx correctly reduce all cnpjLeads where status='Fechado'. Quick-52 already fixed allFechado dependency.
  timestamp: 2026-02-24T00:20:00Z

## Evidence

- timestamp: 2026-02-24T00:10:00Z
  checked: comissoes/route.ts lines 93-104, 233-271
  found: summary query uses raw SQL SUM(comissao_valor) which includes gestor-role leads. mappedLeads zeroes comissao_valor/comissao_bonus for isGestorLead leads. total_bonus was already recomputed from mappedLeads (line 264) but total_comissao and total_closer_comissao were not (lines 270-272 used raw SQL).
  implication: If gestor-role vendedor (Tito) has Fechado leads with comissao_valor > 0, summary total_comissao > sum of visible table rows. User sees header card showing higher total than table rows sum.

- timestamp: 2026-02-24T00:10:00Z
  checked: leads/page.tsx lines 133-148, 421-438
  found: totalComissao correctly sums comissao_valor + comissao_bonus for all Fechado emendas of a CNPJ. But comissao_locked (lines 431, 437) came from ...first (first emenda by valor_emenda DESC), not from checking all Fechado emendas. First emenda may not be the Fechado one.
  implication: Lock icon/Confirmada text could show incorrectly when first emenda is not the locked/Fechado one.

- timestamp: 2026-02-24T00:15:00Z
  checked: comissoes/route.ts total_valor_venda vs mappedLeads
  found: total_valor_venda uses raw SQL SUM(valor_venda). valor_venda is NOT zeroed in mappedLeads for gestor leads (only comissao_valor and comissao_bonus are zeroed). Faturamento total value is consistent with what table shows.
  implication: Not a bug - faturamento total is consistent.

## Resolution

root_cause: |
  Two bugs:

  1. comissoes/route.ts: summary total_comissao and total_closer_comissao used raw SQL sums which included gestor-role vendedor leads. However mappedLeads (the individual row data) zeroes comissao_valor for isGestorLead. This caused the header summary cards to show higher totals than the sum of visible table rows - appearing as if "extra" commission was being counted.

  2. leads/page.tsx: The comissao_locked status for a CNPJ group came from ...first (the first emenda by valor_emenda DESC). For a CNPJ where the highest-value emenda is NOT Fechado but lower-value ones are, the lock icon would never show. Conversely if first was Fechado but others were not, it would show locked even with partial locks.

fix: |
  1. comissoes/route.ts: Added total_comissao_corrected and total_closer_comissao_corrected computed from mappedLeads (after isGestorLead zeroing). Both now consistent with total_bonus_corrected which was already doing this correctly.

  2. leads/page.tsx: Added allFechadoLocked computed as fechadoLeads.every(l => l.comissao_locked). Replaced lead.comissao_locked with allFechadoLocked in the lock icon and Confirmada text display.

verification: Code review - fixes ensure summary totals are computed from the same data source as the table display. Lock status reflects all Fechado emendas rather than just the first emenda.

files_changed:
  - web/src/app/api/comissoes/route.ts
  - web/src/app/leads/page.tsx
