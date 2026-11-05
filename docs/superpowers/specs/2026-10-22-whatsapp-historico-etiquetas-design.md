# WhatsApp das consultorias: histórico de 1 ano e divisão pelas etiquetas

Continuação de `2026-10-22-whatsapp-consultorias-design.md`. Aquele design deixou de fora "importar o histórico antigo do aparelho". Este traz o histórico e usa as etiquetas do WhatsApp Business para dividir as conversas entre os vendedores.

## Por que

O número foi ligado ao PROJETE em 22/10/2026 às 17:47. Desde então só o que chega e sai aparece em Conversas. O celular, porém, já tem cerca de 320 conversas em andamento, e a equipe já divide o atendimento por etiquetas do WhatsApp Business: cada conversa tem a etiqueta de quem atende. O Paulo quer que todas essas conversas apareçam no PROJETE, já organizadas por essa divisão, para os vendedores seguirem atendendo por lá.

## O que existe hoje (levantado em 22/10/2026)

- Evolution `evoapicloud/evolution-api:v2.3.7` no Coolify (serviço `projete-evolution`, ver memória `reference_projete_evolution.md`), instância `consultorias`, conta WhatsApp Business, wuid 556120177308.
- Banco do Evolution: 320 `Chat`, 694 `Contact`, 17 `Message`, todas de hoje. O histórico não foi guardado porque `DATABASE_SAVE_DATA_HISTORIC=false` e a configuração da instância tem `syncFullHistory = false`.
- Etiquetas (`Label`):

  | labelId | Nome | Conversas |
  |---|---|---|
  | 4 | ANA GRACIELE | 188 |
  | 5 | ELISSON CRUZ | 132 |
  | 1, 2, 3 | Não lidas, Favoritos, Grupos (padrão do WhatsApp) | 0 |

  Cada uma das 320 conversas tem exatamente uma etiqueta. Não há grupos, porque `groupsIgnore` está ligado.
- Pessoas no PROJETE: "Ana Graciele" (vendedor) e "Elisson" (vendedor).
- As 320 conversas estão gravadas no Evolution pelo JID `@lid`, sem telefone. A tabela `IsOnWhatsapp` tem `lid` vazio para todos. Hoje não há como saber o telefone de uma conversa antiga. As mensagens novas chegam com `key.remoteJidAlt` (o telefone), que o webhook do PROJETE já usa (`web/src/lib/whatsapp/webhook.ts`).
- No PROJETE: 2 conversas e 17 mensagens, recebidas pelo webhook desde a conexão.

## Objetivos

- Todas as conversas do celular (as 320 e as que chegarem) aparecem em Conversas, com as mensagens do último ano.
- Cada conversa importada entra direcionada pela etiqueta: ANA GRACIELE para Ana Graciele, ELISSON CRUZ para Elisson. Cada um a vê em **Minhas**, e a gestão vê todas.
- Daqui para frente, trocar a etiqueta de uma conversa no celular muda o direcionamento no PROJETE.
- Conversa cujo telefone está num lead fica ligada ao lead, pela regra que já existe (`linkConversationToLead`: exatamente um CNPJ).
- O histórico conta como contato do lead em Leads, Execução e Meu dia, como as mensagens novas já contam (`whatsappContatosSql`). São contatos reais. *(Decisão do Claude.)*

## Não objetivos

- Histórico com mais de 1 ano.
- Mexer nas etiquetas do celular a partir do PROJETE. O direcionamento feito no PROJETE não volta para o WhatsApp.
- Tela para configurar qual etiqueta é de quem. A ligação etiqueta → pessoa fica em dados, alterável por SQL ou migração. *(Decisão do Claude.)*
- Grupos. Continuam ignorados.
- Baixar e guardar no PROJETE a mídia antiga. Ela aparece identificada, e o download usa a rota que já existe. Mídia antiga que o WhatsApp não tiver mais pode falhar no download, e isso é aceitável.

## Antiobjetivos (fracasso mesmo funcionando)

- **O mesmo contato aparecer em duas conversas**, uma pelo `@lid` e outra pelo telefone, porque o histórico entrou por um identificador e as mensagens novas por outro.
- **O "Esperando sua resposta"** (Meu dia, resumo da gestão em `api/whatsapp/resumo`, selo "aguardando" em Conversas) **se encher de conversas antigas**. Só conta como esperando o que chegar depois da importação.
- **Contador de não lidas inflado pelo histórico.** Conversas importadas entram com `nao_lidas = 0`.
- **Perder ou duplicar mensagens já gravadas** (as 17 de hoje e as que chegarem durante a reconexão). A gravação é idempotente pelo id do WhatsApp (`UNIQUE (conversa_id, wa_id)`).
- **O número ser desconectado ou bloqueado** por causa da sincronização.
- **Um vendedor ver conversa que não é dele.** O escopo continua o de hoje: direcionadas a ele ou de leads dele.

## Decisões do Paulo

- Usar as etiquetas do WhatsApp para organizar: Ana Graciele e Elisson são vendedores do PROJETE, e as conversas seguem com eles.
- Histórico: 1 ano.
- Reconectar o número (ler o QR de novo) é aceitável. Ele concordou com a ideia, mas a execução ainda passa pelo OK dele.
- As conversas ficam ligadas aos vendedores que vão atender, de acordo com as etiquetas. O Rooger vê tudo. Ele é `gestor` (Rooger Cordeiro), e a gestão já vê todas as conversas.

## Conversas sem etiqueta de vendedor (decisão do Claude)

O histórico de 1 ano deve trazer conversas que não estão entre as 320 de hoje, sem etiqueta: clientes antigos, contatos pessoais, fornecedores, conversas arquivadas no celular.
- Elas entram no PROJETE **já arquivadas**: o Rooger as encontra em **Arquivadas**, nada se perde e "Em aberto" não enche.
- Se o contato escrever de novo, a regra que já existe tira a conversa do arquivo, e ela vai para o dono do lead ou para "Em aberto".
- Se depois ela ganhar etiqueta de vendedor no celular, sai do arquivo direcionada a esse vendedor.

## Sem número de teste (decisão do Claude)

Não há um segundo número para ensaiar. A verificação dos três pontos de risco da seção 1 é feita lendo o código do Evolution v2.3.7 e do Baileys que ele usa, antes de pedir o OK do logout. Antes do logout, a importação guarda qual etiqueta está em cada conversa, a partir das tabelas `Label` e `Chat` atuais do Evolution: lid, nome e etiqueta. Assim a divisão vale mesmo que a reconexão não traga as etiquetas de volta ou mude os ids. Se a leitura do código mostrar que o histórico cobre menos de 1 ano, o Paulo decide no OK do logout se reconecta mesmo assim.

## Como funciona

### 1. Trazer o histórico (operação, uma vez)

O WhatsApp só entrega o histórico no pareamento. Para isso:

1. No serviço do Evolution: `DATABASE_SAVE_DATA_HISTORIC=true`.
2. Na instância: `syncFullHistory = true`. Sem isso, o WhatsApp manda só um período curto, não o ano inteiro.
3. Desconectar a instância (logout) e o Paulo ler o QR de novo na tela Conexão do WhatsApp.
4. Esperar o WhatsApp terminar de enviar o histórico. São vários lotes, e pode levar minutos.

As conversas e mensagens que já estão no PROJETE ficam onde estão. As mensagens que chegarem durante a reconexão entram pelo webhook como hoje.

**A verificar pelo construtor antes de executar** (risco técnico):
- se a v2.3.7 do Evolution grava o histórico com o telefone do contato (`remoteJidAlt` ou mapa lid → telefone que o WhatsApp manda no pareamento) e onde isso fica;
- se `syncFullHistory` cobre 1 ano;
- se a reconexão traz as etiquetas de novo.

Se o telefone não vier, ver a regra do antiobjetivo de duplicidade em "Identidade da conversa".

**Verificado no código do Evolution v2.3.7 e do Baileys 7.0.0-rc.9 (22/10/2026):**
- O WhatsApp manda o telefone de cada conversa no histórico (`pnJid`), mas o Evolution o descarta. Chats, contatos e eventos `CHATS_SET`/`CONTACTS_UPSERT` saem só com o lid e o nome. As mensagens do histórico também chegam só pelo lid, porque o `remoteJidAlt` existe apenas no tráfego ao vivo.
  - Conclusão: depois da reconexão, as conversas antigas chegam pelo lid, sem telefone. O telefone aparece quando o contato escreve ou recebe mensagem nova.
  - A divisão por etiqueta não depende do telefone, porque as etiquetas também usam o lid. O que fica limitado é a ligação ao lead das conversas antigas, até o contato voltar a falar.
- O banco do Evolution guarda o par nas mensagens ao vivo: `key.remoteJid` (lid) e `key.remoteJidAlt` (telefone). O `/chat/findMessages` filtra por `key.remoteJid` **ou** `key.remoteJidAlt`. Por aí o PROJETE descobre o lid de um telefone, e o telefone de um lid, para todo contato que teve mensagem ao vivo. O webhook que chega ao PROJETE vem com o telefone no lugar do lid.
- Com `syncFullHistory` ligado, o Evolution passa a não ignorar grupos (`shouldIgnoreJid`). A importação filtra grupos, e o `syncFullHistory` volta para desligado quando a sincronização terminar.
- Sem Chatwoot, o Evolution não limita a data do histórico. O corte de 365 dias fica na importação do PROJETE.
- A 2.4.0 do Evolution traz um mapa lid → telefone, mas é pré-lançamento e exige chave de licença. Não usar.

### 2. Levar o histórico para o PROJETE

Uma importação que lê o histórico gravado no Evolution e grava no PROJETE.
- Só mensagens de conversas individuais, dos últimos 365 dias.
- Grava pelas mesmas regras de `recordMessage`: texto, tipo, mídia identificada, direção, origem `contato` ou `celular`.
- Pode ser rodada de novo sem duplicar.

A forma fica com o construtor: um script rodado uma vez contra a API do Evolution (`/chat/findChats`, `/chat/findMessages`) ou contra o banco dele, ou tratar no webhook os eventos de histórico (`MESSAGES_SET`). *Preferência do Claude: o script, porque roda de novo se falhar e não depende de lotes grandes no webhook.*

Na conversa importada:
- `nao_lidas = 0`;
- prévia e datas da última mensagem calculadas pelo histórico;
- não fica "esperando resposta" por mensagens anteriores à importação. Como marcar isso (coluna com o momento da importação, ou outra forma) fica com o construtor. O que importa é que `aguardandoResposta`, o Meu dia e o resumo da gestão sigam a mesma regra.

### 3. Identidade da conversa (lid × telefone)

Hoje a conversa é única por `(instancia, telefone)`, e quando não há telefone o `telefone` guarda o JID. Regra:
- Quando o telefone de um `@lid` for conhecido (histórico, `remoteJidAlt` de mensagem nova, mapa do pareamento), a conversa é a do telefone, e o lid fica guardado nela.
- Se já existir uma conversa pelo lid e outra pelo telefone do mesmo contato, elas são unidas numa só: mensagens, direcionamento e ligação ao lead.
- Conversa que continuar sem telefone aparece com o nome do contato e a etiqueta, sem ligação a lead e sem envio pelo card (o envio pela tela Conversas usa o JID, como hoje).

### 4. Etiquetas → direcionamento

- Ligação etiqueta → pessoa guardada em dados, por instância e etiqueta (id e nome): 4 → Ana Graciele, 5 → Elisson. Etiqueta sem pessoa (Não lidas, Favoritos, Grupos) é ignorada.
- Na importação: conversa com etiqueta de pessoa ganha `atendente_id` dessa pessoa.
- Depois: o webhook recebe os eventos de etiqueta do Evolution (`LABELS_ASSOCIATION`, e `LABELS_EDIT` se ajudar) e atualiza o `atendente_id`. Esses eventos precisam entrar na lista `WEBHOOK_EVENTS` (`web/src/lib/whatsapp/evolution.ts`) e no `webhook/set`, que o botão de conexão já chama.
- Vale a última mudança: etiqueta trocada no celular ou direcionamento feito pela gestão no PROJETE.
- Etiqueta removida no celular: a conversa fica sem direcionamento e volta a seguir a regra de hoje (dono do lead, ou "Em aberto"). *(Decisão do Claude.)*
- Conversa com duas etiquetas de pessoa: vale a que foi associada por último. Na importação, vale a de menor id. *(Decisão do Claude; hoje não há nenhum caso.)*

## Restrições

- Produção: Postgres `projetus_hub` em btdb. Migração aplicada como postgres antes do deploy, com as tabelas novas de dono `sigma_app` (padrão de `migrations/create_whatsapp.sql`). Coolify em btapps sem deploy automático.
- Cada passo em produção (variável no Evolution, configuração da instância, logout, QR, importação, migração, deploy) só com OK do Paulo, um por um.
- Subagentes e testes usam só o banco local. Nada de consultas em produção sem pedido.
- Texto de tela: sem travessão, "áreas" e nunca "hub", PROJETUS em maiúsculas. Mudança visível ao usuário leva novidade no `NewsBanner.tsx`.
- Simulador local `web/scripts/dev-db/evolution-mock.mjs`. Vai precisar responder às consultas de histórico e de etiquetas usadas, para testar localmente.

## Fica com o construtor

- A forma da importação (script × eventos de histórico) e o formato exato dos dados do Evolution v2.3.7.
- Como marcar "anterior à importação" para a regra de esperando resposta.
- O modelo de dados do lid na conversa e da ligação etiqueta → pessoa.
- Como e quando unir conversas duplicadas (na importação, na chegada de mensagem nova, ou nas duas).
