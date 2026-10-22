# WhatsApp das consultorias dentro do PROJETE

Etapa 6.1 do design de áreas (`2026-10-21-areas-por-equipe-design.md`). É o primeiro canal do multicanal pedido pelo Rooger: as conversas de WhatsApp passam a acontecer no PROJETE, no card do lead e numa caixa "Conversas", sem depender do celular.

## Por que

Hoje o número das consultorias é um WhatsApp comum usado por três pessoas, e o aparelho fica com o Rooger. Quem atende precisa pegar o celular. Nada do que é conversado fica registrado no lead, e o gestor não tem visão do atendimento. A reunião com o Rooger pediu um atendimento "estilo Bitrix", com WhatsApp **não oficial** (não a API oficial da Meta): é assim que a empresa já usa.

## Objetivos

- Ligar o número das consultorias ao PROJETE: receber e responder mensagens de texto por lá.
- Cada conversa pertence a um lead quando o telefone bate, e o dono do lead é quem atende.
- O Rooger (gestor comercial) e a diretoria veem todas as conversas.
- Conversa de número que não está em nenhum lead fica "em aberto", numa fila do gestor, até ele direcionar para um atendente.
- As mensagens aparecem em três lugares já previstos:
  - **linha do tempo do card do lead**, com envio pela caixa de baixo;
  - **página Conversas**, a caixa de entrada;
  - **"Esperando sua resposta" no Meu dia**.

## Não objetivos

- Segundo número de WhatsApp: fica para depois. O modelo de dados já guarda de qual número veio a mensagem.
- Envio em massa, disparos, campanhas, robôs e respostas automáticas.
- API oficial da Meta (WhatsApp Business Platform).
- Importar o histórico antigo do aparelho. Vale o que chegar e sair a partir da conexão.
- Enviar mídia (foto, áudio, documento) pelo PROJETE nesta etapa. Mídia **recebida** aparece identificada, com download.

## Antiobjetivos (fracasso mesmo funcionando)

- O número ser bloqueado pelo WhatsApp por uso que pareça automação: envio em massa ou mensagens iguais para muitos.
- Um consultor ver conversa de lead que não é dele.
- Mensagem perdida: o lead escreve e ninguém vê, porque o número não bateu com nenhum lead e a conversa sumiu em vez de cair na fila.
- O PROJETE mostrar uma resposta como enviada quando ela não saiu.

## Decisões do Paulo

- WhatsApp não oficial, sem API da Meta.
- Primeiro, o número das consultorias. Três pessoas usam, e o aparelho fica com o Rooger.
- Quem responde é o dono do lead. O Rooger vê todas.
- Número desconhecido fica em aberto até o Rooger direcionar para um atendente.
- O Paulo liga o número lendo o QR code.
- **O consultor pode começar a conversa** pelo card do lead. Ele escolhe o telefone do lead e manda a primeira mensagem, digitada, uma por vez. Nada de envio para vários.
- **WhatsApp conta como contato com o lead, sem mudar o status.**
  - Uma mensagem trocada (recebida ou enviada) atualiza o "último contato" e tira o lead de "Parados".
  - O status do funil continua sendo mudado só pela pessoa.
- **Direcionar não tira o dono.** Quando o gestor direciona a conversa de um lead para outro atendente:
  - o direcionado passa a responder e recebe o aviso em "Esperando sua resposta";
  - o dono do lead continua vendo a conversa.
- **Teste no número real.** Não há número de teste. O fluxo é testado localmente com mensagens gravadas (exemplos do webhook) e depois, com cuidado, no número das consultorias já ligado em produção.

## Decisões do autor (conferir)

- **Ponte com o WhatsApp: Evolution API.** Projeto open source, muito usado no Brasil, que conecta um número comum pelo protocolo do WhatsApp Web (QR code, multiaparelho). Ele roda como serviço próprio no servidor `btapps`, pelo Coolify, ao lado do app, e conversa com o PROJETE por REST e webhook.
  - Alternativas: WAHA, ou embutir o Baileys no app.
  - Ficou o Evolution porque é um serviço separado: o deploy do PROJETE não derruba a conexão do número, e o app não precisa manter um socket vivo.
- **O celular continua funcionando.** Com o multiaparelho, quem responder pelo aparelho continua podendo. Essas mensagens também chegam ao PROJETE como enviadas ("pelo celular").
- **Ligação conversa ↔ lead pelo telefone.**
  - Fontes do telefone do lead: `lead_contacts.telefone` e `vendedor_projetos.telefone`.
  - Comparação só pelos dígitos, no formato brasileiro (55 + DDD + número), aceitando celular com e sem o 9 depois do DDD.
  - Se o número bate com mais de um CNPJ, a conversa fica em aberto para o gestor escolher. Não se adivinha.
- **Dono da conversa:** o dono do lead ligado (`vendedor_projetos.vendedor_id` do CNPJ). Se o CNPJ tem mais de um dono, todos eles veem.
  - O gestor também pode direcionar uma conversa para um atendente específico. Isso vale mesmo sem lead e fica gravado na conversa.
  - Ao direcionar uma conversa em aberto, o gestor pode também ligá-la a um CNPJ.
- **Quem vê:**
  - vendedor e coordenador: as conversas dos leads que eles enxergam hoje no PROJETE (dono ou closer, como em `/api/leads`) e as direcionadas a eles;
  - gestor, diretoria e admin: todas;
  - visualizador, CSM e o time TGov: nenhuma (conversa é atendimento, não consulta).
- **Quem envia:** quem vê a conversa e pode editar leads (`canEditLeads`). Gestor e diretoria podem responder qualquer uma.
- **Atualização na tela:** a cada 10 segundos (polling) na página Conversas e no card aberto, e ao voltar para a aba. Sem websocket nesta etapa.
- **"Esperando sua resposta":** conversa cuja última mensagem é do lead, com o tempo desde então.
  - Aparece para o direcionado, quando há um.
  - Sem direcionado, aparece para o dono do lead.
  - Para o gestor, a fila de conversas em aberto aparece em Conversas.
- **Pipeline da equipe (tela do gestor):** ganha o bloco "Conversas sem resposta por consultor", como previsto no design de áreas.
- **Fila em aberto:**
  - o gestor pode direcionar, ligar a um CNPJ ou **arquivar** uma conversa que não é de lead (pessoal, fornecedor, colega);
  - conversa arquivada sai da fila e volta se a pessoa escrever de novo.
- **Grupos de WhatsApp ficam fora:** não são leads, e trazê-los encheria a fila.
- **"Último contato" passa a considerar o WhatsApp**, nas três contas que já existem:
  - "dias sem contato" de `/api/leads`;
  - "último contato" da lista de Execução;
  - "Parados" do Meu dia.

  Nenhuma regra de status muda.
- **Mensagem enviada pelo PROJETE não leva o nome do consultor** para o cliente: sai como sai hoje do número. No PROJETE fica registrado quem enviou.
- **Botão "WhatsApp" do card e das listas:**
  - com o canal ligado, abre a conversa no PROJETE;
  - sem o canal, continua abrindo o wa.me como hoje.
- **Proteção contra bloqueio:** o PROJETE só envia mensagem digitada por uma pessoa, uma por vez. Nenhuma tela permite enviar para vários contatos.

## Peças

1. **Serviço Evolution API** no `btapps`, com instância "consultorias".
   - O webhook aponta para o PROJETE e é protegido por segredo.
   - Instalar exige o OK do Paulo, porque é um serviço novo no servidor.
2. **Tabelas no banco do PROJETE** (migração; aplicar em produção só com OK):
   - `whatsapp_conversas`: número da instância, telefone do contato, nome no WhatsApp, CNPJ ligado (opcional), atendente direcionado (opcional), datas da última mensagem recebida e enviada, e não lidas.
   - `whatsapp_mensagens`: conversa, id da mensagem no WhatsApp (único), direção, autor no PROJETE (quando enviada por ele), texto, tipo e dados da mídia, status (enviada, entregue, lida, falhou) e data.
3. **Webhook** `POST /api/whatsapp/webhook`. Grava mensagens recebidas, mensagens enviadas pelo celular e mudanças de status. É idempotente pelo id da mensagem e liga a conversa ao lead pelo telefone.
4. **API do PROJETE:**
   - listar conversas, com escopo por papel;
   - mensagens de uma conversa;
   - enviar texto;
   - direcionar e ligar ao lead (só gestão);
   - marcar como lida;
   - estado da conexão.
5. **Telas:**
   - "Conversas" no menu Comercial: lista com filtro (Minhas, Em aberto, Todas, conforme o papel), conversa no centro com caixa de envio e resumo do lead à direita.
   - Card do lead: WhatsApp na linha do tempo, um filtro "WhatsApp" e a caixa com seletor Nota/WhatsApp.
   - Meu dia: o item "Esperando sua resposta".
6. **Conexão:** página do gestor e do admin com o estado do número (conectado ou desconectado) e o QR code para ligar.

## Restrições

- Mesmas regras de cópia do app: sem travessão, "áreas" e nunca "hub", PROJETUS em maiúsculas em e-mail.
- Comissão e permissões existentes não mudam.
- Segredos (chave da Evolution, segredo do webhook) só em variáveis de ambiente do Coolify, nunca no código.
- Funcionar sem o serviço ligado:
  - com o Evolution fora do ar, o PROJETE mostra "WhatsApp desconectado" e o resto do app segue igual;
  - os itens de menu e a caixa de envio só aparecem quando o canal está configurado.
- NewsBanner atualizado no deploy.

## Deixado ao construtor

- Versão e imagem do Evolution API, e se ele usa o próprio Postgres ou um banco separado no `btdb`.
- Formato exato dos eventos do webhook e o mapeamento para as tabelas.
- Índices, paginação das mensagens e o limite de conversas por página.
- Visual detalhado da página Conversas, dentro da fundação do app.
