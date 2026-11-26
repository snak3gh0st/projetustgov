# Slack comercial da Projete

## Escopo implementado

1. Aviso de nova solicitação manual de aprovação, com cliente, consultor, número da oportunidade e link para a Projete. A gestão decide na Projete.
2. Resumo comercial no horário e nos dias configurados, no fuso `America/Sao_Paulo`. Atividade conta até o horário de corte; aprovações pendentes são o retrato no momento da geração. O conteúdo gravado não muda em retentativas.
3. Aviso de conexão do WhatsApp após pelo menos dois minutos de falha observada e recuperação após um alerta confirmado. Indisponibilidade do provedor é distinguida de desconexão do telefone. O bot não reconecta nem solicita QR sozinho.

O bot tem apenas `chat:write`, sem leitura de histórico, contatos ou arquivos do Slack. Destinos são IDs explícitos; não há descoberta automática de canais. O bot deve ser convidado aos canais escolhidos, inclusive privados. Botões apenas abrem páginas autenticadas da Projete; o callback assinado confirma o clique sem modificar o CRM.

## Preparação e configuração

- Aplicar `migrations/20261126_slack_commercial.sql` antes de publicar. São três tabelas novas; nenhuma tabela financeira é alterada.
- Criar o app com `docs/infra/slack-app-manifest.json`, no workspace da Projetus.
- Instalar o app com a permissão `chat:write`, guardar o token do bot e o Signing Secret somente no Coolify. Não colocar credenciais no repositório, no chat ou em mensagens do Slack.
- Configurar `SLACK_WORKSPACE_ID`, `SLACK_COMMERCIAL_CHANNEL_ID`, `SLACK_COMMERCIAL_REPORT_TIME` (`HH:mm`, Brasília). Canal e horário precisam da definição do usuário.
- Destinos diferentes podem usar `SLACK_APPROVALS_CHANNEL_ID` e `SLACK_OPERATIONS_CHANNEL_ID`. Vazio usa o canal comercial. Menções opcionais: `SLACK_APPROVAL_USER_ID` e `SLACK_OPERATIONS_USER_ID`.
- `SLACK_COMMERCIAL_REPORT_DAYS`: dias da semana, `0` domingo a `6` sábado; padrão segunda a sexta.
- `SLACK_COMMERCIAL_ENABLED=false` é o padrão. Credenciais/canais/horário ausentes impedem envio, mesmo com a opção ligada.
- Antes da ativação, conferir `/api/gestao/slack?preview=1` com sessão de gestão. A prévia não grava nem envia mensagens e não revela credenciais.
- A instalação concede nova permissão ao bot e pode depender do administrador do workspace. Conferir as permissões concretas na tela antes de autorizar.

## Agendamento

Instalar `run-slack-commercial.sh` em `/opt/sigma-cron` no `btapps`, com permissão restrita. Instalar o serviço e o timer homônimos de `docs/infra/systemd`, recarregar o systemd e ativar o timer somente com os destinos e horário definidos. O timer executa a cada minuto; a Projete aplica horário e dias do resumo. A credencial de cron é usada dentro do container e não aparece nos argumentos do processo.

## Operação e recuperação

- Primeira ativação considera novas solicitações de aprovação a partir daquele momento. As anteriores aparecem no total pendente do resumo, sem gerar uma enxurrada de avisos históricos.
- Cada solicitação, resumo diário e incidente têm chave única de entrega. Jobs concorrentes são serializados por workspace; mensagens têm reserva atômica.
- Aprovação encerrada ou substituída antes do envio é cancelada. Uma recuperação cancela alerta de queda que ainda não foi enviado.
- Resposta explícita de limite do Slack respeita `Retry-After`. Timeout, resposta incompleta e envio interrompido ficam como `uncertain`: conferir o canal antes de qualquer reenvio manual.
- Falhas definitivas, como bot fora do canal ou permissão insuficiente, ficam como `failed`. O endpoint da gestão apresenta contagens por estado; corrigir a causa antes de liberar uma nova tentativa operacional.
- Mudança de destino cancela pendências do destino antigo, sem transferir automaticamente snapshots nem repetir mensagens já enviadas. O resumo não faz backfill automático de dias perdidos.
- Desativar `SLACK_COMMERCIAL_ENABLED` interrompe todo o processamento sem remover o histórico.

A integração comercial não ativa envios financeiros, VoIP, Meta ou Hotmart.
