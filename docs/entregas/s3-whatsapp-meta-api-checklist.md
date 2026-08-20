# S3 - WhatsApp e numero comercial unico

Status da entrega: acao de WhatsApp revisada no CRM; validacao operacional pendente com Rooger.

## O que foi entregue no CRM

- A mesma acao visual e semantica de WhatsApp no funil, no detalhe do lead e nos contatos.
- Telefone valido abre a conversa em nova aba com `wa.me`.
- Telefone ausente ou invalido mostra `WhatsApp indisponivel`, em vez de um botao que falha silenciosamente.
- A acao nao altera status do funil e nao envia mensagem automaticamente.

## Validacao do numero unico comercial

Responsaveis: Paulo + Rooger

- [ ] Definir e registrar o numero comercial oficial do time.
- [ ] Confirmar que o numero esta conectado ao WhatsApp Business/Web usado pelo time.
- [ ] Testar uma conversa interna e confirmar o remetente exibido ao destinatario.
- [ ] Abrir um lead real pelo CRM e confirmar que o contato correto e aberto.
- [ ] Confirmar que todos os vendedores sabem qual sessao/numero usar.
- [ ] Registrar o numero validado e a data do teste neste documento.

Numero validado: ____________________

Data do teste: ____/____/______

Observacao: o CRM abre a conversa com o telefone do contato. A garantia de numero unico depende da sessao/conta WhatsApp usada pelo operador.

## Checklist Meta/API

### Conta e acesso

- [ ] Business Manager e conta WhatsApp Business identificados.
- [ ] Numero comercial aprovado e com nome de exibicao confirmado.
- [ ] Administradores, operadores e permissao de acesso registrados.
- [ ] Metodo de recuperacao e responsavel pela conta definidos.

### Templates e janela de atendimento

- [ ] Templates necessarios identificados por finalidade.
- [ ] Templates submetidos e aprovados pela Meta antes de uso fora da janela de 24 horas.
- [ ] Opt-in do contato registrado quando houver mensagem iniciada pelo negocio.
- [ ] Regra de opt-out e tratamento de bloqueio definida.
- [ ] Janela de 24 horas explicada ao time comercial.

### Operacao e evidencias

- [ ] Teste de envio e recebimento concluido com o numero unico.
- [ ] Entrega, falha e resposta do contato verificadas.
- [ ] Fluxo de atendimento manual definido para falha da API ou indisponibilidade do WhatsApp.
- [ ] Criterio de go/no-go registrado antes de qualquer automacao.

## Fora da S3

- OAuth completo do Google/Meet.
- Disparo automatico de campanhas.
- Integracao de IA ou roteamento multicanal.
