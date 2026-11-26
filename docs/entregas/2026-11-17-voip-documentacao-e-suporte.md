# Voip do Brasil: documentação e solicitação urgente

Verificação em 17/11/2026. Complementa `2026-11-17-commercial-features.md`.

## Referências oficiais encontradas

| Documento | O que confirma |
| --- | --- |
| [Integrações e APIs](https://suporte.voipdobrasil.com.br/integracoes) | Lista conectores suportados, documenta publicamente a API de SMS e orienta contatar o suporte para integração personalizada de CRM próprio. |
| [Integração Pipedrive](https://suporte.voipdobrasil.com.br/integracao-pipedrive) | Geração de chave/link no painel, substituição do ramal e chamadas por clique. O conector inclui histórico/gravações dentro do Pipedrive; o guia não apresenta contrato REST de voz/CDR para CRM próprio. |
| [Manual Pipedrive em PDF, página 4](https://pipedrive.voipdobrasil.com.br/conteudo/tutorial_voipdobrasil_pipedrive.pdf) | Exibe `https://pipedrive.voipdobrasil.com.br/api.php` com os parâmetros `ramal`, `number` e `key`. A imagem foi renderizada e conferida. Nenhuma chave ilustrativa do manual foi usada. |
| [Integração PipeRun](https://suporte.voipdobrasil.com.br/integracao-piperun) | Gera um link exclusivo da conta; o usuário do conector corresponde ao ramal. |
| [Integração Movidesk](https://suporte.voipdobrasil.com.br/integracao-movidesk) | Usa um código gerado pelo painel e permite consultar informações da chamada dentro do Movidesk. Não fornece endpoints de CDR genéricos. |
| [Integração LiveAgent](https://suporte.voipdobrasil.com.br/integracao-liveagent) e [JivoChat](https://suporte.voipdobrasil.com.br/integracao-jivochat) | Usam credenciais SIP para conectar o ramal a esses produtos. Não comprovam uma API HTTP de voz para a Projete. |

Uma leitura pública de `https://pipedrive.voipdobrasil.com.br/api.php`, sem credencial, ramal ou destino, devolveu HTML com “Seu acesso está inativo” e “DADOS DE SESSÃO INCOMPLETOS”. Portanto, o endpoint do manual é uma interface de discagem do conector; não se deve tratá-lo como uma API REST que confirma uma chamada por JSON, nem supor endpoints de histórico a partir dele. Nenhuma ligação foi iniciada.

## Contato autorizado com o suporte

O usuário autorizou explicitamente enviar o pedido pelo chat oficial. Na sessão Safari, foi aberto o chat da página oficial de integrações e enviada a solicitação:

> Precisamos integrar com urgência o CRM próprio Projete aos ramais existentes da nossa conta Voip do Brasil para iniciar chamadas (click-to-call) e consultar histórico/CDR. Enviem a documentação técnica da API de voz, endereço base/endpoints, autenticação e procedimento de habilitação para CRM próprio. Precisamos também dos eventos/webhooks de chamadas, duração, resultado e gravações. Não autorizamos contratação de serviços adicionais. Se necessário, por favor encaminhe para o suporte técnico humano responsável por integrações.

A assistente automática Helena apontou inicialmente um artigo geral de telefonia. Foi informado que os guias de CRMs e SMS já haviam sido consultados e reiterado o pedido de documentação direta da API de voz/CDR e encaminhamento humano.

Resultado visível no chat:

- As duas mensagens foram exibidas com confirmação de envio.
- A assistente informou que transferiria a solicitação ao suporte técnico de integrações.
- Em seguida, o chat informou estar fora do horário de atendimento e não haver ninguém disponível.
- Não houve resposta humana, protocolo de atendimento ou documentação técnica de voz/CDR entregue durante a sessão.
- A aba de suporte permanece aberta no Safari. Nenhum serviço adicional foi contratado e nenhuma chave foi gerada.

## Próxima informação necessária para ativação real

Obter do fornecedor a habilitação apropriada para a Projete e o contrato técnico de voz: como iniciar uma chamada, identificar o resultado e reconciliar resultados incertos; como consultar ou receber CDR com identificador único, ramal, destino, horários, duração e resultado. A URL de discagem demonstrada no manual pode ser um caminho inicial se o fornecedor confirmar que a chave/conector pode ser usado pelo CRM próprio. Não é evidência de que a Projete já esteja conectada.

Ramais já verificados no painel: Ana Graciele `4220115` e Elisson Cruz `4220116`, ambos exibidos como Registrado. O registro SIP não comprova habilitação de API.

## Atualização — contato por email em 19/11/2026

Após nova solicitação explícita do usuário para entrar em contato com o fornecedor, foi formalizado um pedido urgente por email:

- De: Paulo Loureiro `<paulo@sigmaintel.io>`.
- Para: `contato@voipdobrasil.com.br`, publicado no [canal oficial de contato](https://novosite.voipdobrasil.com.br/v1/fale-conosco/).
- Assunto: `URGENTE — API de voz e CDR para integração do CRM Projete | PROJETUS LTDA`.
- Envio confirmado pelo Gmail em 19/11/2026 às 11:09:40 EST (13:09:40 de Brasília), com marcador `SENT`.
- [Abrir email enviado](https://mail.google.com/mail/u/?authuser=paulo%40sigmaintel.io#all/1a1f49222fef34de).

O pedido identifica a conta PROJETUS por seu email principal e solicita documentação de voz, click-to-call, CDR, webhooks, autenticação, habilitação para CRM próprio, limites de uso, paginação e tratamento de retentativas. Solicita encaminhamento ao responsável técnico, número de protocolo e prazo de retorno. Explicita que não autoriza serviços adicionais, cobranças ou alterações nos ramais em funcionamento.

Nenhuma credencial ou senha foi enviada. O registro confirma o envio do pedido; não confirma resposta humana, emissão de protocolo ou liberação de acesso à API.
