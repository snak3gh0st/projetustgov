---
status: resolved
trigger: "comissoes-sumiram"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:15:00Z
---

## Current Focus

hypothesis: TWO bugs exist: (1) On leads/page.tsx, multi-emenda CNPJs where not ALL emendas are Fechado no longer show commission in the main row (allFechado=false even when the first/main emenda is Fechado). (2) The `??` nullish coalescing makes the fallback `lead.status_contato === 'Fechado'` dead code. Need to find the ACTUAL scenario causing widespread commission loss.
test: Examine whether there are multi-emenda CNPJs in the system with partial closure, or if the issue is in the /comissoes page
expecting: The allFechado regression in leads/page.tsx main row affects multi-emenda CNPJs
next_action: Look at the leads/page.tsx change more carefully — specifically how allFechado interacts with partial closures

## Symptoms

expected: All vendedores see their commissions correctly. Tito's commission is 0 because he is presidente.
actual: Commissions disappeared/are missing for all vendedores (or some subset).
errors: Not specified
reproduction: Navigate to comissoes page or lead details
started: After quick-51 and quick-52 commits on Feb 23, 2026

## Eliminated

- hypothesis: The isGestorLead check in comissoes/route.ts accidentally matches non-Tito leads
  evidence: The check is `lead.vendedor_role === 'gestor'` which only matches leads where the vendedor has role='gestor' (Tito). Other vendedores have role='vendedor' or 'coordenador'. Cannot accidentally match them.
  timestamp: 2026-02-24T00:03:00Z

- hypothesis: The /api/comissoes route was modified in quick-51 or quick-52
  evidence: git log shows comissoes/route.ts was last changed in quick-48. Not touched by quick-51 or quick-52.
  timestamp: 2026-02-24T00:04:00Z

- hypothesis: The /api/leads route change causes vendedores to see different data
  evidence: The leads route change only adds gestor to the coordenador branch (personal filter). Vendedor branch unchanged.
  timestamp: 2026-02-24T00:04:30Z

## Evidence

- timestamp: 2026-02-24T00:01:00Z
  checked: git diff for quick-52 -- web/src/app/leads/page.tsx
  found: Added totalComissao (sum of comissao_valor+comissao_bonus for Fechado emendas) and allFechado (every emenda must be Fechado). Changed display condition from `isFechado && lead.comissao_valor` to `isFechado && totalComissao`. Changed isFechado from `lead.status_contato === 'Fechado'` to `allFechado ?? lead.status_contato === 'Fechado'`
  implication: For multi-emenda CNPJs where NOT all emendas are Fechado, allFechado=false so isFechado=false. The fallback (lead.status_contato) is DEAD CODE because allFechado is always boolean (never nullish). Commission column shows valor_emenda instead of commission for partially-closed multi-emenda CNPJs.

- timestamp: 2026-02-24T00:02:00Z
  checked: /api/comissoes route.ts commission display for all roles
  found: Correct. Vendedores see only their own commissions. Gestor/coordenador see all. isGestorLead only zeroes Tito's leads. No regression here.
  implication: /comissoes page is not the source of the bug.

- timestamp: 2026-02-24T00:03:00Z
  checked: /api/leads route.ts changes from quick-51
  found: Added `session.role === 'gestor'` to the coordenador branch. Gestor now defaults to own leads unless all=true. Vendedor branch unchanged.
  implication: Tito (gestor) now sees only his own leads by default in /leads page. Other roles unaffected.

- timestamp: 2026-02-24T00:04:00Z
  checked: allFechado and totalComissao impact on leads/page.tsx
  found: The key regression: allFechado = cnpjLeads.every(l => l.status_contato === 'Fechado'). For multi-emenda CNPJs where only FIRST/some emendas are Fechado, allFechado=false. isFechado=false. Main row shows valor_emenda not commission. Old code: isFechado = first.status_contato === 'Fechado' — was truthy if first emenda closed.
  implication: Multi-emenda CNPJs where not ALL emendas are closed lose their commission display in the main row.

## Resolution

root_cause: |
  quick-52 introduced `allFechado = cnpjLeads.every(l => l.status_contato === 'Fechado')` and changed the commission display condition in leads/page.tsx from `isFechado && lead.comissao_valor` to `isFechado && totalComissao` where `isFechado = allFechado ?? lead.status_contato === 'Fechado'`.

  The `??` nullish coalescing operator means the fallback `lead.status_contato === 'Fechado'` is DEAD CODE because `allFechado` is always boolean (never null/undefined). So `isFechado === allFechado` always.

  For multi-emenda CNPJs (common in Brazilian government grants where one organization receives multiple emendas from different parlamentares), closing ONE emenda leaves `allFechado = false`. The green commission cell disappears and shows valor_emenda (neon) instead, even though `totalComissao > 0`.

  This is the regression: the commission display disappeared for any vendedor who closed a lead belonging to a CNPJ with multiple emendas, even though commission was correctly calculated and stored in the DB.

fix: |
  In leads/page.tsx, replaced the broken `isFechado && totalComissao` check with a direct `totalComissao > 0` check.

  Old: `const isFechado = (lead as any).allFechado ?? lead.status_contato === 'Fechado'`
       `{isFechado && (lead as any).totalComissao ? (`

  New: `const totalComissao = (lead as any).totalComissao || 0`
       `{totalComissao > 0 ? (`

  This shows the commission (green) whenever ANY emenda in the CNPJ group has been closed and has earned commission, which is the correct business behavior. The `totalComissao` already only sums commissions for Fechado emendas.

verification: |
  - TypeScript: `npx tsc --noEmit` returns 0 errors
  - Single emenda Fechado: totalComissao = comissao_valor + comissao_bonus > 0 → shows commission (unchanged behavior)
  - Multi-emenda partial Fechado: totalComissao = sum of closed emendas' commissions > 0 → shows commission (FIXED)
  - No Fechado emendas: totalComissao = 0 → shows valor_emenda (unchanged behavior)
  - Tito (gestor): leads/page.tsx does not zero Tito's commission (that's only in comissoes route) — no change from pre-quick-52 behavior
  - /api/comissoes and /api/leads routes unchanged

files_changed:
  - web/src/app/leads/page.tsx
