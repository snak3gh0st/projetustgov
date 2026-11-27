# Despesas e reembolsos

Entrada compartilhada `/despesas` em todas as áreas e no menu do Financeiro. Qualquer usuário ativo pode registrar sua solicitação. O módulo não concede acesso ao restante do Financeiro, ao CRM nem ao Workspace pessoal de outras pessoas.

## Responsáveis confirmados

Mapeamento informado por Paulo no fluxo de despesas:

| Responsabilidade no fluxo | Pessoa | Cadastro na política |
| --- | --- | --- |
| Validação inicial e aprovação do reembolso | Head do setor | Head e substituto por área |
| Análise administrativa | Gabrielle | Análise administrativa |
| Autorização e protocolo | Rafael (COO) ou Philipe (CEO) | Autoridade e limite de alçada |
| Execução da compra pela empresa | Gabrielle ou Ysaak | Execução da compra |
| Conferência da obrigação ou liberação do reembolso | Thiago | Conferência e liberação financeira |
| Lançamento no Conta Azul e conciliação | Deivety | Conta Azul e conciliação |
| Pagamento | Responsável pela autorização bancária | Autorização bancária |

Rafael, Philipe e Thiago foram identificados no cadastro em consulta somente leitura em 12/11/2026. Thiago também responde como Head do Financeiro. Cabe à empresa vincular as contas ativas, informar os demais Heads, substitutos, alçadas e titular da autorização bancária e completar a política. Para despesas do próprio responsável, designe outra pessoa para as etapas em que ela precisaria atuar.

## Preparação

1. Aplicar `20261105_financeiro_integrado.sql` se necessário e executar `npm run db:expenses:migrate` com a conexão correta. A migração é aditiva e reaplicável. Não liga conectores ou canais de entrega.
2. Administração ou Diretoria cadastra a política aprovada, suas áreas, Heads/substitutos, responsáveis de cada etapa, autoridades COO/CEO e limites de valor. As responsabilidades deste módulo são explícitas, independentes dos perfis gerais (por exemplo, `gestor` continua sendo gestor comercial).
3. Configurar categorias de despesa, dispensas e limites, documentos obrigatórios e IDs contábeis do Conta Azul. Confirmar o calendário nacional, estadual e municipal e os anos abrangidos, inclusive o seguinte para a virada de ano.
4. Confirmar a empresa e conta financeira na operação Conta Azul. Vincular o integrante a um fornecedor existente em “Beneficiários e fornecedores”. Essa vinculação não é criada a partir do nome da pessoa.
5. Ativar a política somente depois de validar as regras. A referência cadastrada identifica o documento aprovado; o sistema não inventa nem aprova a política corporativa.
6. Validar uma autorização, uma dispensa, uma compra pela empresa e um reembolso em ambiente de homologação, inclusive uma devolução para ajuste.
7. Para criar títulos automaticamente, habilitar separadamente a integração de despesas e os envios financeiros já existentes. Este trabalho não altera esses flags. **Habilitar o flag global tem efeitos no fluxo financeiro existente**; alinhar sua ativação com o Financeiro.
8. Publicar somente pela infraestrutura Coolify descrita em `infra/CURRENT_INFRA.md`. Verificar migração, commit da fila, imagem ativa e comportamento autenticado na URL canônica.

## Fluxos

Autorização: rascunho → Head → Administrativo → COO/CEO com alçada → autorização aprovada, protocolo único, modalidade, valor e condições. A autoridade registra sua própria decisão autenticada. O Administrativo encaminha a decisão; não atribui a terceiros uma aprovação feita por ele.

Reembolso: rascunho + comprovante + autorização, ou dispensa permitida → Head → Financeiro → lançamento local e pendência para o responsável pelo Conta Azul. Aprovação do Head não cria título. O Financeiro pode devolver, rejeitar ou encaminhar uma exceção para autoridade com alçada. A resposta da autoridade devolve ao Financeiro; não cria o título nem dispensa as validações obrigatórias.

Compra pela empresa: o responsável pela execução da compra registra a execução de uma autorização aprovada na modalidade “empresa”, informa fornecedor e vencimento negociado, anexa comprovante e encaminha ao Financeiro. Não é um reembolso do integrante. O vencimento negociado é preservado.

Uma devolução permite alteração exclusivamente pelo solicitante. O reenvio reinicia a conferência (Head para autorizações/reembolsos, Financeiro para compra já autorizada). Uma solicitação liberada não pode ser editada por este fluxo; ajustes posteriores no ERP exigem conciliação própria.

## Controles

- Nenhuma etapa de aprovação/liberação pode ser executada pelo próprio solicitante. Um substituto ou outra autoridade com alçada é necessário. Não há privilégio implícito de aprovação por ser administrador do sistema.
- Solicitante visualiza seu pedido; Head acessa sua área; Os demais responsáveis acessam as solicitações conforme sua etapa. O painel exibe a próxima etapa e seus responsáveis ativos. Rascunhos privados não são listados nas filas de outras pessoas.
- Políticas versionadas: a submissão congela regras e responsáveis da análise. O reenvio após ajustes usa a política vigente. A suspensão da política impede novas submissões/liberações/exportações. Substitutos devem ser cadastrados antes da submissão; mudanças de responsáveis não reatribuem silenciosamente pedidos antigos.
- D+2 usa a data de liberação no fuso `America/Sao_Paulo`, exclui sábados, domingos e feriados cadastrados, exige anos de calendário confirmados e fica congelado na liberação. A política não tem horário de corte presumido.
- Reembolsos parciais reservam saldo da autorização ao entrar na análise. Somam-se solicitações em andamento/liberadas; rascunhos, ajustes, rejeições e cancelamentos não consomem saldo. Área, categoria, período, modalidade e titular devem corresponder à autorização.
- Comprovantes idênticos por hash não podem sustentar outra despesa em andamento/liberada. Essa é uma verificação de reutilização do mesmo arquivo, não de autenticidade do documento ou de equivalência entre arquivos diferentes.
- Documentos ficam privados no PostgreSQL da Projete: PDF/JPEG/PNG/WebP, até 5 MB cada, dez ativos e trinta versões por pedido. Remoção é lógica, preserva o binário histórico. Downloads conferem acesso à solicitação, usam `attachment`, `nosniff`, sandbox e cache privado. Incluir esses dados nos backups e na política de retenção institucional.
- Auditoria registra ator, motivo, revisão, política e conjunto de documentos da decisão. As notificações internas avisam solicitante e próximos responsáveis. Nenhuma mensagem externa ou novo envio financeiro é ativado por instalar o módulo.

## Conta Azul

Após a liberação, o lançamento local tem `source_ref=expense:<id>` e uma única tarefa financeira. Categoria, centro de custo e conta financeira são congelados para aquela liberação. O conector usa `/v1/financeiro/contas-a-pagar`; registra os IDs de evento e parcela após a confirmação.

Na política com responsabilidades por etapa, a liberação cria o título local. O responsável pelo Conta Azul envia pela Projete ou vincula a parcela existente após conferir tipo, fornecedor, valor e vencimento. A criação pela integração requer os dois flags. Falhas confirmadas podem ser reenviadas. Resultados incertos exigem conferência do lançamento existente.

Após o vínculo com o Conta Azul, o responsável pela autorização bancária efetua o pagamento no banco e registra a referência na Projete. A conciliação pode ser concluída pelo responsável pelo Conta Azul após a sincronização confirmar a baixa integral. O histórico identifica quem registrou o pagamento e quem concluiu a conciliação.

O envio imediato e o cron dedicado continuam atendendo apenas solicitações submetidas sob políticas anteriores, que não tinham responsáveis separados. A fila financeira tradicional continua excluindo todas as despesas deste módulo. Reaplique a migração antes de atualizar o módulo para criar os campos de acompanhamento bancário.

O painel mostra totais somente das solicitações visíveis (até 200 recentes, com indicação de limite), filas, histórico e integração. Ainda não altera os e-mails de Thiago/Philipe nem inclui um novo relatório externo. O campo de cliente/projeto é uma referência informativa nesta versão.

## Validação

`EXPENSE_TEST_DATABASE_URL` deve apontar para PostgreSQL local isolado cujo nome contenha `expenses_test`. Rodar `npx tsx --test tests/expenses.test.mjs`; os testes aplicam e reaplicam migrações e exercitam fluxo, permissões, conflitos, duplicidade, saldo, calendário e API simulada do Conta Azul sem lançamentos reais.

`EXPENSE_TEST_BASE_URL` com a mesma base isolada habilita `tests/expenses-http.test.mjs` para autenticação, isolamento de áreas, origem, documentos privados e decisão via HTTP. Não usar credenciais ou dados reais nesses testes.
