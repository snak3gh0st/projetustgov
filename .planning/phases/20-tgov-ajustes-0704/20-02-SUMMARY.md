---
phase: 20-tgov-ajustes-0704
plan: 02
subsystem: rbac
tags: [rbac, middleware, csm, tgov, dal, refactor]

requires:
  - phase: 20-tgov-ajustes-0704
    plan: 01
    provides: 'csm' role no next-auth union
provides:
  - canReadTgov / canWriteTgov / canCommentTgov helpers em web/src/lib/dal.ts
  - Branch dedicada para role 'csm' no middleware (CRM blocked, TGov reads-only)
  - 5 routes TGov refatoradas (aprovacao, execucao, busca-cnpj, whitelist, interaction)
affects: [20-03, 20-04]

tech-stack:
  added: []
  patterns:
    - "Helpers RBAC centralizados em dal.ts evitam duplicação de role checks inline"
    - "Defense-in-depth: middleware bloqueia mutações privilegiadas + route handler valida via canWriteTgov"

key-files:
  modified:
    - web/src/lib/dal.ts
    - web/src/middleware.ts
    - web/src/app/api/tgov/aprovacao/route.ts
    - web/src/app/api/tgov/execucao/route.ts
    - web/src/app/api/tgov/busca-cnpj/route.ts
    - web/src/app/api/tgov/whitelist/route.ts
    - web/src/app/api/tgov/interaction/[key]/route.ts

key-decisions:
  - "Helpers aceitam role: string | undefined para tolerar sessões malformadas (false em ambos os casos)"
  - "Defense-in-depth: mesmo com middleware bloqueando csm em /api/tgov/whitelist e interaction, route handlers usam canWriteTgov para gate redundante"
  - "canCommentTgov criado já apesar do endpoint de comments só vir no Plan 03 — evita ida-e-volta no dal.ts"

requirements-completed: [TGOV-AJU-02-RBAC, TGOV-AJU-02-MIDDLEWARE]

duration: ~10min
completed: 2026-04-07
---

# Phase 20 Plan 02: RBAC Helpers + CSM Middleware Branch Summary

**3 helpers RBAC TGov em dal.ts, branch dedicada `csm` no middleware (CRM blocked + mutations bloqueadas), 5 routes refatoradas para usar helpers**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-07
- **Tasks:** 4 (todas auto)
- **Files modified:** 7

## Accomplishments

- 3 helpers RBAC criados em `web/src/lib/dal.ts`: canReadTgov, canWriteTgov, canCommentTgov
- Branch `role === 'csm'` no middleware com isolamento completo do CRM e mutation gate em /api/tgov/{whitelist, interaction, tecnico}
- 5 routes refatoradas — eliminadas 8 ocorrências de role check inline duplicado
- CSM agora pode ler GETs TGov (aprovacao, execucao, busca-cnpj, whitelist, interaction) e é bloqueado em todas as mutações privilegiadas
- `npx tsc --noEmit` passa sem erros

## Task Commits

1. **Task 1: Helpers RBAC em dal.ts** — `cada351` (feat)
2. **Task 2: Branch CSM no middleware** — `0a56e41` (feat)
3. **Task 3: Refator de 5 routes** — `93e64cd` (refactor)
4. **Task 4: UAT manual** — documentado abaixo (sem commit; doc-only)

## Files Modified

- `web/src/lib/dal.ts` — 3 helpers exportados após canModifyData
- `web/src/middleware.ts` — branch `role === 'csm'` espelha adm_produto + adiciona mutation gate
- `web/src/app/api/tgov/aprovacao/route.ts` — GET → canReadTgov
- `web/src/app/api/tgov/execucao/route.ts` — GET → canReadTgov
- `web/src/app/api/tgov/busca-cnpj/route.ts` — GET → canReadTgov
- `web/src/app/api/tgov/whitelist/route.ts` — GET → canReadTgov; POST/DELETE → canWriteTgov
- `web/src/app/api/tgov/interaction/[key]/route.ts` — GET → canReadTgov; PATCH → canWriteTgov

## Middleware Snippet Adicionado

```typescript
if (role === 'csm') {
  if (isCrmPage || isCrmHome) {
    return Response.redirect(new URL('/tgov', req.url))
  }
  if (isCrmApi) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const isTgovPrivilegedMutation =
    pathname.startsWith('/api/tgov/whitelist') ||
    pathname.startsWith('/api/tgov/interaction') ||
    pathname.startsWith('/api/tgov/tecnico')
  if (isTgovPrivilegedMutation && req.method !== 'GET') {
    return Response.json({ error: 'Forbidden: CSM is read-only on this resource' }, { status: 403 })
  }
}
```

## Cenários UAT Manual (pós Plan 04)

Após Plan 04 entregar UI de criação de usuário CSM, o gestor deve validar logado como CSM:

1. **GET TGov (esperado 200):** `curl -b cookies https://app/api/tgov/aprovacao?ano=2025` → JSON com dados
2. **POST whitelist (esperado 403):** `curl -X POST -b cookies https://app/api/tgov/whitelist -d '{"cnpj":"...","tab":"ambos"}'` → `{error:"Forbidden..."}`
3. **GET /leads no browser (esperado redirect):** abrir `/leads` → middleware redireciona para `/tgov`

**Blocker pós-deploy:** CSM user precisa existir no banco. Se não houver, criar manualmente via SQL/admin UI até Plan 04 entregar self-service.

## Deviations from Plan

None — plan executado exatamente como escrito. Build TS passou no primeiro try, sem auto-fixes necessários.

## Issues Encountered

Nenhum.

## Next Phase Readiness

- **Plan 03 (novos endpoints):** pode importar canReadTgov / canWriteTgov / canCommentTgov diretamente. Endpoint de comments deve usar canCommentTgov (já considera CSM).
- **Plan 04 (UI):** quando criar usuários CSM, a UI deve assumir que middleware já bloqueia CRM e que GETs TGov estão liberados. Sidecard de comments do CSM precisará chamar future POST /api/tgov/comments com canCommentTgov.

## Self-Check: PASSED

- web/src/lib/dal.ts: FOUND (canReadTgov, canWriteTgov, canCommentTgov presentes)
- web/src/middleware.ts: FOUND (role === 'csm' branch presente)
- 5 routes refatoradas: FOUND (grep "session.role !== 'gestor'" retornou vazio)
- Commits cada351, 0a56e41, 93e64cd: FOUND
- `npx tsc --noEmit`: PASSED

---
*Phase: 20-tgov-ajustes-0704*
*Completed: 2026-04-07*
