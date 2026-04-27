---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: CSM & Customer Success
status: defining
stopped_at: Defining requirements for v6.0
last_updated: "2026-04-27T00:00:00.000Z"
last_activity: 2026-04-27
progress:
  total_phases: 21
  completed_phases: 21
  total_plans: 41
  completed_plans: 41
---

# Project State: PROJETUS — v6.0 CSM & Customer Success

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-27)

**Core value:** CRM de vendas com inteligencia automatizada sobre propostas e projetos em execucao do Transfer Gov, agora com area de Customer Success para upsell/cross-sell pos-venda.
**Current focus:** Defining requirements for v6.0

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-27 — Milestone v6.0 started

Progress (v5.0): [██████████] 100% (Complete)

**Milestone v1.0:** Complete (Phases 1, 2, 4, 5)
**Milestone v2.0:** Superseded by Next.js migration (Phases 6-8)
**Milestone v3.0:** Complete (Phases 10-13 + 74 quick tasks)
**Milestone v4.0:** COMPLETE (Phases 14-18)
**Milestone v5.0:** COMPLETE (Phases 19-21)
**Milestone v6.0:** IN PROGRESS — defining requirements

## Accumulated Context

### Key Decisions (v5.0)

| Decision | Rationale |
|----------|-----------|
| csm role adicionado ao DB enum (Phase 20-01) | next-auth.d.ts + dal.ts estendidos; perfil CSM criado na fase 20 mas pipeline dedicado fica para v6.0 |
| Crons migrados de Vercel para sigmadb systemd timers | Vercel sync crons removidos em ee5fb71; timers gerenciados no servidor dedicado postgres |
| NOT MATERIALIZED nos CTEs all_propostas/all_exec (Plan 20-04) | Postgres materializava CTE referenciada uma unica vez; hint forca inlining e desbloqueia push-down — speedup 100x (5s → 54ms) |
| prestacao_contas tab mapeia para /api/tgov/execucao?mode=prestacao_contas | Reutiliza rota execucao com filtro ILIKE — evita nova rota |
| APROVACAO_ONLY_ROLES e EXECUCAO_ONLY_ROLES exportados de tgov.ts | Centraliza constantes de grupos de roles para tab isolation |

### Quick Tasks Completed (v5.0 + recent)

| # | Description | Date | Commit |
|---|-------------|------|--------|
| 260401-e9r | Filter TGov aprovacao/execucao tabs to Projetus proposals whitelist (246 IDs) | 2026-04-01 | e3c7025 |
| 260401-kvp | Restringir visoes do ADM Produto: apenas Pipeline TGOV, Usuarios TGOV e TGOV Dashboard | 2026-04-01 | 07eeeab |
| 260410-kmx | Ultima coluna prestacao de contas: Atraso/Em tempo baseado em Limite PC | 2026-04-10 | 9bd8b04 |
| 260414-jby | Contact CSV export restricted to gestor/admin | 2026-04-14 | b189d32 |
| 260416-eoq | Remove projetista_execucao from TGov execution access | 2026-04-16 | d45d8ad |
| 260416-fep | TGOV Aprovacao: campo Vencimento com date picker + badge Vencida/Em tempo | 2026-04-16 | c459ec3 |
| 260416-gmd | Clear tgov_comments on phase transitions; Tecnico column; novos roles PC | 2026-04-16 | 619b92c |

### Technical Context (v5.0 Stack)

- **Role csm:** Existe no DB enum e no next-auth.d.ts/dal.ts — pipeline dedicado a implementar em v6.0
- **tgov.ts:** Contratos compartilhados (TGovRow, TGovFilters, APROVACAO_ONLY_ROLES, EXECUCAO_ONLY_ROLES)
- **API TGov:** /api/tgov/aprovacao, /api/tgov/execucao (com mode=prestacao_contas), /api/tgov/tecnico, /api/tgov/interaction/[key]
- **Tags execucao:** Lobby, Desembolso, Rendimento, Autossuficiente, Iniciante — usaveis como base para CSM priority levels
- **Plano de Aplicacao Detalhado:** disponivel em propostas/convenios via TransfereGov — precisa de nova API/join para expor itens orcamentarios

## Session Continuity

Last session: 2026-04-27
Stopped at: Started v6.0 milestone definition
