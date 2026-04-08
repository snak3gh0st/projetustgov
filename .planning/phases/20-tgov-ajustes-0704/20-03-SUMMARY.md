---
phase: 20-tgov-ajustes-0704
plan: 03
subsystem: api
tags: [tgov, api, comments, tecnico-assignment, cte, postgres]

requires:
  - phase: 20-tgov-ajustes-0704
    plan: 01
    provides: tecnico_id columns + tgov_comments table
  - phase: 20-tgov-ajustes-0704
    plan: 02
    provides: canReadTgov / canWriteTgov / canCommentTgov helpers
provides:
  - GET+POST /api/tgov/comments (sidecard de comentários por proposta/execução)
  - PATCH /api/tgov/tecnico (designação de técnico — UUID|null)
  - GET /api/tgov/usuarios/tecnicos (pool elegível)
  - tecnicoId/tecnicoNome em cada row de /api/tgov/aprovacao e /api/tgov/execucao
affects: [20-04]

tech-stack:
  added: []
  patterns:
    - "Multi-tabela UPDATE chain (propostas → tgov_propostas / projetos_execucao → tgov_projetos_execucao → fallback proposta) com early-exit por updated count"
    - "CTE branches projetam tecnico_id direto da tabela; LEFT JOIN users tu apenas na query final que monta tableData (mantém aggregations baratas)"

key-files:
  created:
    - web/src/app/api/tgov/comments/route.ts
    - web/src/app/api/tgov/tecnico/route.ts
    - web/src/app/api/tgov/usuarios/tecnicos/route.ts
  modified:
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/app/api/tgov/execucao/route.ts

key-decisions:
  - "tecnico_id é UUID (string) — não int — herdando schema corrigido em 20-01; validação por regex UUID v1-v5 antes de passar ao DB"
  - "PATCH /api/tgov/tecnico tenta CRM-scope primeiro (propostas / projetos_execucao), depois TGov-only (tgov_*); para execução sem convênio, fallback para proposta. Early-exit assim que updated > 0"
  - "tecnico_nome injetado via LEFT JOIN apenas na query final de tableData — não vai para CTE materialized para preservar custo das aggregations"
  - "users.ativo não existe (grep vazio em api/usuarios) — pool não filtra soft-delete"

requirements-completed: [TGOV-AJU-03-COMMENTS, TGOV-AJU-03-TECNICO, TGOV-AJU-03-CTE-JOIN]

duration: ~3min
completed: 2026-04-08
---

# Phase 20 Plan 03: TGov Comments + Técnico Assignment + CTE Join Summary

**3 endpoints novos (comments GET/POST, tecnico PATCH, usuarios/tecnicos GET) e 2 CTEs expandidos com tecnico_id + LEFT JOIN users — backend pronto para sidecard do Plan 04**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-04-08
- **Tasks:** 5 (todas auto)
- **Files:** 3 criados + 2 modificados

## Accomplishments

- `/api/tgov/comments` — GET lista por target_type/target_key com author_nome resolvido; POST insere com session.userId, valida target_type, body máx 5000 chars, retorna comentário com author_nome
- `/api/tgov/tecnico` — PATCH valida UUID, valida pool de roles, atualiza a tabela física correta com chain proposta→tgov_proposta / execucao→tgov_execucao / fallback proposta; 404 se nada bater
- `/api/tgov/usuarios/tecnicos` — GET retorna users com role IN (adm_produto, gestor, admin) ordenados por nome
- `aprovacao/route.ts` — ALL_PROPOSTAS_CTE projeta `p.tecnico_id` nas 2 branches; query final adiciona `LEFT JOIN users tu`; response inclui `tecnicoId/tecnicoNome`
- `execucao/route.ts` — ALL_EXEC_CTE projeta `tecnico_id` nas 4 branches (projetos_execucao, tgov_projetos_execucao, propostas, tgov_propostas); agg_table_data faz `LEFT JOIN users tu`; response inclui `tecnicoId/tecnicoNome`
- `npx tsc --noEmit` passou em 2 verificações (após Tasks 1-3 e após Tasks 4-5)

## Task Commits

1. **Task 1:** `/api/tgov/comments` GET+POST — `b5c0c21`
2. **Task 2:** `/api/tgov/tecnico` PATCH — `93d74a7`
3. **Task 3:** `/api/tgov/usuarios/tecnicos` GET — `3ff8a17`
4. **Task 4:** aprovacao CTE + LEFT JOIN users — `8d2035a`
5. **Task 5:** execucao CTE (4 branches) + LEFT JOIN users — `3174797`

## Endpoint Contracts

### GET /api/tgov/comments
- **Query:** `target_type=proposta|execucao`, `target_key=<nr_proposta | nr_convenio>`
- **403:** `!canReadTgov(role)` | **400:** target_type ou target_key ausentes
- **200:** `{ comments: [{ id, target_type, target_key, author_id, body, created_at, author_nome }] }` ordenado por created_at DESC

### POST /api/tgov/comments
- **Body:** `{ target_type, target_key, body }`
- **403:** `!canCommentTgov(role)` (CSM permitido) | **400:** validação | **201:** `{ comment: {...campos, author_nome} }`

### PATCH /api/tgov/tecnico
- **Body:** `{ target_type: 'proposta'|'execucao', target_key, tecnico_id: string|null }`
- **403:** `!canWriteTgov(role)` (CSM **bloqueado**, redundante com middleware) | **400:** target_type/key inválido, tecnico_id não-UUID, ou role fora do pool | **404:** registro não encontrado em nenhuma tabela | **200:** `{ ok: true, updated: number }`

### GET /api/tgov/usuarios/tecnicos
- **403:** `!canReadTgov(role)` | **200:** `{ tecnicos: [{ id, nome, email, role }] }`

## CTE Snippets — Antes/Depois

### aprovacao (ALL_PROPOSTAS_CTE branches)
**Antes:** `... p.modalidade, p.orgao_superior, p.orgao_vinculado FROM propostas p`
**Depois:** `... p.modalidade, p.orgao_superior, p.orgao_vinculado, p.tecnico_id FROM propostas p` (idem para tgov_propostas)

**Query final tableData:**
```sql
... ti.status AS internal_status,
    p.tecnico_id,
    tu.nome AS tecnico_nome
FROM all_propostas p
LEFT JOIN tgov_interactions ti ON ti.item_key = p.nr_proposta AND ti.tab = 'aprovacao'
LEFT JOIN users tu ON tu.id = p.tecnico_id
```

### execucao (ALL_EXEC_CTE — 4 branches)
**Antes (cada branch):** termina em `pe.dia_limite_prest_contas, pe.dias_prest_contas FROM ...`
**Depois:** `pe.dia_limite_prest_contas, pe.dias_prest_contas, pe.tecnico_id FROM ...`
- Branch 1 (projetos_execucao): `pe.tecnico_id`
- Branch 2 (tgov_projetos_execucao): `pe.tecnico_id`
- Branch 3 (propostas, fallback sem convênio): `p.tecnico_id`
- Branch 4 (tgov_propostas, idem): `p.tecnico_id`

**agg_table_data:**
```sql
... ti.status AS internal_status,
    pe.tecnico_id,
    tu.nome AS tecnico_nome
FROM filtered_table pe
LEFT JOIN tgov_interactions ti ON ti.item_key = pe.nr_convenio AND ti.tab = 'execucao'
LEFT JOIN users tu ON tu.id = pe.tecnico_id
```

## Decisions Made

- **UUID, não int (herdado de 20-01):** Todas as validações de tecnico_id em /tecnico PATCH usam regex UUID; chamadas SQL passam string ou null direto. Plan original assumia integer — corrigido inline durante Task 2.
- **LEFT JOIN só na query final, não no CTE materialized:** Aggregations (agg_status, agg_year, agg_prazos…) não precisam de tecnico_nome. Adicionar JOIN no `filtered_main` aumentaria custo de todas as agg sem benefício. JOIN só onde os rows são realmente projetados (table_data).
- **users.ativo não existe:** grep em `web/src/app/api/usuarios` retornou vazio. Pool de técnicos não aplica filtro de soft-delete.
- **Multi-tabela early-exit no PATCH:** Tabelas CRM (propostas / projetos_execucao) tentadas antes das TGov-only para refletir o caminho mais comum. Ordem para execucao: projetos_execucao → tgov_projetos_execucao → propostas → tgov_propostas.

## Files Created/Modified

- `web/src/app/api/tgov/comments/route.ts` — 112 linhas, GET+POST
- `web/src/app/api/tgov/tecnico/route.ts` — 115 linhas, PATCH com chain de UPDATEs
- `web/src/app/api/tgov/usuarios/tecnicos/route.ts` — 28 linhas, GET pool
- `web/src/app/api/tgov/aprovacao/route.ts` — +12/-3 (CTE 2 branches + JOIN + projeção + map)
- `web/src/app/api/tgov/execucao/route.ts` — +16/-5 (CTE 4 branches + tipo AggResult + JOIN + projeção + map)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tecnico_id é UUID, não integer**
- **Found during:** Task 2 (escrita do route)
- **Issue:** Plan 20-03 escreveu `if (typeof tecnico_id !== 'number' || !Number.isInteger(tecnico_id))`. Mas o Plan 20-01 SUMMARY já documenta que `users.id` é UUID e `tecnicoId: string | null`. Aceitar number quebraria FK no UPDATE.
- **Fix:** Validação trocada para regex UUID v1-v5 (`^[0-9a-f]{8}-...$`); tipo do payload é `string | null`; SQL recebe string|null direto.
- **Files modified:** web/src/app/api/tgov/tecnico/route.ts
- **Committed in:** `93d74a7`

**2. [Rule 1 - Bug] getApiSession está em @/lib/dal, não @/lib/auth**
- **Found during:** Task 1 (leitura do exemplo notes/route.ts)
- **Issue:** Plan 20-03 importava `getApiSession` de `@/lib/auth`. O arquivo real exporta de `@/lib/dal` (verificado em dal.ts:22).
- **Fix:** Imports dos 3 routes novos usam `@/lib/dal` para session+helpers (consistente com aprovacao/execucao já refatorados em 20-02).
- **Files modified:** comments/route.ts, tecnico/route.ts, usuarios/tecnicos/route.ts
- **Committed in:** `b5c0c21`, `93d74a7`, `3ff8a17`

**Total deviations:** 2 auto-fixed (Rule 1, ambos consistência com schema/imports já estabelecidos)

## Issues Encountered

Nenhum bloqueante. Type-check passou em ambas as rodadas (após Tasks 1-3 e após Tasks 4-5).

## Next Phase Readiness

- **Plan 04 (frontend):** pode consumir todos os contratos. Sidecard:
  - GET `/api/tgov/comments?target_type=proposta&target_key=<nr_proposta>` para listar
  - POST `/api/tgov/comments` com `{ target_type, target_key, body }` para criar
  - PATCH `/api/tgov/tecnico` com `tecnico_id: string|null` para designar/desatribuir
  - GET `/api/tgov/usuarios/tecnicos` para popular o select
  - Tabelas TGov agora retornam `tecnicoId/tecnicoNome` em cada row → exibir badge/avatar inline sem fetch extra
- **CSM:** consegue GET comments + POST comments, mas recebe 403 em PATCH /api/tgov/tecnico (defense-in-depth: middleware + canWriteTgov no handler).

## Self-Check: PASSED

- web/src/app/api/tgov/comments/route.ts: FOUND
- web/src/app/api/tgov/tecnico/route.ts: FOUND
- web/src/app/api/tgov/usuarios/tecnicos/route.ts: FOUND
- web/src/app/api/tgov/aprovacao/route.ts: MODIFIED (tecnico_id projeção + JOIN + map)
- web/src/app/api/tgov/execucao/route.ts: MODIFIED (4 branches + JOIN + map)
- Commits b5c0c21, 93d74a7, 3ff8a17, 8d2035a, 3174797: FOUND
- `npx tsc --noEmit`: PASSED

---
*Phase: 20-tgov-ajustes-0704*
*Completed: 2026-04-08*
