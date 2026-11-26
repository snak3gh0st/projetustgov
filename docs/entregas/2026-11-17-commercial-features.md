# Correções comerciais — 17/11/2026

Branch: `snak3gh0st/CommercialFeatures`, atualizada por fast-forward a partir de `origin/main` (`3f3b14c`).

## Implementação

- Consultores veem a fila de conversas sem projeto e sem atendente. Podem assumir o atendimento de forma atômica; depois disso, outro consultor não acessa a conversa sem vínculo. Conversas de projetos seguem as permissões de dono/closer existentes.
- Contatos indicados podem iniciar uma conversa sem criar projeto. Telefones já cadastrados em leads preservam suas restrições; é necessário abrir o card ou a conversa existente.
- Cartões de contato simples e múltiplos exibem nome e telefones. Reações aparecem na mensagem original; remoção de reação é respeitada. Respostas citadas e mensagens encapsuladas preservam texto e emojis. Reações não criam pendências de resposta nem contam como contato realizado.
- “Concluir atendimento”, disponível no WhatsApp e no Meu Dia, registra autor e horário sem enviar mensagem artificial ao cliente. A conclusão compara a mensagem recebida que o consultor viu; uma chegada concorrente impede a conclusão desatualizada. Nova mensagem recebida depois do atendimento volta a gerar pendência.
- Vendedor/coordenador pode enviar seu lead de Proposta Enviada para Aprovação e registrar Churn com motivo obrigatório. Fechamento, contrato e reversão de venda permanecem restritos à gestão. A gravação compara o status anterior para impedir que uma decisão concorrente seja sobrescrita.
- O painel principal passa a retornar Churn nas contagens globais e por vendedor. A ausência dessa chave fazia o card continuar em zero mesmo com registros nesse status.
- BI comercial: valores negociados substituem os valores das emendas no pipeline de receita; perdas e sem interesse são excluídos do pipeline aberto. Data de fechamento substitui `updated_at` no prazo de fechamento. Contagem por oportunidade/emenda, taxa de perdas e oportunidades sem valor ficam explícitas. Os aliases de status usam o catálogo central.
- Relatório diário no BI: contatos únicos, mensagens enviadas pela Projete, e-mails pelo Workspace, oportunidades movimentadas, perdas e ligações registradas manualmente. Datas usam America/Sao_Paulo. Vendedor/coordenador consulta apenas seus dados. Envio pelo aparelho sem autor identificado não é atribuído artificialmente a um consultor.
- Propostas pelo Workspace recebem CC automático para `PROPOSAL_COPY_EMAIL` (padrão: `comercial@projetus.org`, remetente de Rooger confirmado no email). A classificação usa a marcação explícita ou “proposta” no assunto, inclusive em respostas. O destinatário de cópia é definido pelo servidor, com validação de cabeçalhos. A configuração pode usar `PRIMARY_LEAD_MANAGER_EMAIL` como fallback.

## Preparação antes de publicar

1. Aplicar `migrations/20261117_commercial_attendance.sql` no banco do ambiente. É aditiva e foi testada reaplicada no PostgreSQL local. Pressupõe as migrações de WhatsApp já presentes na main.
2. Conferir `PROPOSAL_COPY_EMAIL` no ambiente (Rooger usa `comercial@projetus.org` no email recebido). A regra cobre mensagens enviadas pelo Workspace da Projete; envios diretamente no Gmail precisam de política própria.
3. Publicar seguindo `AGENTS.md` e `docs/infra/CURRENT_INFRA.md` (Coolify). Não foi feita publicação nesta implementação.
4. Validar com a equipe em produção: fila sem projeto, mensagens reais, conclusão de atendimento e dados do BI.
5. Contatos e reações antigos que foram salvos como “outro” sem conteúdo podem exigir reimportação pelo Evolution. O replay atualiza esses registros pelo identificador original, sem duplicar mensagens. Esta implementação não disparou reimportação em produção.

## Voip do Brasil: estado confirmado no Safari

Inspeção somente de leitura na sessão da conta PROJETUS em `cliente.voipdobrasil.com.br`, em 17/11/2026:

- Ana Graciele: usuário SIP/ramal `4220115`, exibido como Registrado.
- Elisson Cruz: usuário SIP/ramal `4220116`, exibido como Registrado.
- Servidor exibido: `voipdobrasil6.net.br`.
- O email encaminhado por Rooger contém acesso ao painel. Não contém contrato de API, token ou webhooks.
- Ferramentas → Integrações lista Pipedrive, Movidesk, LiveAgent, Piperun, Neoassist, Jivochat e Meetime. Nenhuma dessas integrações foi ativada em nome da Projete.
- O [manual público da integração Pipedrive](https://pipedrive.voipdobrasil.com.br/conteudo/tutorial_voipdobrasil_pipedrive.pdf) exige chave/link de integração; não documenta um contrato genérico para nosso CRM.
- Pendente com Eduardo/fornecedor: credencial e documentação para iniciar chamadas e consultar/receber CDR; identificar chamada, ramal, destino, horários, resultado, duração e paginação/retentativas. Só então vincular usuários aos ramais e ligar chamadas reais ao BI. Credenciais SIP não substituem a autorização da API. Nenhuma senha foi copiada para o repositório.
- Atualização: encontrados os guias atuais da central de suporte e enviada, com autorização explícita do usuário, uma solicitação urgente pelo chat oficial. A assistente tentou encaminhar ao time técnico; o chat informou estar fora do horário de atendimento, sem equipe disponível. Evidências e links em [Documentação e suporte VoIP](2026-11-17-voip-documentacao-e-suporte.md).

## Meta e agentes: dependências externas

- Meta Verified e agente de IA são frentes distintas. O plano citado (3 canais verificados e 6 dispositivos) corresponde ao Business Plus, sujeito à elegibilidade da conta: [documentação oficial](https://faq.whatsapp.com/3872729742954601/).
- Para atendimento comercial, avaliar o [Meta Business Agent](https://whatsappbusiness.com/pt-br/products/business-app-ai-agent/). A disponibilidade na conta, a integração de ferramentas e a convivência com o atendimento humano precisam de validação. Não foi contratado plano nem ativado agente.
- A conexão Evolution/Baileys das consultorias é preservada. A main já traz serialização do pareamento, distinção entre indisponibilidade e desconexão e persistência de eventos. A prevenção de quedas reais precisa de observação na instância implantada; o build e os testes locais não demonstram que as quedas cessaram.
- Fluxos futuros preservados: Projets qualifica e agenda com o consultor; Capte Recursos oferece o link Hotmart e transfere ao consultor quando necessário. Produtos, links, critérios de qualificação e calendário/responsável precisam ser definidos antes de ativar automação. Hotmart permanece pendente conforme AGENTS.md.

## Validação

- Build de produção e TypeScript.
- Testes direcionados de WhatsApp, MIME/CC e permissões de etapas.
- Regressão do Workspace com banco local e provedor Google simulado: idempotência, escopo e resultados incertos.
- Testes HTTP com autenticação real e PostgreSQL local isolado (`commercial_test`), usando Evolution simulado: fila compartilhada, disputa por atendimento, bloqueio de outro dono, conclusão, chegada concorrente, reabertura, cartões, reações, conversa sem projeto, aprovação, perda com motivo, fechamento restrito, contagem de Churn no painel, BI e relatório diário.
- Interface de WhatsApp conferida no navegador, inclusive a 390 px: cartão compartilhado e conclusão/reabertura visíveis.
- Sem alteração de produção, ramais, plano Meta ou envios a clientes.

Resultado local: build aprovado; 75 testes direcionados, 14 testes de regressão do Workspace e 5 testes HTTP aprovados (94 no total, sem skips nesses comandos). Os testes HTTP incluem nova mensagem no mesmo segundo e comparação do identificador da mensagem antes da conclusão.

Comandos dos testes HTTP (apenas servidor e banco locais; o provedor Evolution deve ser um simulador):

```sh
COMMERCIAL_TEST_BASE_URL=http://localhost:3109 \
COMMERCIAL_TEST_DATABASE_URL=postgresql://sigma_app@127.0.0.1:55439/commercial_test \
node --test tests/commercial-http.test.mjs
```
