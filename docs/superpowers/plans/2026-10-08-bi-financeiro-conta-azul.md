# BI Financeiro (Conta Azul) Implementation Plan

> **For agentic workers:** executed inline (native) by the session that wrote it; the user authorized implementation without plan review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Puxar os dados financeiros do Conta Azul para o Postgres do Projete e exibir a área Financeiro (Visão geral, Resultado, Caixa, Pagar e receber, Clientes e CRM).

**Architecture:**
- O sync roda no app Next.js, reaproveitando o OAuth atual, e grava um espelho das parcelas (payload bruto + tabelas derivadas).
- As telas leem apenas do banco, por rotas `/api/financeiro/*`.
- A lógica de derivação fica em funções puras testadas com `tsx --test`.

**Tech Stack:** Next.js 14 (app router), TypeScript, `pg`, Recharts disponível (os gráficos são SVG próprios, portados do protótipo), Tailwind (`darkMode: 'class'`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-08-bi-financeiro-conta-azul-design.md`. Protótipo: https://claude.ai/artifact/1VuRF9G6BZEiemgY8JjCWJ

## Global Constraints

- Sem DDL em runtime. Tabelas novas só via `migrations/create_conta_azul_finance.sql`, aplicada como `postgres`, com GRANT para `sigma_app`.
- Rateio derivado **uma vez por `evento.id`**; nunca somar o rateio por parcela.
- Datas do Conta Azul estão em horário de São Paulo, sem offset. "Hoje" é calculado em `America/Sao_Paulo`.
- Throttle do cliente CA: no máximo 8 req/s. Retry em 429/5xx até 5 tentativas; 401 força um único refresh.
- Refresh de token sempre sob `SELECT … FOR UPDATE` na linha da conexão.
- Acesso ao BI Financeiro só para gestor, admin e gestor_financeiro (`canReadBiFinanceiro`).
- Copy em pt-BR, sem travessões. PROJETUS em maiúsculas quando citada.
- Branch de deploy: `main` (Coolify). Toda ação em produção é confirmada com o usuário antes.

## Review Focus

1. Token vencido + botão + cron ao mesmo tempo → um único refresh, a conexão continua ativa. Teste em Task 1.
2. Lançamento parcelado (3x) → DRE e caixa contam o total uma vez. Testes em Task 3.
3. Categoria filha fora da árvore do DRE herda a linha do pai; órfã cai em "Sem linha no DRE" e fica fora dos totalizadores. Testes em Task 3.
4. Respostas com `items`/`totalItems` em vez de `itens`/`itens_totais` → o parser aceita as duas. Teste em Task 3.
5. "Hoje" depois das 21:00 BRT, quando a data UTC já virou → o aging usa a data de SP. Teste em Task 3.
6. Execução interrompida (restart do container) → depois de 30 min vira `failed` e a próxima roda e retoma os detalhes pendentes. Teste do diff em Task 3 + runner em Task 6.

---

## PR 1: dados e sync

### Task 1: Lock do refresh de token

**Files:**
- Modify: `web/src/lib/conta-azul/connection.ts` (`getValidAccessToken`)
- Create: `web/src/lib/conta-azul/token-refresh.ts`
- Test: `web/src/lib/conta-azul/token-refresh.test.ts`

**Interfaces:**
- Produces:
  - `refreshUnderLock(deps: RefreshDeps, opts?: { forceRefresh?: boolean; skewMs?: number }): Promise<string>`
  - `RefreshDeps = { withLockedRow<T>(fn: (row: TokenRow, save: (t: SavedTokens) => Promise<void>) => Promise<T>): Promise<T>; decrypt(s): string; encrypt(s): string; refresh(refreshToken): Promise<ContaAzulTokenResponse>; now(): number; markExpired(): Promise<void> }`
  - `getValidAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>`

- [ ] Testes:
  - token válido não chama o refresh;
  - token vencido chama o refresh e salva o novo;
  - duas chamadas concorrentes com uma trava em memória → refresh chamado 1 vez e as duas recebem o token novo;
  - `forceRefresh` renova mesmo se ainda válido;
  - sem refresh token → `markExpired` e erro.
- [ ] Implementar `refreshUnderLock`. Em `connection.ts`, `withLockedRow` usa um client dedicado do pool com `BEGIN; SELECT … FOR UPDATE; …; COMMIT`.
- [ ] `npm test`, commit.

### Task 2: Migration

**Files:**
- Create: `migrations/create_conta_azul_finance.sql`

- [ ] Criar as tabelas do spec §3, com índices:
  - parcelas: (tipo, data_vencimento), (evento_id), (pessoa_id), (deleted_at);
  - baixas: (data_pagamento), (evento_id);
  - rateio: (evento_id), (categoria_id);
  - pessoas: (documento_digits).
- [ ] Índice único parcial `ux_conta_azul_sync_runs_running_pull` em `conta_azul_sync_runs(connection_id) WHERE status='running' AND direction='pull'`.
- [ ] GRANTs para `sigma_app`.
- [ ] Validar a sintaxe num banco descartável: `createdb` local ou `BEGIN … ROLLBACK` no btdb. Commit.

### Task 3: Derivações puras

**Files:**
- Create: `web/src/lib/conta-azul/finance/types.ts`, `derive.ts`, `dre.ts`, `dates.ts`
- Test: `web/src/lib/conta-azul/finance/derive.test.ts`, `dre.test.ts`, `dates.test.ts`

**Interfaces (Produces):**
- `listItems(body): unknown[]` e `listTotal(body): number | null`: aceitam `itens|items` e `itens_totais|total_itens|totalItems`.
- `parcelaFromBusca(item, tipo): BuscaRow`
- `parcelaFromDetail(detail): ParcelaDetailRow`
- `baixasFromDetail(detail): BaixaRow[]`
- `rateioFromEvento(detail): RateioRow[]`: explode centros de custo; a sobra vai para centro nulo.
- `diffSweep(stored: Map<string, StoredMeta>, fetched: BuscaRow[]): { upserts: BuscaRow[]; needDetail: string[]; deleted: string[] }`
- `cnpjDigits(s): string | null`
- `resolveDreLine(categoriaId, cats: Map<string, {pai: string|null}>, catToLine: Map<string,string>): string | null`
- `flattenDreTree(tree): DreLinha[]` (com parent_id, nível, posição, totalizador) e `dreCategoryPairs(tree): {dre_linha_id, categoria_id}[]`
- `computeDre(lines: DreLinha[], values: Map<lineId, number[]>): DreRow[]`: grupos + totalizadores cumulativos.
- `agingBucket(due: string, today: string): 0|1|2|3|4`
- `todaySP(now?: Date): string` (YYYY-MM-DD)

- [ ] Testes com fixtures no formato real (o lançamento 3x de R$ 4.801,88 / rateio R$ 14.405,64):
  - rateio derivado uma vez, com sobra de centro de custo;
  - baixas;
  - diff (novo, alterado, igual, removido, payload ausente);
  - CNPJ com máscara;
  - DRE por ancestral e órfã;
  - totalizadores cumulativos com a árvore real (01…07);
  - aging nos limites (0, 1, 30, 31, 90, 91);
  - `todaySP` às 23:30 BRT;
  - `listItems`/`listTotal` com as duas grafias.
- [ ] Implementar, rodar `npm test`, commit.

### Task 4: Cliente HTTP do Conta Azul

**Files:**
- Create: `web/src/lib/conta-azul/sync/client.ts`
- Test: `web/src/lib/conta-azul/sync/client.test.ts`

**Interfaces:**
- `createCaClient(deps: { fetch: typeof fetch; getToken(opts?: {forceRefresh?: boolean}): Promise<string>; sleep(ms): Promise<void>; now(): number; ratePerSec?: number }): { get<T>(path: string, query?: Record<string, string|number|boolean|string[]>): Promise<T>; calls(): number }`

- [ ] Testes:
  - 429 duas vezes e depois 200 → resolve e chama `sleep` com backoff crescente;
  - 401 → `getToken({forceRefresh:true})` uma vez, depois sucesso;
  - 401 duas vezes → erro;
  - 500 cinco vezes → erro;
  - query com array vira parâmetros repetidos;
  - throttle espaça as chamadas em pelo menos 125ms.
- [ ] Implementar, testar, commit.

### Task 5: Persistência

**Files:**
- Create: `web/src/lib/conta-azul/sync/store.ts`

**Interfaces:**
- `loadStoredMeta(connId, tipo): Map<string, StoredMeta>`
- `upsertBusca(connId, rows: BuscaRow[])`
- `markDeleted(ids: string[])`
- `pendingDetailIds(connId, limit): string[]`
- `saveEventoDetails(connId, details: unknown[])`: uma transação com parcelas + baixas + rateio.
- `replaceDimensions(...)`
- `upsertPessoas(rows)`
- `upsertSaldo(contaId, dataSP, saldo)`
- `sumsForReconcile(connId)`
- `rateioMismatchCount(connId)`

- [ ] Implementar com `query` e um client dedicado para as transações. Coberto pelo teste manual de integração na Task 6. Commit.

### Task 6: Runner + rotas + histórico no admin

**Files:**
- Create: `web/src/lib/conta-azul/sync/runner.ts`, `web/src/lib/conta-azul/sync/reconcile.ts` (+ `reconcile.test.ts`)
- Create: `web/src/app/api/cron/sync-conta-azul/route.ts`, `web/src/app/api/financeiro/sync/route.ts`
- Modify: `web/src/app/admin/conta-azul/ContaAzulAdminClient.tsx` (histórico + botão), `web/src/lib/conta-azul/connection.ts` (`listPullRuns`)

**Interfaces:**
- `startPullRun(trigger: 'cron'|'manual'|'web'): Promise<{ runId: string; existing: boolean }>`
- `executePullRun(runId: string, budgetMs: number): Promise<RunSummary>`
- `reconcile(apiTotals, sums): { ok: boolean; diffs: … }`

- [ ] Testes de `reconcile`: dentro da tolerância de R$ 1 → ok; fora → lista de diferenças.
- [ ] Implementar o runner:
  - etapas do spec §4;
  - progresso em `metadata.progress` a cada 25 itens;
  - stale > 30 min → `failed`;
  - violação de unique → devolve a execução em curso.
- [ ] Rotas:
  - cron: aguarda até 12 min;
  - POST web: dispara sem aguardar, com 10 min;
  - GET: devolve a última execução.
- [ ] Admin: tabela das últimas 10 execuções e botão "Sincronizar agora".
- [ ] Integração manual: rodar o sync contra o CA real **apontando para um banco local** com a migration aplicada e os dados de conexão copiados. Sem banco local, usar o btdb só após OK do usuário. Conferir a reconciliação. Commit.

### Task 7: Infra versionada

**Files:**
- Create: `docs/infra/systemd/projetus-cron@sync-conta-azul.timer`, `docs/infra/systemd/projetus-cron@sync-conta-azul.service.d/timeout.conf`
- Modify: `docs/infra/CURRENT_INFRA.md`

- [ ] Timer às 05:00 com `Persistent=true` e drop-in `Environment=CRON_CURL_MAX_TIME=900`. Commit.

## PR 2: telas

### Task 8: Acesso e menu

**Files:**
- Modify: `web/src/lib/dal.ts` (`canReadBiFinanceiro`), `web/src/middleware.ts`, `web/src/lib/sidebar-nav-items.ts` (seção Financeiro, item `/financeiro`), `web/src/components/Sidebar.tsx` (ícone `financeiro`)
- Test: `web/src/lib/sidebar-nav-items.test.ts`

- [ ] Testes:
  - gestor_financeiro → primeiro item `/financeiro`, seção "Financeiro";
  - gestor tem `/financeiro`;
  - vendedor não tem.
- [ ] Implementar e commitar.

### Task 9: Consultas do BI

**Files:**
- Create: `web/src/lib/financeiro/queries.ts`, `web/src/lib/financeiro/assemble.ts` (+ `assemble.test.ts`), `web/src/lib/financeiro/types.ts`

**Interfaces:**
- `getOverview(opts)`
- `getResultado({ months, regime, cc })`
- `getCaixa({ months, cc })`
- `getTitulos({ tipo, filtro })`
- `getTitulo(id)`
- `getClientesCrm()`
- `getSyncStatus()`

`assemble.ts` monta, a partir de linhas SQL: a matriz do DRE, a projeção diária e semanal, o aging e a conciliação CRM (limite: faturado < 90% do vendido → divergente).

- [ ] Testes de `assemble`:
  - projeção a partir do saldo e títulos;
  - menor saldo da projeção;
  - status de conciliação (os 4 casos);
  - inadimplência.
- [ ] Implementar e commitar.

### Task 10: APIs

**Files:**
- Create: `web/src/app/api/financeiro/{overview,resultado,caixa,titulos,clientes}/route.ts`, `web/src/app/api/financeiro/titulos/[id]/route.ts`, `web/src/app/api/financeiro/resultado/csv/route.ts`

- [ ] Todas com `getApiSession` + `canReadBiFinanceiro`, `dynamic='force-dynamic'`, erros 500 com mensagem. Commit.

### Task 11: Shell e componentes

**Files:**
- Create: `web/src/app/financeiro/layout.tsx`, `web/src/app/financeiro/FinanceiroShell.tsx` (header, carimbo, sincronizar, abas, banners de estado), `web/src/components/financeiro/{charts.tsx,ChartTooltip.tsx,format.ts,SlideOver.tsx,StackBar.tsx,HBars.tsx,Sparkline.tsx}`

- [ ] Portar do protótipo as escalas, as marcas (barra com ponta arredondada de 4px), o crosshair e o tooltip. Tokens via classes Tailwind `dark:`. Commit.

### Task 12: Páginas

**Files:**
- Create: `web/src/app/financeiro/page.tsx` + `VisaoGeralClient.tsx`, `resultado/page.tsx` + `ResultadoClient.tsx`, `caixa/page.tsx` + `CaixaClient.tsx`, `pagar-receber/page.tsx` + `PagarReceberClient.tsx`, `clientes/page.tsx` + `ClientesClient.tsx`

- [ ] Cada página: skeleton no carregamento, vazio explicativo, erro com nova tentativa; filtros na URL.
- [ ] Modo apresentação no Resultado; CSV via rota.
- [ ] Commit por página.

### Task 13: Fechamento

- [ ] Atualizar o NewsBanner: versão + item "BI Financeiro".
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] Revisão final do branch (requesting-code-review).
- [ ] PRs para `main`. Merge/deploy só com OK do usuário.
