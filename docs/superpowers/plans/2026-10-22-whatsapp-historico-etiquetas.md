# WhatsApp: histórico de 1 ano e etiquetas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer para o PROJETE as conversas do último ano do número das consultorias, direcionadas pelas etiquetas do WhatsApp Business (ANA GRACIELE → Ana Graciele, ELISSON CRUZ → Elisson), sem duplicar contato nem encher "esperando resposta".

**Architecture:**
- A conversa ganha o lid do WhatsApp além do telefone. Uma resolução de identidade no `store` acha a conversa por qualquer um dos dois e une as duplicadas, perguntando ao Evolution (`/chat/findMessages`) o par lid/telefone quando falta.
- As etiquetas ficam espelhadas numa tabela, alimentada pelo webhook (`LABELS_ASSOCIATION`) e por uma cópia inicial do banco do Evolution. A etiqueta de vendedor vira `atendente_id`.
- O histórico entra por uma rota de importação em páginas, chamada de dentro do container do app depois da reconexão. Ela grava pelo mesmo `recordMessage`, em modo histórico: sem não lidas, sem tirar do arquivo e marcando `historico_ate`.

**Tech Stack:** Next.js 14 (`web/`), Postgres via `query` (`@/lib/db`), testes `node:test` com `npx tsx --test` (`npm test`), Evolution API v2.3.7 e simulador `web/scripts/dev-db/evolution-mock.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-22-whatsapp-historico-etiquetas-design.md`. Ler também `docs/superpowers/specs/2026-10-22-whatsapp-consultorias-design.md`.

## Global Constraints

- Texto de tela: sem travessão; "áreas", nunca "hub"; PROJETUS em maiúsculas.
- Mudança visível ao usuário: nova versão no topo de `web/src/components/NewsBanner.tsx` (hoje v1.13 → v1.14).
- Migração aplicada antes do deploy, como postgres. As tabelas novas terminam com `ALTER TABLE … OWNER TO sigma_app` (padrão de `migrations/create_whatsapp.sql`).
- Subagentes e testes usam **só o banco local** (`DATABASE_URL` de `web/.env.development.local`). Nunca ssh, btdb, btapps nem produção.
- App local na porta 3100 e simulador na 8085, já rodando: não reiniciar sem necessidade. Login local: `login.sh <email> <jar>` na pasta temporária da sessão (senha em `scripts/dev-db/seed.mjs`). Gestor `gestor@dev.local`; vendedor conforme o seed.
- Instância `consultorias`. Corte do histórico: 365 dias.
- Etiquetas de vendedor: id `4` "ANA GRACIELE" → usuário "Ana Graciele"; id `5` "ELISSON CRUZ" → usuário "Elisson". Ids 1, 2 e 3 não são de vendedor.
- Verificação final de cada tarefa: `npm test`, `npx tsc --noEmit` e `npx next lint` em `web/`.

## Review Focus

1. **Contato antigo escreve de novo.** A mensagem ao vivo chega só com o telefone, e a conversa importada só tem o lid. Deve virar uma conversa só, com o telefone preenchido e ligada ao lead (Task 3, teste de identidade "lid depois telefone").
2. **Conversa que já existe por telefone** (Carlos, Jamine) **aparece no histórico pelo lid.** Deve unir, sem duplicar mensagens (Task 3, "telefone depois lid", e Task 5, importação idempotente).
3. **Mensagem recebida ao vivo depois da importação**, sem resposta, deve contar como esperando. A importada, não (Task 2 e Task 5).
4. **Etiqueta trocada no celular** de Ana para Elisson: o direcionamento muda. Etiqueta removida: só limpa se o direcionamento era daquela etiqueta (Task 4).
5. **Importação rodada duas vezes, ou parada no meio:** não duplica nada e continua de onde parou (Task 5).

---

### Task 1: Migração (lid, historico_ate, etiquetas)

**Files:**
- Create: `migrations/whatsapp_historico_etiquetas.sql`

**Interfaces:**
- Produces:
  - `whatsapp_conversas.lid TEXT NULL`, com índice único parcial `(instancia, lid) WHERE lid IS NOT NULL`.
  - `whatsapp_conversas.historico_ate TIMESTAMPTZ NULL`: mensagens recebidas até esse instante vieram do histórico e não contam como esperando.
  - `whatsapp_etiquetas (instancia TEXT, label_id TEXT, nome TEXT NOT NULL, user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL, PRIMARY KEY (instancia, label_id))`.
  - `whatsapp_chat_etiquetas (instancia TEXT, chat_jid TEXT, label_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (instancia, chat_jid, label_id))`: espelho de qual etiqueta está em qual chat (lid).

- [ ] **Step 1:** Escrever o SQL, idempotente (`IF NOT EXISTS`). O cabeçalho segue o de `create_whatsapp.sql`: aplicar antes do deploy, como postgres.
  - Semente: `INSERT … SELECT 'consultorias', '4', 'ANA GRACIELE', (SELECT id FROM users WHERE nome = 'Ana Graciele')` e o mesmo para `'5', 'ELISSON CRUZ', 'Elisson'`, com `ON CONFLICT DO NOTHING`.
  - No fim, `OWNER TO sigma_app` das duas tabelas novas.
- [ ] **Step 2:** Aplicar no banco local: `psql "$DATABASE_URL" -f migrations/whatsapp_historico_etiquetas.sql`, duas vezes. A segunda execução não pode dar erro.
  - Se os usuários "Ana Graciele" e "Elisson" não existirem no seed local, criar com `role = 'vendedor'` via SQL avulso. Não mexer no seed.
  - Conferir: `SELECT label_id, user_id IS NOT NULL FROM whatsapp_etiquetas` devolve as 2 linhas com `true`.
- [ ] **Step 3:** Commit `feat(whatsapp): lid, historico_ate e etiquetas no banco`.

### Task 2: "Esperando resposta" ignora o histórico

**Files:**
- Modify: `web/src/lib/whatsapp/access.ts` (`aguardandoResposta`)
- Modify: `web/src/lib/whatsapp/api.ts` (`ConversaRow`, `CONVERSA_SELECT` passam a trazer `historico_ate`)
- Modify: `web/src/app/api/meu-dia/route.ts:132-133` e `web/src/app/api/whatsapp/resumo/route.ts:19-20`
- Test: `web/src/lib/whatsapp/access.test.ts`

**Interfaces:**
- Produces:
  - `aguardandoResposta(c: { ultima_recebida_em: string | null; ultima_enviada_em: string | null; historico_ate?: string | null }): boolean`
  - `aguardandoSql(alias?: string): string`: condição SQL equivalente, usada nas duas rotas no lugar do par de condições que existe hoje.

- [ ] **Step 1: Testes que falham** em `access.test.ts`:

```ts
test('history before the import never counts as waiting', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-09-01T10:00:00Z', ultima_enviada_em: null, historico_ate: '2026-10-23T12:00:00Z' }), false)
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-23T12:00:00Z', ultima_enviada_em: null, historico_ate: '2026-10-23T12:00:00Z' }), false)
})
test('a message after the import waits again', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-24T09:00:00Z', ultima_enviada_em: '2026-09-01T10:00:00Z', historico_ate: '2026-10-23T12:00:00Z' }), true)
})
test('aguardandoSql keeps the historico_ate cut', () => {
  assert.match(aguardandoSql('wc'), /wc\.historico_ate/)
})
```

- [ ] **Step 2:** `npx tsx --test src/lib/whatsapp/access.test.ts` falha.
- [ ] **Step 3:** Implementar. A regra de hoje continua valendo, acrescida de `historico_ate IS NULL OR ultima_recebida_em > historico_ate`. Trocar as condições nas duas rotas por `aguardandoSql('wc')`.
- [ ] **Step 4:** `npm test` passa. Com o app local, `GET /api/meu-dia` (vendedor) e `GET /api/whatsapp/resumo` (gestor) respondem 200.
- [ ] **Step 5:** Commit `feat(whatsapp): histórico importado não conta como esperando resposta`.

### Task 3: Identidade da conversa (lid × telefone) e união de duplicadas

**Files:**
- Modify: `web/src/lib/whatsapp/webhook.ts`: `MensagemEvent` ganha `lid`; exportar o parser de mensagem.
- Modify: `web/src/lib/whatsapp/evolution.ts`: par lid/telefone.
- Modify: `web/src/lib/whatsapp/store.ts`: `recordMessage` passa a resolver a conversa por lid ou telefone.
- Modify: `web/scripts/dev-db/evolution-mock.mjs`: `/chat/findMessages/:instance` responde com registros de um fixture em memória.
- Test: `web/src/lib/whatsapp/webhook.test.ts`

**Interfaces:**
- Produces:
  - Evento `kind: 'mensagem'` com o campo novo `lid: string | null`: o JID `@lid` do contato quando vier em `key.remoteJid` ou `key.remoteJidAlt`, senão `null`. `jid` e `telefone` mantêm o significado de hoje.
  - `export function parseMensagem(instancia: string, d: unknown): WebhookEvent` em `webhook.ts`: hoje é o `parseMessage` privado. Formato de entrada igual ao `data` de `MESSAGES_UPSERT`, que é também o registro de `/chat/findMessages`.
  - `export async function parDoContato(jid: string): Promise<{ lid: string | null; telefone: string | null }>` em `evolution.ts`. Chama `POST /chat/findMessages/{instância}` com `{ where: { key: { remoteJid: jid, remoteJidAlt: jid } }, offset: 20, page: 1 }` e lê, nos `key` dos registros, o `@lid` e o `@s.whatsapp.net` (telefone por `phoneFromJid`). Erro ou nada encontrado devolve `{ lid: null, telefone: null }`, sem lançar. Timeout de 5 s.
  - `export async function conversaDoContato(c: { instancia: string; telefone: string | null; lid: string | null; jid: string; nome: string | null }): Promise<{ id: number; lead_cnpj: string | null }>` em `store.ts`.
  - `export async function unirConversas(ficaId: number, saiId: number): Promise<void>` em `store.ts`.

Regras de `conversaDoContato`, na ordem:
1. Procurar por telefone (`telefone = $tel`) e por lid (`lid = $lid`).
2. Se faltar um dos dois e a conversa ainda não existir pelo que se tem, chamar `parDoContato` uma vez (pelo lid ou pelo telefone) para completar.
3. Achou duas conversas diferentes: `unirConversas(fica = a do telefone, sai = a do lid)`.
4. Achou uma: completar `lid`/`telefone` que faltarem. A coluna `telefone` só troca de JID para telefone, nunca de telefone para outro valor.
5. Nenhuma: inserir com `telefone = telefone ?? jid` e `lid`. Se houver etiqueta de vendedor espelhada para o lid (`whatsapp_chat_etiquetas` + `whatsapp_etiquetas.user_id`), já entra com `atendente_id`. Com mais de uma etiqueta de vendedor, vale a de menor `label_id`.
6. Conversa existente que ganha o lid agora e está sem `atendente_id`: aplicar a etiqueta espelhada pela mesma regra.

`unirConversas`, numa transação:
- move as mensagens de `sai` para `fica`, descartando as de `wa_id` repetido;
- `lead_cnpj`, `atendente_id`, `lid` e `nome_contato`: `COALESCE(fica, sai)`;
- `arquivada_em` fica NULL se alguma das duas não estava arquivada;
- `historico_ate`: o maior; `nao_lidas`: a soma;
- recalcula `ultima_*` e `ultima_previa` pelas mensagens;
- apaga `sai`.

- [ ] **Step 1: Testes que falham** em `webhook.test.ts`:
  - Mensagem com `key.remoteJid: '10415396397278@lid'` e `remoteJidAlt: '556292253866@s.whatsapp.net'` dá `lid: '10415396397278@lid'` e `telefone: '5562992253866'`.
  - Só `remoteJid` `@lid`, sem alt (histórico), dá `lid` igual ao jid, `telefone: null` e `jid` igual ao lid.
  - Só telefone dá `lid: null`.
  - `parseMensagem` está exportado.
- [ ] **Step 2:** `npx tsx --test src/lib/whatsapp/webhook.test.ts` falha. Implementar o parser e rodar de novo: passa.
- [ ] **Step 3:** Implementar `parDoContato`, `conversaDoContato` e `unirConversas`, e fazer o `recordMessage` usar `conversaDoContato`, que substitui o `INSERT … ON CONFLICT` de hoje. No mock, `findMessages` aceita o mesmo `where` e filtra um array `FIXTURE` de registros, com pelo menos um par lid/telefone de um lead do seed local.
- [ ] **Step 4: Verificar no app local** (mock reiniciado só se precisar), postando no webhook local com o cabeçalho `x-projete-secret` e conferindo com psql:
  - **Lid depois telefone:**
    - postar mensagem só com lid X, sem alt: 1 conversa, `telefone` igual ao JID e `lid = X`;
    - postar mensagem só com o telefone T, com o fixture ligando T ↔ X: continua 1 conversa, agora com `telefone = T` e `lid = X`, ligada ao lead do T.
  - **Telefone depois lid:**
    - criar conversa só com o telefone T2;
    - postar mensagem só com lid X2, fixture ligando X2 ↔ T2: 1 conversa, sem mensagem duplicada.
  - **União:** inserir à mão duas conversas (uma por T3 e outra por lid X3, com mensagens e uma delas arquivada) e chamar o caminho de união com uma mensagem nova que traga T3 e X3: 1 conversa, mensagens somadas e não arquivada.
- [ ] **Step 5:** `npm test`, `tsc` e `lint` passam. Commit `feat(whatsapp): conversa única por lid ou telefone, com união de duplicadas`.

### Task 4: Etiquetas → direcionamento

**Files:**
- Modify: `web/src/lib/whatsapp/webhook.ts`: evento `LABELS_ASSOCIATION`.
- Modify: `web/src/lib/whatsapp/evolution.ts`: `WEBHOOK_EVENTS` inclui `'LABELS_ASSOCIATION'`.
- Modify: `web/src/lib/whatsapp/store.ts`: `aplicarEtiqueta`.
- Modify: `web/src/app/api/whatsapp/webhook/route.ts`: trata o evento novo, com o mesmo filtro de instância das mensagens.
- Test: `web/src/lib/whatsapp/webhook.test.ts`

**Interfaces:**
- Consumes: `conversaDoContato`, da Task 3.
- Produces:
  - Evento `{ kind: 'etiqueta'; instancia: string; chatJid: string; labelId: string; tipo: 'add' | 'remove' }`, vindo de `event: 'labels.association'` com `data: { instance, type, chatId, labelId }`. O nome do evento chega em minúsculas e com ponto, como os outros eventos que o parser já trata.
  - `export async function aplicarEtiqueta(ev: Extract<WebhookEvent, { kind: 'etiqueta' }>): Promise<void>`:
    1. espelha em `whatsapp_chat_etiquetas` (insere no add, apaga no remove);
    2. procura o vendedor da etiqueta em `whatsapp_etiquetas`; etiqueta sem `user_id` termina aqui;
    3. acha a conversa pelo `lid = chatJid`, ou pelo telefone se `chatJid` for de telefone; sem conversa, termina aqui (a Task 3 aplica a etiqueta quando ela nascer);
    4. add: `atendente_id = vendedor` e `arquivada_em = NULL`;
    5. remove: `atendente_id = NULL` somente se for igual ao vendedor da etiqueta.

- [ ] **Step 1: Testes que falham:**
  - O parser traduz `{ event: 'labels.association', instance: 'consultorias', data: { instance: 'consultorias', type: 'add', chatId: '85822355300446@lid', labelId: '4' } }` no evento acima.
  - `type` diferente de add/remove, ou sem `chatId`, vira `ignorado`.
- [ ] **Step 2:** Implementar o parser e o `aplicarEtiqueta`. `npm test` passa.
- [ ] **Step 3: Verificar no app local** com a conversa de lid X da Task 3:
  - postar add `labelId '4'`: `atendente_id` = Ana;
  - add `'5'`: Elisson;
  - remove `'4'`: continua Elisson;
  - remove `'5'`: NULL;
  - add `'1'`: nada muda, mas o espelho grava.
- [ ] **Step 4:** Commit `feat(whatsapp): etiqueta do WhatsApp direciona a conversa`.

### Task 5: Importação do histórico

**Files:**
- Create: `web/src/app/api/whatsapp/importar/route.ts`
- Modify: `web/src/lib/whatsapp/store.ts`: `recordMessage` aceita o modo histórico.
- Modify: `web/src/lib/whatsapp/evolution.ts`: listar chats e mensagens.
- Modify: `web/scripts/dev-db/evolution-mock.mjs`: `/chat/findChats/:instance` e paginação de `findMessages`.
- Modify: `web/src/components/NewsBanner.tsx`: v1.14.

**Interfaces:**
- Consumes:
  - `parseMensagem`, `conversaDoContato` e `parDoContato` (Task 3);
  - espelho de etiquetas e `whatsapp_etiquetas` (Tasks 1 e 4).
- Produces:
  - `recordMessage(ev, opts)`, em que `opts` ganha `historico?: true`. Em mensagem nova (`nova`):
    - não soma `nao_lidas`;
    - não tira do arquivo;
    - faz `historico_ate = GREATEST(historico_ate, ev.enviadaEm)`.

    O resto continua igual: prévia, datas e ligação ao lead.
  - `listarChats(pular: number, quantos: number): Promise<string[]>`: `POST /chat/findChats/{instância}` com `{ take, skip }`, devolvendo os `remoteJid`.
  - `mensagensDoChat(jid: string, desde: Date, pagina: number): Promise<{ registros: unknown[]; paginas: number }>`: `POST /chat/findMessages/{instância}` com `where.key.remoteJid = jid`, `messageTimestamp: { gte: desde.toISOString(), lte: new Date().toISOString() }`, `offset: 100` e `page`.
  - `POST /api/whatsapp/importar`:
    - protegido pelo cabeçalho `x-projete-secret`, com a mesma comparação do webhook. Sem segredo válido: 401. Canal não configurado: 404;
    - corpo `{ pagina: number }`; processa 20 chats por página, a partir de `pagina * 20`;
    - devolve `{ chats: number; mensagens: number; novas: number; proxima: number | null }`.

Por chat:
1. Ignorar `@g.us`, `@broadcast` e `@newsletter`.
2. Percorrer todas as páginas de mensagens desde `now - 365 dias`, gravando `parseMensagem` → `recordMessage(ev, { historico: true })`.
3. Conversa criada nesta importação e sem etiqueta de vendedor: `arquivada_em = NOW()`. Com etiqueta de vendedor: `atendente_id` dela.
4. Erro num chat é registrado e não para a página.

- [ ] **Step 1:** Implementar o modo histórico no `recordMessage`. `npm test` continua passando.
- [ ] **Step 2:** Implementar `listarChats`, `mensagensDoChat` e a rota. No mock, o fixture de chats/mensagens tem:
  - (a) chat lid com etiqueta 4 e mensagens de 400 dias atrás e de 30 dias atrás;
  - (b) chat lid sem etiqueta;
  - (c) chat do mesmo contato de uma conversa já existente por telefone, ligado pelo par;
  - (d) um grupo `@g.us`.
- [ ] **Step 3: Verificar no app local**, rodando a importação até `proxima: null`:
  - (a) entra com a mensagem de 30 dias e sem a de 400, `atendente_id` = Ana, `nao_lidas = 0`, e não aparece em `GET /api/meu-dia` da Ana;
  - (b) entra arquivada;
  - (c) une com a conversa existente, sem mensagem duplicada;
  - (d) não entra.
  - Rodar a importação de novo: os mesmos totais de conversas e mensagens no banco, e `novas: 0`.
  - Postar uma mensagem ao vivo nova em (a): aparece como esperando.
  - Sem cabeçalho: 401.
- [ ] **Step 4:** NewsBanner v1.14 com um item, por exemplo: "Conversas: as conversas do último ano do WhatsApp das consultorias aparecem no PROJETE, já com o vendedor de cada etiqueta." `npm test`, `tsc`, `lint` e `next build` limpos (parar o dev, `rm -rf .next`, build, religar o dev na 3100).
- [ ] **Step 5:** Commit `feat(whatsapp): importação do histórico de 1 ano`.

### Task 6: Produção (o Claude executa; cada item só com OK do Paulo)

Não é tarefa de subagente. Registrar cada passo no ledger `.superpowers/sdd/2026-10-22-whatsapp-consultorias/progress.md`.

- [ ] **P1 Migração:** em btdb, `sudo -u postgres psql -d projetus_hub -f whatsapp_historico_etiquetas.sql`. Conferir as 2 etiquetas com `user_id` preenchido (Ana Graciele e Elisson).
- [ ] **P2 Cópia das etiquetas:** do banco do Evolution (`Chat.remoteJid`, `Chat.labels`) para `whatsapp_chat_etiquetas` em produção. Conferir 188 da etiqueta 4 e 132 da 5.
- [ ] **P3 PR, merge na `main` e deploy no Coolify.** Conferir:
  - as 3 conversas de hoje intactas;
  - os 4 filtros de Conversas com 200;
  - `webhook/set` com `LABELS_ASSOCIATION`. A reconexão do P5 chama o `webhook/set`.
- [ ] **P3b Lid nas conversas que já existem:** antes do logout, preencher `whatsapp_conversas.lid` das conversas sem lid. O par vem das mensagens ao vivo no banco do Evolution: `key.remoteJid` (lid) e `key.remoteJidAlt` (telefone). Assim elas se unem ao histórico mesmo que o Evolution perca essas mensagens no logout.
- [ ] **P4 Histórico ligado no Evolution:**
  - `DATABASE_SAVE_DATA_HISTORIC=true` no compose do serviço `projete-evolution` e reinício;
  - `POST /settings/set/consultorias` com a configuração atual e `syncFullHistory: true`.
- [ ] **P5 Reconexão:**
  - `DELETE /instance/logout/consultorias`;
  - o Paulo lê o QR em Conversas → Conexão do WhatsApp;
  - acompanhar no log do Evolution as linhas `recv … chats … msgs (is latest: …, progress: …%)` até `is latest: true` ou parar de chegar lote.

  Avisar o Paulo antes: as conversas antigas chegam sem telefone e só se ligam ao lead quando o contato voltar a falar.
- [ ] **P6 Importação:** de dentro do container do app, chamar `POST http://localhost:3000/api/whatsapp/importar` com o segredo e `{ pagina, ate }`, de `pagina=0` até `proxima: null`.
  - `ate` é o momento em que o número reconectou (log `CONNECTED TO WHATSAPP`). O que chegou depois disso já entrou pelo webhook.
  - Chats em `falhas`: rodar a importação de novo. Conferir:
  - totais por vendedor em Minhas (Ana ≈ 188, Elisson ≈ 132, mais as do histórico);
  - Arquivadas;
  - "Em aberto" sem explosão;
  - Meu dia sem as antigas.
- [ ] **P7 Desligar `syncFullHistory`** (volta a ignorar grupos).
- [ ] **P8 Teste com conversa real:** o passo 6 do rollout anterior.
