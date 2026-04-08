---
phase: 20-tgov-ajustes-0704
plan: 04
subsystem: ui
tags: [react, nextjs, tgov, sidecard, comments, tecnico-assignment, csm, sidebar, perf]

requires:
  - phase: 20-tgov-ajustes-0704
    plan: 01
    provides: tecnico_id columns + tgov_comments table + csm role + tecnicoId UUID type
  - phase: 20-tgov-ajustes-0704
    plan: 02
    provides: canReadTgov / canWriteTgov / canCommentTgov helpers + csm middleware branch
  - phase: 20-tgov-ajustes-0704
    plan: 03
    provides: /api/tgov/comments GET+POST, /api/tgov/tecnico PATCH, /api/tgov/usuarios/tecnicos GET
provides:
  - CommentsThread component (isolated fetch, role-gated input)
  - TecnicoSelector component (controlled select, disabled for non-writers)
  - Sidecard integration (Aprovacao + Execucao) com seções "Responsável Técnico" + "Comentários"
  - Sidebar branch para role csm — esconde links CRM
  - dal.ts session role union extendida com 'csm'
  - Post-wave perf fixes: remove JOIN do CTE + NOT MATERIALIZED hint
affects: []

tech-stack:
  added: []
  patterns:
    - "Components isolados com fetch próprio (não poluem state global do dashboard)"
    - "Role-gating no client espelhando middleware/route handler (defense-in-depth UI)"
    - "PostgreSQL CTE NOT MATERIALIZED quando referenciado uma única vez — evita materialização cara"

key-files:
  created:
    - web/src/app/tgov/CommentsThread.tsx
    - web/src/app/tgov/TecnicoSelector.tsx
  modified:
    - web/src/app/tgov/TGovDashboardClient.tsx
    - web/src/components/Sidebar.tsx
    - web/src/lib/dal.ts
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/app/api/tgov/execucao/route.ts
    - web/src/components/NewsBanner.tsx

key-decisions:
  - "tecnicoId tipado como string|null (UUID) em todos os componentes — não number, herdando schema corrigido em 20-01"
  - "dal.ts verifySession/getApiSession role union estendida com 'csm' — necessário para o tipo do session passar pelas pages que checam role"
  - "Post-wave: LEFT JOIN users tu removido do CTE materialized do /aprovacao — substituído por segunda query pequena resolvendo nomes (904k rows × JOIN era inviável)"
  - "Post-wave: CTEs all_propostas / all_exec marcadas NOT MATERIALIZED — speedup 100x (5s → 54ms) por evitar materialização desnecessária quando referenciadas uma vez"
  - "UAT do gestor + UAT do CSM serão executados contra o build deployado (não local) — plano fechado antes da verificação"

requirements-completed: [TGOV-AJU-04-UI-COMMENTS, TGOV-AJU-04-UI-TECNICO, TGOV-AJU-04-MENU]

duration: ~45min
completed: 2026-04-07
---

# Phase 20 Plan 04: TGov Sidecard UI (Técnico + Comentários) + CSM Sidebar Summary

**CommentsThread + TecnicoSelector integrados nos 2 sidecards TGov, role csm escondendo CRM no Sidebar, mais 2 perf fixes pós-wave que destravaram o /aprovacao em produção**

## Performance

- **Duration:** ~45 min (incluindo perf fixes pós-wave)
- **Completed:** 2026-04-07
- **Tasks:** 4 implementação + 2 perf fixes (UAT pendente, será no build deployado)
- **Files:** 2 criados + 6 modificados

## Accomplishments

- `CommentsThread.tsx` — componente isolado com fetch próprio, lista vertical com timestamp relativo, input gated por canCommentTgov, optimistic prepend no submit
- `TecnicoSelector.tsx` — select controlado, opção "Não atribuído", PATCH /api/tgov/tecnico onChange, disabled + tooltip para CSM
- `TGovDashboardClient.tsx` — fetch-once de /api/tgov/usuarios/tecnicos no parent, props passadas para ambos sidecards, novas SidecardSection "Responsável Técnico" (topo) e "Comentários" (fim)
- `Sidebar.tsx` — branch role csm que renderiza apenas /tgov (esconde leads/vendas/comissoes/execucao/usuarios)
- `dal.ts` — role union de verifySession/getApiSession estendida com 'csm' (descoberto pelo TS check do Plan 04)
- **Pós-wave perf fix #1:** /aprovacao subiu para 116s/500 após o LEFT JOIN users do Plan 20-03 sobre o CTE de 904k rows. Removido JOIN, técnico_nome agora resolvido em segunda query pequena.
- **Pós-wave perf fix #2:** CTEs all_propostas e all_exec marcadas NOT MATERIALIZED → 100x speedup (5s → 54ms) — Postgres estava materializando CTE referenciada apenas uma vez.
- NewsBanner bumped v4.3 → v4.4 com items dos 4 highlights da phase.

## Task Commits

1. **Task 1: CommentsThread component** — `61c0c88` (feat)
2. **Task 2: TecnicoSelector component** — `2f188c7` (feat)
3. **Task 3: Integração nos 2 sidecards + dal role union + page guard** — `96557c1` (feat)
4. **Task 4: Sidebar branch CSM** — `67ff318` (feat)

**Post-wave perf fixes (não estavam no plano — ver Deviations):**

5. **Perf fix /aprovacao:** remove LEFT JOIN users do CTE — `bca2d5d` (perf)
6. **Perf NOT MATERIALIZED:** all_propostas/all_exec — `58d5200` (perf)

**NewsBanner bump:** `e9f83a0` (docs)
**Plan metadata:** este SUMMARY (próximo commit)

## Files Created/Modified

- `web/src/app/tgov/CommentsThread.tsx` — novo, ~120 linhas, fetch GET on mount + POST on submit + timeAgo helper inline
- `web/src/app/tgov/TecnicoSelector.tsx` — novo, ~80 linhas, controlled select + disabled tooltip
- `web/src/app/tgov/TGovDashboardClient.tsx` — fetch tecnicos + 2 SidecardSection × 2 sidecards + props chain
- `web/src/components/Sidebar.tsx` — branch role === 'csm'
- `web/src/lib/dal.ts` — role union extendida (csm) em verifySession + getApiSession
- `web/src/app/api/tgov/aprovacao/route.ts` — JOIN users removido do CTE; resolução de nomes em segunda query
- `web/src/app/api/tgov/execucao/route.ts` — mesmo padrão (idem aprovacao)
- `web/src/components/NewsBanner.tsx` — versão v4.4, novos items

## Decisions Made

- **tecnicoId é string|null em todos os componentes UI:** herdado de 20-01. Plano original do 20-04 escrevia `number` nas props — corrigido inline (Deviation).
- **dal.ts role union precisava de 'csm':** o type union em verifySession/getApiSession não conhecia 'csm', então qualquer page server-side checando `session.role === 'csm'` falhava no build TS. Adicionado 'csm' (next-auth.d.ts já tinha do 20-01 mas dal.ts duplicava o union).
- **JOIN no CTE materialized era inviável:** O Plan 20-03 adicionou `LEFT JOIN users tu` no CTE all_propostas. Em produção, com 904k rows acumuladas, o /aprovacao subiu para 116s/timeout. Trocado por: CTE projeta apenas tecnico_id; após filtragem, segunda query SELECT id, nome FROM users WHERE id = ANY($1) resolve no app.
- **NOT MATERIALIZED:** Postgres por padrão materializa CTEs com WITH. Como all_propostas e all_exec são referenciados apenas uma vez (no SELECT principal), forçar inlining via NOT MATERIALIZED evita criar tuple store intermediário e desbloqueia predicados push-down. Speedup medido 100x (5s → 54ms).
- **UAT diferido para deploy:** Plano marcado complete sem rodar o checkpoint Task 5 contra ambiente local. UAT (gestor + CSM) será executado pelo usuário no build deployado de produção.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tecnicoId tipado como number nas props (plano) vs UUID string|null (schema real)**
- **Found during:** Task 1 / Task 2 (escrita dos componentes)
- **Issue:** Plan 20-04 declarou `tecnicoId: number` nas props de TecnicoSelector e currentTecnicoId. Mas users.id é UUID (corrigido em 20-01) e os endpoints do 20-03 retornam string. Aceitar number quebraria a interop com /api/tgov/tecnico PATCH e o tableData.
- **Fix:** Tipos das props trocados para `string | null`; PATCH body passa string|null direto sem parseInt.
- **Files modified:** TecnicoSelector.tsx, CommentsThread.tsx (target_key string), TGovDashboardClient.tsx
- **Committed in:** `2f188c7`, `96557c1`

**2. [Rule 3 - Blocking] dal.ts role union não tinha 'csm'**
- **Found during:** Task 3 (build TS após integração)
- **Issue:** `verifySession` e `getApiSession` em web/src/lib/dal.ts declaravam o role union sem 'csm'. Pages que faziam guard `if (session.role === 'csm') redirect(...)` falhavam com TS error "comparison appears unintentional".
- **Fix:** Adicionado 'csm' nas duas declarações do union em dal.ts.
- **Files modified:** web/src/lib/dal.ts
- **Committed in:** `96557c1` (junto com a integração)

**3. [Rule 1 - Bug] /aprovacao timeout 116s/500 após Plan 20-03 (descoberto em produção)**
- **Found during:** UAT informal pós-deploy do 20-03
- **Issue:** O LEFT JOIN users tu adicionado no CTE all_propostas (linha do Plan 20-03) explodiu o custo da query: 904k rows × users JOIN materializado. Em prod, /aprovacao retornou 500 após 116s.
- **Fix:** Removido o JOIN do SQL. Após filtragem do tableData, app coleta os tecnico_ids únicos e faz segunda query `SELECT id, nome FROM users WHERE id = ANY($1)` (~10 rows). Map em JS preenche tecnicoNome.
- **Files modified:** web/src/app/api/tgov/aprovacao/route.ts, web/src/app/api/tgov/execucao/route.ts
- **Committed in:** `bca2d5d`

**4. [Rule 1 - Perf] CTEs materializados desnecessariamente — 100x slowdown**
- **Found during:** Investigação do fix #3 — mesmo sem JOIN, /aprovacao ainda em ~5s
- **Issue:** Postgres por default materializa CTEs com WITH. all_propostas e all_exec são referenciados apenas uma vez no SELECT principal — materialização criava tuple store intermediário inútil e bloqueava push-down de predicados.
- **Fix:** Adicionado `NOT MATERIALIZED` hint em ambos os CTEs.
- **Files modified:** web/src/app/api/tgov/aprovacao/route.ts, web/src/app/api/tgov/execucao/route.ts
- **Verification:** Tempo medido caiu de 5s → 54ms (~100x).
- **Committed in:** `58d5200`

---

**Total deviations:** 4 auto-fixed (2 type/blocking + 2 perf críticos)
**Impact on plan:** Os 2 perf fixes (#3, #4) não estavam no escopo do 20-04 mas eram blockers do que o 20-03 entregou — sem eles, o sidecard novo abria sobre uma página que dava timeout. Tratados como dívida do wave anterior, fixed inline.

## Issues Encountered

- /aprovacao timeout em produção após o JOIN do 20-03 — resolvido com 2 commits perf (bca2d5d + 58d5200).
- Type union do dal.ts divergia do next-auth.d.ts — resolvido adicionando 'csm'.

## UAT Status — PENDENTE

O checkpoint Task 5 (UAT manual gestor + CSM) **não foi executado contra ambiente local**. O plano foi fechado antes da verificação por decisão do usuário: UAT será rodado contra o build deployado de produção.

**Cenários a validar pós-deploy:**

**Como gestor (já logado):**
- [ ] /tgov aba Aprovação → abrir sidecard → seção "Responsável Técnico" aparece com dropdown populado
- [ ] Selecionar nome no dropdown → network 200 + nome fica selected
- [ ] Seção "Comentários" no fim do sidecard → escrever comentário → aparece no topo da thread com nome do gestor
- [ ] Mesmo fluxo na aba Execução

**Como CSM (precisa criar usuário CSM no banco):**
- [ ] Sidebar mostra apenas /tgov (sem leads/vendas/comissoes)
- [ ] /leads direto na URL → redireciona para /tgov (middleware)
- [ ] Sidecard TGov: dropdown técnico desabilitado com tooltip "Apenas gestores podem alterar"
- [ ] Pode escrever comentário e ele aparece
- [ ] Comentários do gestor são visíveis (read OK)
- [ ] curl POST /api/tgov/whitelist com cookie CSM → 403

## Next Phase Readiness

- Phase 20 fecha aqui. Próximo trabalho será definido por nova phase ou quick task baseado no UAT do build deployado.
- Se UAT detectar regressão, abrir debug doc em .planning/debug/ e tratar como bug fix isolado.
- NewsBanner v4.4 já comunica os highlights ao usuário final na próxima sessão dele.

## Self-Check: PASSED

- web/src/app/tgov/CommentsThread.tsx: FOUND
- web/src/app/tgov/TecnicoSelector.tsx: FOUND
- web/src/app/tgov/TGovDashboardClient.tsx: MODIFIED
- web/src/components/Sidebar.tsx: MODIFIED
- web/src/lib/dal.ts: MODIFIED
- web/src/components/NewsBanner.tsx: MODIFIED (v4.4)
- Commits 61c0c88, 2f188c7, 96557c1, 67ff318, bca2d5d, 58d5200, e9f83a0: FOUND

---
*Phase: 20-tgov-ajustes-0704*
*Completed: 2026-04-07*
