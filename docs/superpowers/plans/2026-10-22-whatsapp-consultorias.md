# WhatsApp das consultorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber e responder o WhatsApp das consultorias dentro do PROJETE (card do lead, página Conversas, Meu dia, bloco do gestor), via Evolution API.

**Architecture:** O Evolution API (serviço separado no `btapps`) mantém o número ligado e chama `POST /api/whatsapp/webhook`, que grava conversas e mensagens no Postgres do PROJETE e liga cada conversa ao lead pelo telefone. As telas leem essas tabelas por rotas `/api/whatsapp/*` com escopo por papel; o envio passa pelo cliente `lib/whatsapp/evolution.ts`. Regras puras (telefone, parse do webhook, acesso, limite de envio) ficam em `lib/whatsapp/*` com testes; o resto é verificado com um mock local do Evolution.

**Tech Stack:** Next.js 14, Postgres (`query`/`queryAs`), node:test via `npx tsx --test`, Evolution API v2 (REST + webhook; eventos `messages.upsert`, `messages.update`, `connection.update`, `qrcode.updated`).

**Spec:** `docs/superpowers/specs/2026-10-22-whatsapp-consultorias-design.md` (e a seção Conversas/Meu dia/Card de `2026-10-21-areas-por-equipe-design.md`).

## Global Constraints

- Variáveis de ambiente (nunca no código):
  - `WHATSAPP_EVOLUTION_URL`;
  - `WHATSAPP_EVOLUTION_API_KEY`;
  - `WHATSAPP_INSTANCE` (padrão `consultorias`);
  - `WHATSAPP_WEBHOOK_SECRET`.
  - O canal só está "configurado" com URL, chave e segredo presentes.
- Sem canal configurado: o item Conversas some do menu, a caixa do card não oferece WhatsApp, o botão WhatsApp abre o wa.me e o Meu dia não mostra "Esperando sua resposta".
- Com o Evolution fora do ar: a tela mostra "WhatsApp desconectado" e o resto do app funciona.
- Quem vê:
  - vendedor e coordenador: conversas dos leads em que são dono ou closer, e as direcionadas a eles;
  - gestor, diretoria e admin: todas;
  - visualizador, csm e o time TGov: nenhuma.
- Quem envia: quem vê a conversa e tem `canEditLeads`. Direcionar, ligar a CNPJ e arquivar: só gestor, diretoria e admin.
- Grupos (`@g.us`) e `status@broadcast` são ignorados no webhook.
- Envio só de texto digitado, para um número por vez; limite de 20 envios por minuto por usuário.
- Mensagem só aparece como enviada depois que o Evolution devolve o id; falha fica marcada "Não enviada".
- WhatsApp conta como contato ("último contato", "Parados"), sem mudar status.
- Cópia sem travessão; "áreas", nunca "hub"; NewsBanner v1.13.
- Migração aplicada em produção só com OK do Paulo; o serviço Evolution no servidor só com OK do Paulo.

## Review Focus

1. Mesmo celular gravado de jeitos diferentes ("(61) 99876-5432", "5561998765432", sem o 9) liga à mesma conversa e ao mesmo lead.
2. Webhook repetido (o Evolution reenvia) ou mensagem enviada pelo PROJETE que volta pelo webhook não duplica a mensagem.
3. Telefone que bate com dois CNPJs vai para "Em aberto", não para um dos dois.
4. Consultor nunca recebe, por nenhuma rota (lista, mensagens, mídia, envio), conversa fora do escopo dele.
5. `remoteJid` em formato `@lid` usa `remoteJidAlt` para achar o telefone; sem telefone resolvível, a conversa fica em aberto com o nome do contato.

---

### Task 1: Tabelas

**Files:** Create `migrations/create_whatsapp.sql`; Modify `web/scripts/dev-db/seed.mjs` (TRUNCATE inclui as tabelas novas)

```sql
whatsapp_conversas (
  id BIGSERIAL PK, instancia TEXT NOT NULL, telefone TEXT NOT NULL,      -- 55 + DDD + número, só dígitos
  jid TEXT NOT NULL, nome_contato TEXT, lead_cnpj TEXT NULL, atendente_id UUID NULL REFERENCES users(id),
  arquivada_em TIMESTAMPTZ NULL, ultima_recebida_em TIMESTAMPTZ NULL, ultima_enviada_em TIMESTAMPTZ NULL,
  ultima_mensagem_em TIMESTAMPTZ NULL, ultima_previa TEXT NULL, nao_lidas INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (instancia, telefone))
whatsapp_mensagens (
  id BIGSERIAL PK, conversa_id BIGINT NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL, direcao TEXT NOT NULL CHECK (direcao IN ('recebida','enviada')),
  origem TEXT NOT NULL CHECK (origem IN ('contato','projete','celular')), autor_id UUID NULL REFERENCES users(id),
  texto TEXT NULL, tipo TEXT NOT NULL DEFAULT 'texto', midia JSONB NULL,
  status TEXT NOT NULL DEFAULT 'enviada', enviada_em TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (conversa_id, wa_id))
```
Índices: `whatsapp_conversas(lead_cnpj)`, `(atendente_id)`, `(ultima_mensagem_em DESC)`; `whatsapp_mensagens(conversa_id, enviada_em)`. `OWNER TO sigma_app` como as outras migrações; idempotente (`IF NOT EXISTS`).

- [ ] Aplicar no banco local; `\d whatsapp_conversas` mostra as colunas. Commit.

### Task 2: Telefone (puro)

**Files:** Create `web/src/lib/whatsapp/phone.ts`, `web/src/lib/whatsapp/phone.test.ts`

**Produces:**
```ts
export function canonicalPhone(raw: string | null | undefined): string | null  // '55' + DDD + número (com o 9 se celular), ou null
export function phoneVariants(raw: string | null | undefined): string[]      // local (sem 55) com e sem o 9 do celular
export function phoneFromJid(jid: string | null | undefined): string | null   // '5561998765432@s.whatsapp.net' → canônico; @g.us/@lid/broadcast → null
export const localPhoneSql: (col: string) => string                           // SQL: dígitos sem o 55 inicial
```
- [ ] Testes:
  - "(61) 99876-5432", "5561998765432" e "+55 61 9 9876-5432" → `5561998765432`;
  - "61 9876-5432" (celular sem o 9; terceiro dígito 6 a 9) → variantes `['6198765432', '61998765432']`;
  - fixo "(61) 3333-4444" → só ele;
  - inválidos (vazio, 8 dígitos, começa com 0) → `null` / `[]`;
  - JID de grupo → `null`.
- [ ] RED, GREEN, commit.

### Task 3: Parse do webhook (puro)

**Files:** Create `web/src/lib/whatsapp/webhook.ts`, `web/src/lib/whatsapp/webhook.test.ts`, `web/src/lib/whatsapp/fixtures/*.json` (um por caso)

**Produces:**
```ts
export type WebhookEvent =
  | { kind: 'mensagem'; instancia: string; waId: string; telefone: string | null; jid: string; nome: string | null;
      fromMe: boolean; texto: string | null; tipo: 'texto'|'imagem'|'audio'|'video'|'documento'|'figurinha'|'outro';
      midia: { mimetype?: string; fileName?: string } | null; enviadaEm: string }
  | { kind: 'status'; instancia: string; waId: string; status: 'enviada'|'entregue'|'lida'|'falhou' }
  | { kind: 'conexao'; instancia: string; estado: 'conectado'|'conectando'|'desconectado' }
  | { kind: 'qrcode'; instancia: string; base64: string }
  | { kind: 'ignorado'; motivo: string }
export function parseWebhook(body: unknown): WebhookEvent[]
```
Evento aceito em `messages.upsert` ou `MESSAGES_UPSERT` (normaliza `[.-]`→`_` maiúsculo). Texto: `conversation` → `extendedTextMessage.text` → legenda de imagem/vídeo/documento. `@lid` usa `key.remoteJidAlt`. Status `SERVER_ACK`→enviada, `DELIVERY_ACK`→entregue, `READ`/`PLAYED`→lida, `ERROR`→falhou. `messageTimestamp` em segundos → ISO. `data` pode vir como objeto ou lista.
- [ ] Testes com fixtures:
  - texto recebido;
  - texto enviado pelo celular (`fromMe`);
  - imagem com legenda;
  - áudio;
  - grupo → ignorado;
  - `@lid` com `remoteJidAlt`;
  - `messages.update` READ;
  - `connection.update` open;
  - evento desconhecido → ignorado;
  - corpo inválido → `[]` sem lançar.
- [ ] RED, GREEN, commit.

### Task 4: Regras de acesso e envio (puro)

**Files:** Create `web/src/lib/whatsapp/access.ts`, `web/src/lib/whatsapp/access.test.ts`

**Produces:**
```ts
export function seesAllConversations(role: string): boolean          // gestor, diretoria, admin
export function canUseWhatsapp(role: string): boolean               // vendedor, coordenador + seesAll
export function canManageConversations(role: string): boolean       // direcionar/ligar/arquivar = seesAll
export function conversationScopeSql(role: string, userParam: string, alias?: string): string
  // seesAll → 'TRUE'; vendedor/coordenador → atendente = $n OR lead_cnpj IN (vp com vendedor_id=$n OR closer_id=$n); outros → 'FALSE'
export function aguardandoResposta(c: { ultima_recebida_em: string | null; ultima_enviada_em: string | null }): boolean
export function responsavelDaConversa(c: { atendente_id: string | null }, donosDoLead: string[]): string[]  // direcionado ou donos
export class SendLimiter { constructor(max: number, windowMs: number); allow(userId: string, now: number): boolean }
```
- [ ] Testes:
  - os papéis de cada função, incluindo visualizador, csm e projetista sem acesso;
  - escopo de vendedor contém o parâmetro e `closer_id`;
  - aguardando só quando a última recebida é posterior à última enviada;
  - direcionado substitui os donos em "responsável", sem tirar visibilidade (o escopo continua incluindo o dono);
  - o limiter libera 20 envios e barra o 21º no mesmo minuto, e libera de novo depois de 60 s.
- [ ] RED, GREEN, commit.

### Task 5: Cliente Evolution, gravação e webhook

**Files:** Create `web/src/lib/whatsapp/evolution.ts`, `web/src/lib/whatsapp/store.ts`, `web/src/app/api/whatsapp/webhook/route.ts`, `web/scripts/dev-db/evolution-mock.mjs`; Modify `web/src/middleware.ts` (`/api/whatsapp/webhook` em `publicPaths`), `web/scripts/dev-db/README.md`

**Produces:**
```ts
// evolution.ts (server-only)
export function whatsappConfig(): { url: string; apiKey: string; instance: string; secret: string } | null
export function whatsappConfigured(): boolean
export async function sendText(phone: string, text: string): Promise<{ waId: string }>      // POST {url}/message/sendText/{instance} {number, text}, header apikey; lança em falha
export async function connectionState(): Promise<'conectado'|'conectando'|'desconectado'>  // GET /instance/connectionState/{instance}
export async function ensureInstanceAndQr(webhookUrl: string): Promise<{ estado: string; qrBase64: string | null }>
  // cria a instância se faltar (integration WHATSAPP-BAILEYS, qrcode, groupsIgnore, webhook {url, headers: {'x-projete-secret': secret}, events: MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE, QRCODE_UPDATED}) e devolve GET /instance/connect
export async function mediaBase64(waId: string): Promise<{ base64: string; mimetype: string }>  // POST /chat/getBase64FromMediaMessage/{instance}
// store.ts (server-only)
export async function recordMessage(ev: Extract<WebhookEvent, { kind: 'mensagem' }>, opts?: { autorId?: string; origem?: 'projete' }): Promise<{ conversaId: number; nova: boolean }>
export async function recordStatus(ev: Extract<WebhookEvent, { kind: 'status' }>): Promise<void>
export async function linkConversationToLead(conversaId: number): Promise<string | null>   // 1 CNPJ casado → grava; 0 ou 2+ → null
```
- `recordMessage`:
  - faz upsert da conversa por `(instancia, telefone)`; sem telefone, usa o JID como chave;
  - insere com `ON CONFLICT (conversa_id, wa_id) DO NOTHING`;
  - atualiza `ultima_*`, `ultima_previa` e `nao_lidas` (só se recebida);
  - uma mensagem recebida limpa `arquivada_em`;
  - origem: `fromMe` = `celular`, a não ser que já exista como `projete`;
  - liga ao lead quando ainda não ligada.
- A busca de lead casa `localPhoneSql` de `lead_contacts.telefone` e `vendedor_projetos.telefone` contra `phoneVariants`.
- Webhook:
  - recusa (401) sem `x-projete-secret` igual ao segredo;
  - responde 200 rápido para eventos ignorados;
  - nunca devolve 500 por evento desconhecido.
- `evolution-mock.mjs`: servidor local na porta 8085 que responde sendText (id aleatório), connectionState "open" e connect (QR fictício), e que posta no webhook do app um texto recebido quando chamado com `node evolution-mock.mjs inbound <telefone> "<texto>"`.
- [ ] Verificar localmente com o mock:
  - mensagem recebida de telefone de lead → conversa ligada ao CNPJ;
  - repetir o mesmo POST → nenhuma linha nova;
  - telefone de dois CNPJs → `lead_cnpj` nulo;
  - sem segredo → 401.
- [ ] Commit.

### Task 6: Rotas da aplicação

**Files:** Create under `web/src/app/api/whatsapp/`:
- `conversas/route.ts` (GET `?filtro=minhas|em-aberto|todas|arquivadas&cnpj=&busca=`);
- `conversas/[id]/route.ts` (GET mensagens paginadas `?antes=`; PATCH `{atendente_id?, lead_cnpj?, arquivar?: boolean}`);
- `conversas/[id]/lida/route.ts` (POST);
- `enviar/route.ts` (POST `{conversa_id?, telefone?, cnpj?, texto}`);
- `midia/[mensagemId]/route.ts` (GET);
- `conexao/route.ts` (GET estado, POST conectar/QR);
- `resumo/route.ts` (GET contagem de aguardando por consultor, para o gestor).

Every route:
- 404 when `!whatsappConfigured()`;
- 401 without a session;
- uses `conversationScopeSql` in every query that returns a conversation or message.

Enviar:
- checks `canUseWhatsapp`, `canEditLeads`, `SendLimiter(20, 60_000)` and the scope; text 1 to 4096 characters;
- with `telefone`, creates or reuses the conversation, linking it to `cnpj` when the user can see that lead;
- calls `sendText`, then `recordMessage` with `origem: 'projete'` and `autorId`;
- if Evolution fails, records the message with status `falhou` and responds 502 `{ error: 'Não foi possível enviar pelo WhatsApp.' }`.

Conexão: only `seesAllConversations`. POST calls `ensureInstanceAndQr(`${NEXTAUTH_URL}/api/whatsapp/webhook`)`.
- [ ] Check with the mock and the seed users (curl script in the scratchpad):
  - vendedora sees only her own;
  - gestor sees all and directs;
  - visualizador gets 403;
  - after a send, the message shows up with status `enviada`;
  - with the mock off, the send returns 502 and the message is saved as `falhou`.
- [ ] Commit.

### Task 7: WhatsApp counts as contact; Meu dia and the manager's block

**Files:** Modify `web/src/app/api/leads/route.ts` (days_since_last_contact), `web/src/app/api/execucao/route.ts` (CTE `last_contact`), `web/src/app/api/meu-dia/route.ts` (notes/last_contact + `aguardando`), `web/src/lib/meu-dia.ts` (+test), `web/src/app/meu-dia/MeuDiaClient.tsx`, `web/src/app/HomeClient.tsx` (block "Conversas sem resposta por consultor")

- Last contact:
  - add `MAX(whatsapp_mensagens.enviada_em)` from the conversations linked to the CNPJ as one more source in the `GREATEST`/`MAX` of each query;
  - in Aprovação for the seller, count only messages on visible conversations, same rule as the notes.
- `MeuDia` gets `aguardando: MeuDiaAguardando[]` `{ conversaId, nome, telefone, cnpj, previa, desde }`. It holds the conversations where `responsavelDaConversa` includes the user and `aguardandoResposta`, ordered from oldest.
- UI: a "Esperando sua resposta" column comes first, only when the channel is configured (`lg:grid-cols-2 xl:grid-cols-4`). Each item opens `/conversas?c=<id>`.
- Gestor's Pipeline: "Conversas sem resposta" block with a consultant → count list plus "Em aberto", from `/api/whatsapp/resumo`, only when configured.
- [ ] Test: in `meu-dia.test.ts`, a candidate with WhatsApp contact 2 days ago is not stalled (the route passes the combined `dias_sem_contato`; the test pins the classification of whatever arrives).
- [ ] Check in the browser: a mock message on a stalled lead takes it out of "Parados" and puts it in "Esperando". Commit.

### Task 8: Conversations page and connection page

**Files:**
- Create `web/src/app/conversas/page.tsx`, `ConversasClient.tsx`, `web/src/app/conversas/conexao/page.tsx`, `ConexaoClient.tsx`, `web/src/components/whatsapp/*` (list, thread, composer, bubble, side summary).
- Modify `web/src/lib/areas.ts` (item `{ href: '/conversas', label: 'Conversas', icon: 'conversas', roles: [vendedor, coordenador, gestor, diretoria, admin], requires: 'whatsapp' }`, filter `getAreaNav(role, area, opts?: { whatsapp?: boolean })`) and its test, `Sidebar.tsx`, `MobileDrawer.tsx`, `layout.tsx` (pass `whatsapp: whatsappConfigured()`), `NavIcon.tsx`.

Conversas page:
- filter tabs follow the role: Minhas / Em aberto / Todas / Arquivadas;
- search by name or phone;
- conversation list with name, preview, time, unread count and an "Esperando resposta" tag;
- thread with incoming and outgoing bubbles, origin ("pelo celular"), author and status (✓ sent, ✓✓ delivered, read, "Não enviada" with "Tentar de novo");
- composer at the bottom, Enter to send, Shift+Enter for a new line;
- on the right, the lead summary (name, CNPJ, status, owner, "Abrir card"), or for the manager the "Direcionar para", "Ligar a um lead" (CNPJ search) and "Arquivar" controls;
- `?c=` opens the conversation;
- polling every 10 s plus on focus;
- marks as read when opened;
- incoming media shows type and name with "Baixar" (`/api/whatsapp/midia/...`).

Connection page (manager and admin): state, "Conectar número" button that shows the QR (refreshes every 20 s while not connected), instructions for reading it on the phone.

Test: `areas.test.ts`, Conversas only with `{ whatsapp: true }` and never for visualizador or csm.
- [ ] Browser: light, dark and 375 px (list → thread on mobile with "Voltar"), each role. Commit.

### Task 9: Lead card

**Files:** Modify `web/src/lib/lead-timeline.ts` (+test), `web/src/components/lead-card/LeadTimeline.tsx`, `web/src/app/lead/[cnpj]/page.tsx`, `web/src/components/WhatsAppAction.tsx`

- `buildTimeline` takes `mensagens: TimelineMensagem[]`. The filters become `'tudo'|'whatsapp'|'notas'|'movimentacoes'`, and the WhatsApp filter only appears when configured.
- Message = bubble (incoming on the left, outgoing on the right), phone when the CNPJ has more than one.
- Composer with a "Nota | WhatsApp" toggle. On WhatsApp, a phone selector picks among the lead's valid phones (contacts + lead, `canonicalPhone` without duplicates), defaulting to the one with a conversation. It sends via `/api/whatsapp/enviar` with `cnpj`.
- `WhatsAppAction`: when configured (prop `inApp`), it links to `/conversas?telefone=<canonical>`, which opens or creates the conversation; otherwise wa.me as today.
- [ ] Tests in `lead-timeline.test.ts`:
  - messages come in chronological order with stable keys;
  - the `whatsapp` filter keeps only messages.
- [ ] Browser: send from the card with the mock; the message shows in the card and in Conversas. Commit.

### Task 10: News, build, final review
- [ ] NewsBanner v1.13 ("WhatsApp das consultorias no PROJETE…"). Full suite, tsc, lint, `next build` (stop dev, `rm -rf .next`, start again afterwards). Final review by a subagent with the Review Focus; fixes with tests. Commit.

### Rollout (each step needs the Paulo's OK)
1. Evolution API service on `btapps` via Coolify, with its own Postgres, and only reachable by the app (no public port beyond what Coolify exposes on the internal network).
2. Variables in the PROJETE Coolify.
3. `migrations/create_whatsapp.sql` in production (`SET ROLE sigma_app`).
4. Merge and deploy.
5. Paulo reads the QR on the connection page.
6. Test with a real conversation.
