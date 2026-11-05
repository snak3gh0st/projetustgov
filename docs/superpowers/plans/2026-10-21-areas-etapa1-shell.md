# Áreas por equipe, etapa 1 (shell de áreas + diretoria + gestor só Comercial) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O PROJETE passa a ser organizado em áreas (Comercial, Operação TransfereGov, Financeiro, Gestão, Administração), com o papel novo `diretoria` (Philipe e Tito) e o gestor comercial (Rooger, papel `gestor`) restrito à Área Comercial, inclusive no servidor.

**Architecture:** As regras de papel puras saem de `lib/dal.ts` (que importa `server-only`) para `lib/roles.ts`, testável com `node:test`; `dal.ts` reexporta. Um modelo único `lib/areas.ts` (substitui `lib/sidebar-nav-items.ts`) define áreas, itens por papel, área atual e item ativo; Sidebar, MobileDrawer e uma barra de áreas nova consomem só ele. O bloqueio do gestor fora do Comercial fica num guard puro (`lib/area-access.ts`) chamado pelo middleware, mais a revisão das checagens `'gestor'` nas páginas e APIs.

**Tech Stack:** Next.js 14 app router, next-auth v5, Postgres (`pg`), Tailwind com tokens OKLCH, `motion/react` (`m.` com `LazyMotion` estrito), testes `tsx --test 'src/**/*.test.ts'`.

**Spec:** `docs/superpowers/specs/2026-10-21-areas-por-equipe-design.md`

## Global Constraints

- **Nada vai para a main nem para produção.** Trabalho na branch local `snak3gh0st/ui-redesign-fase1`, sem `git push`. O Paulo revisa em `http://localhost:3100` e só depois decide o merge.
- A migração roda **só no banco local** (`projete-devdb`, 127.0.0.1:55491). O SQL de produção fica escrito, não executado.
- O nome "hub" não aparece em lugar nenhum (código, UI, cópia). As divisões se chamam "áreas".
- Ninguém perde acesso a uma tela que usa hoje, exceto o papel `gestor`, que fica só no Comercial: perde Financeiro (BI Financeiro, Conta Azul), Operação TransfereGov (`/operacao` e telas `/tgov`), Usuários (vira "Equipe", só usuários do Comercial) e Saúde do sistema. A remoção vale no servidor, não só no menu.
- `diretoria` passa onde `gestor` passava, inclusive comissão e criação de usuários, e também nas telas de Operação, Financeiro e Administração (exceto Saúde do sistema, que é só admin).
- Comissão: vendedor e coordenador veem só a própria (como hoje); gestor e diretoria veem a da equipe; gestor_financeiro continua vendo `/comissoes` ("Comissões a pagar").
- Cópia em português, sem travessão; movimento 150 a 280 ms com `prefers-reduced-motion` respeitado; tokens da fase 1 (`bg-surface`, `text-ink`, `accent`...).
- Tela inicial: `/` continua sendo o Pipeline para Comercial, diretoria e admin nesta etapa (a Visão geral da Gestão é a etapa 5; nada de tela "em breve"). Redirecionamentos atuais do middleware (csm → `/csm`, papéis TGov → `/tgov`, gestor_financeiro → `/financeiro`) ficam como estão.
- Checagens SQL de dado (ex.: `u.role != 'gestor'` para tirar leads do gestor das somas) não mudam: elas descrevem quem é dono de lead, não acesso.

## Review Focus

1. Tela compartilhada por duas áreas (`/bi` no Comercial e na Gestão; `/financeiro` no Financeiro e na Gestão; `/comissoes` no Comercial e no Financeiro): a área atual precisa ser a que a pessoa escolheu, e o item certo fica ativo. Teste em Task 5.
2. Cookie de área apontando para uma área que o papel não tem (ex.: mudou de papel): deve ser ignorado e cair na área principal. Teste em Task 5.
3. Gestor abrindo link direto de `/tgov/...`, `/operacao`, `/financeiro` ou chamando `/api/tgov/...`: redireciona para `/sem-permissao` (página) ou 403 (API); e o sino de notificações (que chama `/api/tgov/notifications`) não aparece para o gestor. Teste em Task 4, conferência visual em Task 7.
4. Item ativo com query: `/tgov` e `/tgov?view=dashboard` não podem ficar ativos ao mesmo tempo; `/execucao` sem `fase` conta como `fase=execucao`. Teste em Task 5.
5. Papel no token desatualizado: o JWT relê o papel do banco a cada hora (`lib/auth.ts`), então quem virar `diretoria` pode continuar como `gestor` por até 1 h. Não é teste: vai no roteiro de produção (pedir novo login) em Task 7.

---

### Task 1: `lib/roles.ts` com o papel diretoria e as regras de acesso

**Files:**
- Create: `web/src/lib/roles.ts`
- Create: `web/src/lib/roles.test.ts`
- Modify: `web/src/lib/dal.ts:8-36, 79-175` (mover tipo, mapas e helpers puros para `roles.ts`; `dal.ts` faz `export * from './roles'` e mantém `verifySession`, `getApiSession`, `verifyLeadAccess`)

**Interfaces:**
- Produces (todos em `roles.ts`, reexportados por `dal.ts`, nomes atuais preservados):
  - `type Role` = lista atual + `'diretoria'`; `ALL_ROLES: readonly Role[]`
  - `ROLE_CAN_CREATE`, `ROLE_CAN_DELETE`, `canManageRole(actor: Role, target: Role): boolean`
  - `isSeller`, `buildVendedorFilter`, `canModifyData`, `canReadTgov`, `canReadOperacao`, `canWriteOperacao`, `canWriteTgov`, `canCommentTgov`, `canCsm`, `isAdmin`, `canManageContaAzul`, `canReadBiFinanceiro`, `canExportContacts` (mesmas assinaturas de hoje)
  - novo `hasTeamCommercialView(role: string | undefined | null): boolean` → `true` só para `gestor` e `diretoria`. Usado onde hoje se testa `role === 'gestor'` para ver comissão/números da equipe.
  - novo `seesAllLeads(role: string): boolean` → `gestor`, `visualizador`, `diretoria` (usado por `buildVendedorFilter` e `verifyLeadAccess`)

- [ ] **Step 1: Write the failing tests** em `roles.test.ts` (padrão de `sidebar-nav-items.test.ts`: `node:test` + `assert/strict`):
  - `diretoria can do everything gestor could, plus operação, tgov and finance`: para cada helper de leitura/escrita acima, `helper('diretoria') === true`.
  - `gestor is commercial only`: `canReadTgov`, `canWriteTgov`, `canCommentTgov`, `canReadOperacao`, `canWriteOperacao`, `canManageContaAzul`, `canReadBiFinanceiro` retornam `false` para `'gestor'`; `canCsm`, `canModifyData`, `canExportContacts`, `hasTeamCommercialView` retornam `true`.
  - `team commission view`: `hasTeamCommercialView` é `true` só para `gestor` e `diretoria` (iterar `ALL_ROLES`).
  - `gestor manages only commercial users`: `ROLE_CAN_CREATE.gestor` deep-equal `['vendedor', 'coordenador', 'csm', 'visualizador']`; idem `ROLE_CAN_DELETE.gestor`.
  - `diretoria manages what gestor managed`: `ROLE_CAN_CREATE.diretoria` deep-equal a lista atual de `gestor` (copiar de `dal.ts:12`) + `'gestor'`; idem DELETE.
  - `buildVendedorFilter('diretoria', id, 1)` devolve o mesmo que para `'gestor'` hoje (sem filtro).
- [ ] **Step 2: Run** `cd web && npx tsx --test src/lib/roles.test.ts` → FAIL (`Cannot find module './roles'`).
- [ ] **Step 3: Implement** `roles.ts` movendo o código de `dal.ts` e aplicando as trocas: tirar `gestor` e pôr `diretoria` em `canReadTgov`, `canReadOperacao`, `canWriteOperacao`, `canWriteTgov`, `canCommentTgov`, `canManageContaAzul`, `canReadBiFinanceiro`; pôr `diretoria` em `canCsm`, `canModifyData`, `canExportContacts`, `seesAllLeads`. Apagar `canReadFinanceiro` (sem uso: `grep -rn canReadFinanceiro src` só acha a definição). `dal.ts` reexporta e `verifyLeadAccess` usa `seesAllLeads`.
- [ ] **Step 4: Run** `npx tsx --test src/lib/roles.test.ts` → PASS; `npx tsc --noEmit` → sem erros.
- [ ] **Step 5: Commit** `feat(roles): add diretoria and restrict gestor to commercial in role rules`

### Task 2: Papel diretoria no banco local, listas de papéis e seed

**Files:**
- Create: `migrations/add_diretoria_role.sql`
- Modify: `web/src/lib/validations.ts` (enum de papéis), `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` (rótulos de papel), `web/src/app/api/setup-crm/route.ts` e `web/src/app/api/fundo-comercial/route.ts` (listas que contêm `gestor_financeiro`: incluir `diretoria` onde `gestor` estiver), `web/src/lib/types.ts:94` (`UserRole` + `'diretoria'`)
- Modify: `web/scripts/dev-db/seed.mjs:28-35` (usuários)

**Interfaces:**
- Consumes: `ALL_ROLES` (Task 1)
- Produces: constraint `users_role_check` aceitando `'diretoria'`; usuários locais `diretoria@dev.local` (Diretoria Teste), `csm@dev.local` (Carla CSM), `projetista@dev.local` (Paula Projetista), com a mesma senha de teste já definida no topo do `seed.mjs`.

- [ ] **Step 1:** Escrever `add_diretoria_role.sql`: `ALTER TABLE users DROP CONSTRAINT users_role_check; ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (...lista atual..., 'diretoria'));` dentro de `BEGIN/COMMIT`. No fim, **comentado**, o passo de produção: `-- UPDATE users SET role = 'diretoria' WHERE nome IN ('Philipe', 'Tito') AND role = 'gestor';` com a nota "rodar só com OK do Paulo; pedir novo login aos dois".
- [ ] **Step 2:** Aplicar só no local: `docker exec -i projete-devdb psql -U postgres -d projetus_hub < migrations/add_diretoria_role.sql` → `ALTER TABLE` duas vezes.
- [ ] **Step 3:** Incluir os três usuários no `USERS` do seed e rodar o seed (comando em `web/scripts/dev-db/README.md`) → termina sem erro; `SELECT role, count(*) FROM users WHERE email LIKE '%@dev.local' GROUP BY 1` mostra 9 usuários com `diretoria`, `csm`, `projetista`.
- [ ] **Step 4:** Atualizar as listas exaustivas de papéis (arquivos acima). Rótulo de `gestor` na UI de usuários passa a "Gestor comercial"; `diretoria` → "Diretoria". Run `npx tsc --noEmit` → limpo.
- [ ] **Step 5: Commit** `feat(roles): diretoria role in schema, validation and local seed`

### Task 3: Revisão das checagens `'gestor'` em páginas, componentes e APIs

**Files:** os arquivos de `grep -rln "'gestor'" web/src | grep -v test` (~60), exceto `lib/roles.ts`, `lib/dal.ts`, `lib/sidebar-nav-items.ts` (Task 5) e `middleware.ts` (Task 4).

**Interfaces:**
- Consumes: `hasTeamCommercialView`, `seesAllLeads`, helpers `can*` (Task 1)

Regra de classificação, aplicada a cada ocorrência:

| Tipo de checagem | O que fazer |
|---|---|
| Acesso a comercial, leads, distribuição, comissão, fundo comercial, BI comercial, CSM, produtos digitais, upload/import, debug/setup do CRM | aceitar também `diretoria` (preferir `hasTeamCommercialView` quando o teste é "vê equipe/comissão") |
| Acesso a TGov, Operação, Financeiro, Conta Azul (ex.: `ALLOWED_ROLES` de `tgov/page.tsx`, `tgov/pipeline/page.tsx`, `operacao/page.tsx`; `TGovDashboardClient`, `TecnicoSelector`, `CommentsThread`, `OperacaoClient`; `api/tgov/*`) | trocar `gestor` por `diretoria` |
| `USERS_PAGE_ROLES` em `cadastro-vendedor/page.tsx` e checagens de `api/usuarios/*` | manter `gestor` (vira "Equipe", limitado por `ROLE_CAN_CREATE`) e incluir `diretoria` |
| `BELL_ROLES` em `app/layout.tsx` (sino chama `/api/tgov/notifications`) | trocar `gestor` por `diretoria` |
| SQL que descreve dado (`u.role != 'gestor'`, `role IN ('gestor', ...)` para listar donos de lead) e `PRIMARY_LEAD_MANAGER_EMAIL` | não mudar |

- [ ] **Step 1:** Aplicar a tabela arquivo por arquivo.
- [ ] **Step 2: Verify** `grep -rn "'gestor'" web/src | grep -v test` e conferir que cada ocorrência restante cai numa linha da tabela; `npx tsc --noEmit` e `npm run lint` limpos; `npm test` passa.
- [ ] **Step 3: Commit** `refactor(roles): diretoria where gestor had access; gestor out of tgov, operação and finance`, com o corpo listando os arquivos por linha da tabela.

### Task 4: Guard de área no middleware

**Files:**
- Create: `web/src/lib/area-access.ts`, `web/src/lib/area-access.test.ts`
- Modify: `web/src/middleware.ts` (chamar o guard logo após obter `role`, **antes** do `return` de `isOperacaoPath`)

**Interfaces:**
- Produces: `commercialOnlyBlock(role: string | undefined, pathname: string): 'redirect' | 'forbid' | null`. Para `role === 'gestor'` e caminho em `['/tgov', '/api/tgov', '/operacao', '/api/operacao', '/financeiro', '/api/financeiro', '/admin', '/api/integrations/conta-azul']` (igual ou `startsWith(p + '/')`): `'forbid'` se começar com `/api/`, senão `'redirect'`. Qualquer outro caso: `null`. No middleware: `'redirect'` → `/sem-permissao`; `'forbid'` → JSON 403.

- [ ] **Step 1: Write the failing tests:** `gestor is redirected from /tgov/pipeline, /operacao, /financeiro/resultado, /admin/conta-azul, /admin/system-health`; `gestor gets forbid on /api/tgov/notifications, /api/operacao, /api/financeiro/sync, /api/integrations/conta-azul`; `gestor passes /, /leads, /comissoes, /bi, /csm, /cadastro-vendedor, /api/usuarios, /api/leads`; `diretoria and admin are never blocked` (mesmos caminhos → `null`); `/tgovx is not treated as /tgov`.
- [ ] **Step 2: Run** `npx tsx --test src/lib/area-access.test.ts` → FAIL.
- [ ] **Step 3: Implement** e ligar no middleware.
- [ ] **Step 4: Run** o teste → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(auth): keep gestor comercial inside the commercial area`

### Task 5: Modelo de áreas (`lib/areas.ts`)

**Files:**
- Create: `web/src/lib/areas.ts`, `web/src/lib/areas.test.ts`
- Delete: `web/src/lib/sidebar-nav-items.ts`, `web/src/lib/sidebar-nav-items.test.ts` (consumidores migram na Task 6)

**Interfaces:**
- Produces:
  - `type AreaId = 'comercial' | 'operacao' | 'financeiro' | 'gestao' | 'admin'`
  - `AREAS: Record<AreaId, { id: AreaId; label: string; short: string; icon: string }>` com rótulos `Comercial`, `Operação TransfereGov`, `Financeiro`, `Gestão`, `Administração`
  - `interface AreaNavItem { href: string; label: string; icon: string; section?: 'Gestão' }`
  - `getAreasForRole(role: Role): AreaId[]` (ordem fixa: a principal primeiro)
  - `primaryAreaForRole(role: Role): AreaId`
  - `getAreaNav(role: Role, area: AreaId): AreaNavItem[]`
  - `areaHome(role: Role, area: AreaId): string` = `getAreaNav(role, area)[0].href`
  - `isNavItemActive(href: string, pathname: string, search: URLSearchParams): boolean` (regras atuais de `Sidebar.tsx:157-169`)
  - `resolveArea(role: Role, pathname: string, search: URLSearchParams, preferred?: string | null): AreaId`: candidatas = áreas do papel com item ativo para o caminho; `preferred` vence se for candidata; senão a primeira candidata; sem candidata, a principal
  - `AREA_COOKIE = 'projete-area'`

Áreas por papel (principal em primeiro):

| Papel | Áreas |
|---|---|
| vendedor, coordenador, visualizador, gestor | comercial |
| csm | comercial, operacao |
| adm_produto, coord_aprovacao, assistente_aprovacao, projetista, coord_execucao, assistente_execucao, coord_prestacao, assistente_prestacao | operacao |
| gestor_financeiro | financeiro |
| diretoria | gestao, comercial, operacao, financeiro, admin |
| admin | comercial, operacao, financeiro, gestao, admin |

Itens por área (cada item lista os papéis que o veem; telas soltas ficam na área principal do papel):

- **comercial:** Pipeline `/` · Leads de aprovação `/leads` · Leads de execução `/execucao?fase=execucao` · Leads de prestação de contas `/execucao?fase=prestacao_contas` · Operação `/operacao` (vendedor, coordenador, visualizador: tela solta, como hoje) · CSM Clientes `/csm` · Comissões CSM `/csm/comissoes` · BI CSM `/csm/bi` · Comissões `/comissoes` · BI comercial `/bi` · seção Gestão: Distribuir leads `/distribuir`, Produtos Digitais `/produtos-digitais`, Equipe `/cadastro-vendedor` (só gestor). Papéis de cada item = os que o têm hoje em `getNavItemsForRole`, com `diretoria` onde `gestor` estava e `gestor` fora de `/operacao`. Para `csm`, Comercial mostra só os três itens de CSM (o middleware já bloqueia o resto do CRM para ele).
- **operacao:** Operação `/operacao` · Pipeline de instrumentos `/tgov/pipeline` · Painel de instrumentos `/tgov?view=dashboard` · Análises de instrumentos `/tgov` · Produtos Digitais `/produtos-digitais` (adm_produto) · Usuários TGov `/cadastro-vendedor` (adm_produto, coord_aprovacao, assistente_aprovacao, coord_execucao, coord_prestacao). Papéis = os de hoje, com `diretoria` no lugar de `gestor`.
- **financeiro:** BI Financeiro `/financeiro` · Conta Azul `/admin/conta-azul` · Comissões a pagar `/comissoes` (gestor_financeiro) · BI comercial `/bi` (gestor_financeiro). BI Financeiro e Conta Azul também para diretoria e admin.
- **gestao:** BI comercial `/bi` · BI CSM `/csm/bi` · BI Financeiro `/financeiro` · Análises de instrumentos `/tgov` (diretoria, admin)
- **admin:** Usuários `/cadastro-vendedor` (admin, diretoria) · Saúde do sistema `/admin/system-health` (admin)

- [ ] **Step 1: Write the failing tests** em `areas.test.ts`:
  - `nobody but gestor loses a screen`: congelar no teste, como literal, o conjunto de `href` que `getNavItemsForRole(role)` devolve hoje para cada papel (copiar de `sidebar-nav-items.ts` antes de apagá-lo). Para cada papel exceto `gestor`, a união de `getAreaNav(role, a).map(i => i.href)` sobre `getAreasForRole(role)` contém esse conjunto.
  - `gestor sees only commercial`: `getAreasForRole('gestor')` deep-equal `['comercial']`; nenhum href começa com `/tgov`, `/operacao`, `/financeiro`, `/admin`; contém `/cadastro-vendedor` com rótulo `Equipe`.
  - `diretoria lands in gestão and reaches every area`: `primaryAreaForRole('diretoria') === 'gestao'`; áreas = as 5.
  - `vendedor sees no team screens`: nenhum item com `section: 'Gestão'` para `vendedor`.
  - `gestor_financeiro has one area with comissões a pagar`: áreas `['financeiro']`; itens incluem `{ href: '/comissoes', label: 'Comissões a pagar' }`.
  - `shared screen follows the chosen area`: `resolveArea('diretoria', '/bi', new URLSearchParams(), 'comercial') === 'comercial'` e com `'gestao'` → `'gestao'`; sem preferência → `'gestao'`.
  - `unknown or foreign cookie is ignored`: `resolveArea('vendedor', '/leads', p, 'financeiro') === 'comercial'`; `resolveArea('vendedor', '/leads', p, 'lixo') === 'comercial'`.
  - `query-aware active item`: `isNavItemActive('/tgov', '/tgov', ?view=dashboard)` é `false` e `isNavItemActive('/tgov?view=dashboard', ...)` é `true`; `isNavItemActive('/execucao?fase=execucao', '/execucao', vazio)` é `true`; `isNavItemActive('/', '/leads', vazio)` é `false`.
- [ ] **Step 2: Run** `npx tsx --test src/lib/areas.test.ts` → FAIL.
- [ ] **Step 3: Implement** `areas.ts` como dados declarativos (`AREA_NAV: Record<AreaId, Array<AreaNavItem & { roles: Role[] }>>` e `ROLE_AREAS: Record<Role, AreaId[]>`) mais as funções acima. Ícones: reaproveitar as chaves já usadas pelo Sidebar.
- [ ] **Step 4: Run** `npm test` → tudo PASS.
- [ ] **Step 5: Commit** `feat(nav): area model replaces flat role menu`

### Task 6: Shell por área (barra de áreas, menu, drawer)

**Files:**
- Create: `web/src/components/AreaRail.tsx`
- Modify: `web/src/components/Sidebar.tsx`, `web/src/components/MobileDrawer.tsx`, `web/src/app/layout.tsx` (montar a barra ao lado do Sidebar no desktop)

**Interfaces:**
- Consumes: tudo de `lib/areas.ts` (Task 5)
- Produces: `AreaRail({ role, current }: { role: Role; current: AreaId })`; o Sidebar recebe/resolve `current` via `resolveArea(role, pathname, searchParams, cookie)`.

- [ ] **Step 1:** `AreaRail`: coluna fina (`w-14`), fundo navy da marca (`bg-sigma-navy`), logo no topo, um botão por área de `getAreasForRole(role)` com ícone e `aria-label` = rótulo da área; tooltip com o rótulo no hover/foco; área atual com o mesmo indicador animado do menu (`m.span layoutId`). Clicar grava `document.cookie = \`${AREA_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax\`` e navega para `areaHome(role, id)`. Só renderiza se houver mais de uma área.
- [ ] **Step 2:** `Sidebar`: título do menu = `AREAS[current].label` (no lugar do agrupamento antigo por seção); itens de `getAreaNav(role, current)` com a seção "Gestão" separada; ativo por `isNavItemActive`. `ROLE_LABEL`: `gestor` → "Gestor comercial", `diretoria` → "Diretoria". Mantém sino, usuário, tema e sair como na fase 1.
- [ ] **Step 3:** `MobileDrawer`: seletor de área no topo (lista de áreas como abas segmentadas `SectionTabs` quando houver mais de uma), depois os itens da área selecionada.
- [ ] **Step 4: Verify** `npx tsc --noEmit`, `npm run lint`, `npm test` limpos; nenhum import restante de `sidebar-nav-items` (`grep -rn sidebar-nav-items web/src` vazio).
- [ ] **Step 5: Commit** `feat(ui): area rail and per-area menu`

### Task 7: Conferência local e novidades

**Files:**
- Modify: `web/src/components/NewsBanner.tsx` (release `v1.6` no topo)

- [ ] **Step 1:** `NEWS_RELEASES` ganha `v1.6` com: "Menu organizado por área: cada equipe vê só o que é do seu trabalho", "Diretoria com acesso a todas as áreas e ao BI de cada uma", "Gestor comercial com a área Comercial completa e a gestão da própria equipe".
- [ ] **Step 2:** `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` → tudo verde.
- [ ] **Step 3:** Com o dev server em `:3100`, entrar com cada usuário `@dev.local` (gestor, vendedor, coordenador, diretoria, financeiro, csm, projetista, admin) e conferir: área principal ao entrar, itens do menu conforme Task 5, barra de áreas só para diretoria, admin e csm; gestor abrindo `/tgov/pipeline` e `/financeiro` cai em `/sem-permissao`, e o sino não aparece para ele; diretoria alterna Gestão ↔ Comercial em `/bi` e o item ativo acompanha.
- [ ] **Step 4:** Capturas em claro, escuro e 375 px para gestor, vendedor e diretoria; guardar os caminhos para mostrar ao Paulo.
- [ ] **Step 5: Commit** `chore(news): v1.6 release notes for areas` e **parar**: sem push, sem PR. Entregar ao Paulo o resumo, as capturas e o roteiro de produção (rodar `migrations/add_diretoria_role.sql` como `sigma_app`, depois o `UPDATE` comentado para Philipe e Tito, pedir novo login aos dois), que só acontece com OK dele.
