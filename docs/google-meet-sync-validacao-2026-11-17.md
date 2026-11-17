# Google Meet — sincronização de reuniões existentes

## Diagnóstico

O endpoint de eventos consultava somente `workspace_links`, buscando no Google os IDs já conhecidos pela Projete. Não havia chamada a `events.list`. A interface ainda exigia cliente/projeto e selecionava o primeiro cliente automaticamente, impedindo uma visualização pessoal da agenda.

Consulta somente leitura em produção em 17/11: quatro contas Google ativas na Projete, todas sem vínculos locais de eventos. Na agenda principal da conta administrativa conectada, a API oficial retornou **40 eventos no intervalo de 90 dias anteriores e seguintes, sendo 38 com Meet**, sem página adicional. Apenas contagens foram exibidas; não foram exportados títulos, pautas, participantes ou credenciais. Nenhum evento, convite ou configuração foi alterado.

## Correção

- Agenda pessoal por conta conectada, independente de cliente; acesso por cliente continua protegido pelo CRM e filtra contatos exatos/vínculos explícitos.
- Leitura de `events.list`, calendários com permissão de leitura, intervalos navegáveis, recorrências expandidas, cancelamentos excluídos e paginação explícita, inclusive para páginas filtradas vazias.
- Meet exibe compromissos com Google Meet. Consulta automática ao abrir, ao retornar à janela e a cada minuto quando visível; atualização manual e indicação da última consulta bem-sucedida.
- Reuniões encontradas no Google podem ser vinculadas explicitamente ao projeto. A vinculação é local, idempotente e não envia outro convite nem recria o evento.
- Dados privados/redigidos não são reconstruídos a partir de metadados locais. A agenda da equipe continua omitindo pauta e participantes pessoais.
- Sem migração, novas variáveis ou ampliação de escopos. A mudança não inclui o módulo de despesas do PR #72 nem alterações financeiras/Hotmart.

## Evidências locais

- **53 testes passaram, sem skips:** domínio, DTO Google, sincronização existente, paginação, edição/exclusão externa, recorrência, privacidade, isolamento por contato/projeto, idempotência e fluxo com PostgreSQL isolado (`projete_workspace_sync_test`).
- **12 testes HTTP passaram, sem skips:** sessões, OAuth/refresh simulado, origem, permissões, ferramentas existentes, agenda pessoal sem cliente e vinculação de reunião preexistente.
- TypeScript, lint direcionado e build Next passaram.
- Chrome nativo, desktop/tema escuro, conta e Google fictícios: a área Meet abriu em “Minha agenda Google” e exibiu “Reunião criada antes no Google”, data, link do Meet, seleção de período e horário da consulta. A navegação por extensão estava indisponível; a conferência foi feita pela interface nativa em uma aba local separada. Visual mobile não exercitado.

Não foram enviadas mensagens/convites reais nem alteradas permissões ou eventos Google durante a validação. A leitura real de produção foi limitada à agenda principal administrativa e às contagens do diagnóstico. A aceitação visual autenticada com a conta real permanece distinta da conferência visual com dados fictícios.

Documentação de uso: [Google Workspace](google-workspace.md). API oficial: [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) e [calendarList.list](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list).
