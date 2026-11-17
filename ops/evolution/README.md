# Evolution: correção de protocolo e segundo número oficial

## Imagem das consultorias

`Dockerfile` deriva da mesma base imutável 2.3.7 instalada no `btapps`. `apply-status-ack.mjs` verifica a versão e o SHA-256 do módulo antes de modificá-lo. O build falha se a base mudar. Não altera esquema do Evolution nem credenciais.

Backport revisado de [Evolution #2788](https://github.com/evolution-foundation/evolution-api/pull/2788) / [Baileys #2883](https://github.com/WhiskeySockets/Baileys/pull/2883): confirmar eventos top-level `status`, inclusive offline. Acrescentamos isolamento da falha de ACK para não deixar a fila offline parada. Os patches upstream ainda estão em revisão; remover o backport quando uma versão revisada incorporar o tratamento.

O teste carrega o receptor real compilado do Baileys com o transporte inferior substituído. Não usa sessão de cliente nem rede do WhatsApp. Verifica ACK online, ordem offline e continuidade após falha. Os três casos falham na imagem original e passam na corrigida. Isso não substitui teste pareado de recebimento e entrega nem comprova ausência de revogação 401.

Build no `btapps`:

```sh
docker build -t projete-evolution:2.3.7-status-ack-20261117 ops/evolution
```

Em 17/11/2026, publicado no serviço Coolify `8nolopk1xrcsg8fn3nkk3oal`. Imagem configurada tanto no compose gerado quanto nos campos `docker_compose_raw` e `docker_compose` do recurso Coolify, com `pull_policy: never` (imagem local). A imagem precisa ser reconstruída/carregada antes de mudar de host. Não executar `pull` esperando encontrar essa tag em um registry público.

Backup privado de compose, ambiente, configuração Coolify, dump PostgreSQL e volume de instâncias: `/root/projete-evolution-backups/20261117T201702Z` no `btapps`. Diretório 0700; arquivos 0600. Não copiar seu conteúdo para tickets ou logs.

Reversão: restaurar somente a imagem `evoapicloud/evolution-api:v2.3.7` e a política anterior no compose do serviço e nos dois campos persistidos do Coolify; executar `docker compose up -d --no-deps --pull never evolution-api` na pasta do serviço. O patch não modifica os dados, portanto não restaurar o banco/volume por rotina: isso poderia perder mensagens posteriores. Backups de dados são para recuperação excepcional.

## Segundo número usando Cloud API pelo Evolution

A configuração atual de consultorias permanece `WHATSAPP-BAILEYS`. O segundo número deve ser outra instância `WHATSAPP-BUSINESS`, com outro Phone Number ID. Não migrar nem registrar o número das consultorias.

1. Cadastrar o novo número na Meta e obter WABA ID, Phone Number ID e token de usuário de sistema com acesso à conta. Confirmar que o número foi registrado na Cloud API e que o aplicativo está inscrito nos eventos de mensagens da conta.
2. Definir `WA_BUSINESS_TOKEN_WEBHOOK` no serviço Evolution com valor secreto forte. Configurar o callback da Meta para o `SERVER_URL` público do Evolution seguido de `/webhook/meta`, usando esse verify token. Conferir a versão Graph suportada pelo serviço. O callback da Meta não é o webhook privado do PROJETE.
3. Executar no `btapps` o provisionador com os nomes atuais dos contêineres. Ele pede o token de forma oculta e o transmite ao processo apenas por stdin; não imprime o token nem respostas da Meta. A instância existente nunca é sobrescrita.

```sh
python3 /opt/projete-evolution/provision-official.py \
  --evolution-container evolution-api-8nolopk1xrcsg8fn3nkk3oal \
  --app-container NOME_ATUAL_DO_CONTAINER_PROJETE \
  --instance consultorias-oficial
```

4. Habilitar no ambiente do PROJETE `WHATSAPP_OFFICIAL_INSTANCE=consultorias-oficial`, `WHATSAPP_OFFICIAL_LABEL` e, se necessário, `WHATSAPP_OFFICIAL_TEMPLATES=nome:pt_BR,outro_nome:en_US`. Reiniciar/publicar o app. A lista de templates só admite modelos aprovados **sem parâmetros** nesta entrega. Modelos com variáveis exigem uma extensão do formulário e da validação.
5. Validar com destinatário de teste autorizado: mensagem recebida, resposta e confirmação de entrega; mídia; template aprovado fora da janela de 24 horas; separação do mesmo contato nos dois números; recusa de envio pela instância errada. Somente então liberar o número para a equipe.

O PROJETE não recebe token da Meta pelo navegador: ele fala com o Evolution usando a chave já existente. O canal oficial é opcional e fica oculto até ser configurado. O estado `open` da integração oficial é apenas configuração, não prova de acesso/entrega na Meta. A tela explicita essa diferença.

## Aplicação

Aplicar `migrations/20261117_whatsapp_conexao.sql` antes da publicação. Em 17/11 foi aplicada em `projetus_hub` no `btdb`. Tabelas guardam tentativas e transições, sem QR, chaves ou conteúdo de mensagens.

O pareamento usa advisory lock transacional e intervalo persistido de 60 segundos, inclusive após timeout. Polling nunca executa `/instance/connect`. A instância `connecting` não é reiniciada por outra aba. QR é transitório em memória (45 segundos), entregue apenas para gestão autenticada. Em múltiplas réplicas, publicar o mesmo cache efêmero por um mecanismo compartilhado antes de escalar; a exclusão/cooldown já são no banco.

Falha na consulta aparece como indisponibilidade de verificação. `401/device_removed` exige novo pareamento; o backport de Status não reautoriza sessão revogada. A sincronização completa ainda requer verificar a conclusão da importação antes de desligá-la; não foi desabilitada arbitrariamente.

Validação local:

```sh
npm --prefix web run test:whatsapp
npm --prefix web test
npm --prefix web run build
```

Os 53 testes de integração da suíte geral ignorados por falta de suas condições específicas não contam como aprovação de banco/provedor. As consultas, migração e ensaio isolado do Evolution são evidências distintas.
