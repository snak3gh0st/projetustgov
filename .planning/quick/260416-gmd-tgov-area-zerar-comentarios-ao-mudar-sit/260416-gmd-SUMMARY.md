---
phase: quick
plan: 260416-gmd
subsystem: tgov
tags: [tgov, roles, email, sync, ui]
tech_stack:
  added: []
  patterns: [isMajorPhaseTransition helper, PRESTACAO_ONLY_ROLES tab isolation, diligenciaEmail template]
key_files:
  created: []
  modified:
    - web/src/lib/tgov-only-sync.ts
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/types/next-auth.d.ts
    - web/src/lib/dal.ts
    - web/src/lib/tgov.ts
    - web/src/lib/email-service.ts
    - web/src/lib/email-templates.ts
decisions:
  - PRESTACAO_ONLY_ROLES mirrors APROVACAO_ONLY_ROLES/EXECUCAO_ONLY_ROLES pattern for symmetric tab isolation
  - isMajorPhaseTransition runs AFTER notifications so comment context is preserved in email; DELETE happens post-notification
  - diligenciaEmail uses propostaCard() helper for consistency with other templates
metrics:
  duration: ~10 min
  completed: 2026-04-16T16:05:18Z
---

# Quick Task 260416-gmd: TGov Area — Zerar Comentarios ao Mudar Situacao + PC Coordenacao

**One-liner:** Comment clearing on major phase transitions (aprovacao->execucao->prestacao_contas), Tecnico column replacing Coments in aprovacao table, coord_prestacao/assistente_prestacao roles with PRESTACAO_ONLY_ROLES tab isolation, and diligenciaEmail template with 6-field proposal details.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Clear comments on situacao change + replace Coments column with Tecnico | 9e85363 | tgov-only-sync.ts, TGovDashboardClient.tsx |
| 2 | Add PC Coordenacao roles + diligencia email template | 619b92c | next-auth.d.ts, dal.ts, tgov.ts, email-templates.ts, email-service.ts, TGovDashboardClient.tsx |

## What Was Built

### Task 1: Sync comment clearing + UI column

**tgov-only-sync.ts:**
- Added `isMajorPhaseTransition(oldSituacao, newSituacao): boolean` helper that normalizes to lowercase and checks: aprovacao-phase → execucao-phase, or execucao-phase → prestacao_contas-phase
- After the notification fire-and-forget, runs `DELETE FROM tgov_comments WHERE target_key = $1 AND target_type = 'proposta'` and `UPDATE tgov_interactions SET obs = NULL WHERE item_key = $1` when a major phase transition is detected
- Logs: `[tgov-only-sync] cleared comments for ${nrProposta} (${oldSituacao} -> ${newSituacao})`

**TGovDashboardClient.tsx (AprovacaoTable):**
- Replaced `<th>Coments.</th>` with `<SortableTh label="Tecnico" col="tecnicoNome" ...>`
- Replaced comment count SVG badge cell with `<td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[120px]">{row.tecnicoNome || <span>—</span>}</td>`
- Column count stays at 7 (SkeletonRows unchanged)

### Task 2: PC Coordenacao roles + diligencia email

**next-auth.d.ts:** Added `'coord_prestacao' | 'assistente_prestacao'` to all three role union types (Session.user.role, User.role, JWT.role)

**dal.ts:**
- Extended `Role` type union with `coord_prestacao | assistente_prestacao`
- Added new roles to `ROLE_CAN_CREATE` and `ROLE_CAN_DELETE` for gestor, admin, adm_produto
- `canReadTgov`, `canWriteTgov`, `canCommentTgov`: added `|| role === 'coord_prestacao' || role === 'assistente_prestacao'`

**tgov.ts:** Added `export const PRESTACAO_ONLY_ROLES = ['coord_prestacao', 'assistente_prestacao'] as const`

**TGovDashboardClient.tsx:**
- Imported `PRESTACAO_ONLY_ROLES`
- `initialTab` computation: PRESTACAO_ONLY_ROLES → `'prestacao_contas'` (highest priority), then EXECUCAO_ONLY_ROLES → `'execucao'`, then DEFAULT_TGOV_TAB
- Tab visibility filter: added `if (isPrestacaoRole && tab !== 'prestacao_contas') return false` — symmetric with aprovacao/execucao isolation

**email-service.ts:**
- Added `'coord_prestacao', 'assistente_prestacao'` to `TGOV_ROLES` array
- Imported `diligenciaEmail` from email-templates
- Added `sendDiligenciaEmail(params)` function: loads users by recipientIds, filters by TGOV_ROLES, sends diligenciaEmail to each

**email-templates.ts:** Added `diligenciaEmail(opts)` template with:
- Subject: `Projetus — Diligencia (${numeroProposta})`
- Heading: "Diligencia"
- Paragraph: "Ola {nome}, uma proposta requer a sua atencao."
- `propostaCard()` for the proposal number
- Six `infoRow()` fields: Numero da Proposta, Ministerio, Proponente, CNPJ (formatted), Situacao, Comentario
- CTA button: "Ver proposta" → propostaUrl

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` on main project: PASSED (0 errors)
- `grep coord_prestacao web/src/types/next-auth.d.ts`: found in all 3 union types
- `grep diligenciaEmail web/src/lib/email-templates.ts`: exported function present
- `grep 'DELETE FROM tgov_comments' web/src/lib/tgov-only-sync.ts`: comment clearing logic present
- `grep Tecnico web/src/app/tgov/TGovDashboardClient.tsx`: SortableTh with label "Tecnico" present

## Self-Check: PASSED

Files confirmed present:
- web/src/lib/tgov-only-sync.ts — modified (isMajorPhaseTransition + comment clearing)
- web/src/app/tgov/TGovDashboardClient.tsx — modified (Tecnico column + PRESTACAO_ONLY_ROLES)
- web/src/types/next-auth.d.ts — modified (coord_prestacao | assistente_prestacao)
- web/src/lib/dal.ts — modified (Role type + RBAC helpers)
- web/src/lib/tgov.ts — modified (PRESTACAO_ONLY_ROLES export)
- web/src/lib/email-templates.ts — modified (diligenciaEmail function)
- web/src/lib/email-service.ts — modified (sendDiligenciaEmail + TGOV_ROLES)

Commits confirmed:
- 9e85363 — Task 1
- 619b92c — Task 2
