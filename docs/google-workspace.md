# Google Workspace na Projete

## Uso

Abra Workspace no menu ou na ficha do cliente. O ambiente tem navegação própria para **E-mail, Calendário, Drive e Meet**, além do Histórico. Cliente e projeto ficam na barra de contexto, e são preservados ao trocar de ferramenta. Conecte sua conta corporativa e escolha o registro comercial ou convênio. Não cria outro cadastro de cliente. A busca encontra a organização por nome ou CNPJ e também pelo nome ou e-mail dos contatos responsáveis cadastrados no CRM. Os resultados e a seleção de destinatários mostram o nome da pessoa junto ao endereço de e-mail.

- `/workspace/email`: caixa de conversas e leitura lado a lado; no celular, caixa e leitura ocupam telas alternadas. A composição abre separadamente.
- `/workspace/calendario`: visão de mês ou semana dos eventos vinculados ao projeto, navegação entre períodos e criação de reuniões por data. Não representa todos os eventos pessoais da conta.
- `/workspace/drive`: pastas, arquivos em grade ou lista e painel de detalhes e conferência. A navegação e os uploads em subpastas são limitados à pasta vinculada ao projeto.
- `/workspace/meet`: entrada por código ou link válido do Google Meet, próximas reuniões e reuniões anteriores.

O menu de todas as equipes oferece uma barra fixa com as quatro ferramentas, inclusive no celular. As entradas com contexto aparecem nos seguintes pontos:

- Meu dia: e-mail e calendário por lead; reuniões também oferecem Meet.
- Pipeline e listas comerciais: o painel do lead preserva a emenda comercial selecionada.
- Ficha do cliente: acesso geral, contatos, e-mails, reunião, documentos de cada emenda e convênio.
- Execução: ferramentas do cliente e documentos/reuniões de cada convênio registrado na Projete.
- CSM e painéis TransfereGov: ferramentas do cliente quando ele existe no CRM e o usuário tem acesso. Identificadores do TransfereGov não são tratados como IDs comerciais da Projete.
- Financeiro, Clientes: ferramentas nos detalhes de clientes vinculados ao CRM e acessíveis ao usuário. Clientes exclusivos do ERP não recebem um vínculo presumido.
- WhatsApp: as quatro ferramentas no painel do lead associado à conversa.

Os links antigos `/workspace/clientes/:cnpj` continuam funcionando. Endereços de contato abrem um rascunho pela Projete; Agendar prepara uma reunião. O destinatário sugerido precisa constar nos contatos atuais do cliente. Os links preservam a intenção durante o OAuth e nunca enviam mensagem ou convite sozinhos. Trocar o cliente/projeto descarta a intenção inicial.

- E-mails: o Gmail da conta conectada é consultado pelos endereços válidos já cadastrados no cliente. Endereço compartilhado por clientes recebe aviso; vincule a conversa ao projeto após conferir. Novo envio e resposta usam os contatos selecionados, sem copiar mensagens privadas para outros vendedores.
- Documentos: selecione uma pasta existente ou crie uma subpasta em um local autorizado. Registre os arquivos para conferência; anexos e uploads de até 15 MB ficam nessa pasta. Aprovação exige observação e a versão atual do Google; nova versão retorna para análise.
- Agenda e Meet: selecione seu calendário, consulte disponibilidade e crie a reunião com convidados. O botão de criação envia os convites. A chamada usa um Meet exclusivo, e a pauta identifica o cliente e o projeto. Cancelamentos e alterações feitos na Agenda aparecem ao atualizar os eventos.
- Histórico: atividades aparecem no Workspace e na linha do tempo da ficha. Conversas e eventos ficam privados ao titular; a conferência documental é compartilhada com quem tem acesso ao cliente, respeitando também as permissões do Drive.

Editores completos de Docs/Sheets/Slides e a chamada abrem no Google. Esta entrega não administra grupos, não altera compartilhamentos no Drive e não importa toda a caixa postal. Perfis de consulta não enviam mensagens/convites nem alteram documentos. A carteira e as permissões seguem o CRM atual.

## Configuração e publicação

1. Configure um cliente OAuth Web interno à organização no Google Cloud, com Gmail API, Drive API e Calendar API habilitadas. A URI autorizada é exatamente `https://projete.projetus.org/api/integrations/google/callback`; ela foi conferida no JSON fornecido nesta sessão.
2. No aplicativo da Projete no **Coolify** (`btapps`, aplicação `ohxmnamg1umgut184jgi2o57`), configure as variáveis privadas do ambiente de execução:
   - `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (alias legado `GOOGLE_SECRET_KEY`).
   - `GOOGLE_REDIRECT_URI` com a URI acima.
   - `GOOGLE_WORKSPACE_DOMAIN=projetus.org`.
   - `GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios em base64. Gere uma vez e guarde com os segredos do ambiente. Não regenere em cada build: autorizações existentes dependem dessa chave.
3. Aplique `migrations/20261110_google_workspace.sql` no banco `projetus_hub` em `btdb`, antes da publicação. Em um checkout completo também é possível executar `cd web && npm run db:workspace:migrate` com a conexão do ambiente correto. A imagem do Coolify usa apenas a base `/web`, portanto não contém a pasta de migrações da raiz. A migração é aditiva e reaplicável, com trava transacional; não modifica clientes, comissões, relatórios ou títulos do Conta Azul.
4. Publique pelo Coolify, que acompanha `main` e faz build de `/web`. Verifique o commit da fila, a imagem em execução e `https://projete.projetus.org`. Railway e Vercel são legados e seus checks não determinam essa publicação. A configuração local em `web/.env.local` é ignorada pelo Git e tem permissão 0600; a configuração de produção deve existir no Coolify.
5. O usuário entra na Projete e clica Conectar Google. A autorização Google real é feita pelo titular. Habilitar bibliotecas no Cloud não substitui esse consentimento.

Escopos solicitados: OpenID/email/profile; Gmail leitura e envio; Calendar eventos, disponibilidade e lista de calendários; Drive. O acesso amplo ao Drive é necessário para localizar pastas existentes e compartilhadas. A aplicação não pede acesso administrativo ao domínio. A API confere usuário ativo e perfil atual no banco em cada solicitação, além do vínculo ao cliente e das permissões do Google. Tokens são cifrados por usuário e nunca enviados ao navegador.

Desconectar remove os tokens locais e interrompe o acesso pela Projete; preserva os dados no Google. A revogação do consentimento no Google é administrada pelo titular. Uma falha com resultado desconhecido não dispara novo envio: confira Gmail/Agenda/Drive antes de iniciar outra operação. O ID da solicitação é mantido na aba para proteger a repetição após perda da resposta.

## Validação local

Use PostgreSQL isolado em localhost, com nome terminado em `_test`. Os testes recusam uma base remota. `tests/workspace-fixture.mjs` prepara apenas clientes e usuários fictícios.

```sh
cd web
WORKSPACE_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/projete_workspace_test \
  npx tsx --test 'src/lib/workspace/*.test.ts' tests/workspace-flow.test.mjs
npx tsc --noEmit
npm run build
```

Para o aceite HTTP, configure uma execução local com `__NEXT_PROCESSED_ENV=true`, banco isolado, autenticação local, cliente Google fictício cujo ID comece com `workspace-test-`, chave base64 válida de 32 bytes e callback `http://localhost:3018/api/integrations/google/callback`. Não carregue credenciais de produção nessa execução.

O harness `tests/workspace-provider-preload.mjs` intercepta somente os hosts oficiais de OAuth/Gmail/Drive/Calendar dentro do processo local. Ele não é importado pela aplicação e exige `WORKSPACE_TEST_PROVIDER=1`, banco local `_test` e cliente fictício. Inicie com `NODE_OPTIONS="--import=CAMINHO_ABSOLUTO/web/tests/workspace-provider-preload.mjs" npm run start -- -p 3018`, depois execute:

```sh
WORKSPACE_TEST_PROVIDER=1 \
WORKSPACE_TEST_BASE_URL=http://localhost:3018 \
WORKSPACE_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/projete_workspace_test \
  npx tsx --test tests/workspace-http.test.mjs
```

Evidências em 10/11/2026: testes de domínio, Google REST simulado e fluxo com PostgreSQL; aceite HTTP incluindo OAuth/JWT, origem, troca de perfil, usuário inativo, isolamento e refresh simultâneo; build de produção; lint e TypeScript; conferência visual em Chrome com dados fictícios. A suíte geral passou com 269 testes e 14 testes HTTP condicionais omitidos; os 6 do Workspace foram executados separadamente com sucesso. Os 8 HTTP financeiros não foram repetidos nesta entrega.

Aceite real ainda pendente: titular autorizar Google; escolher cliente com dois projetos; vincular pasta real; conferir uma conversa; salvar e revisar um documento; criar uma reunião de teste com destinatários acordados. Nenhuma mensagem, convite ou arquivo real foi criado durante a validação local. Hotmart permanece pendente; emissão fiscal e relatórios financeiros não são alterados por esta entrega.
