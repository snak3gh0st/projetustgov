# Validação local — financeiro integrado

Implementação na branch `snak3gh0st/feat-financeiro-Integracoes`. A Projete concentra a operação; Apps Script foi retirado do escopo. Emissão fiscal manual.

## Evidência obtida

- `npm run build`: aprovado na versão final, incluindo validação TypeScript e lint. Permanecem três avisos anteriores em arquivos fora deste módulo, além do aviso da base Browserslist.
- Suíte final: **250 testes aprovados, nenhum ignorado**, com PostgreSQL isolado e aplicação local executando o build.
- Migração aditiva aplicada e reexecutada nas suítes concorrentes em PostgreSQL isolado; nenhuma migração em produção.
- Navegador: login de usuário financeiro fictício e conferência da nova seção no financeiro atual. CSV e restrições de acesso exercitados nas rotas HTTP. Cadastro financeiro do cliente, registro de nota manual e criação/liberação de comissão preenchidos e salvos pela interface Chrome. Nem todos os formulários receberam aceitação manual; o fluxo completo de fechamento foi exercitado pela API.
- Hotmart: webhook HTTP autenticado e repetido sem duplicação; histórico, paginação, comissões e participantes simulados na borda HTTP. Regra de produto gera o calendário uma única vez.
- Base atualizada com `origin/main` (`60921fe`), preservando o BI Financeiro e sua navegação. Leitura reutiliza o espelho existente; permissões seguem diretoria/admin/gestor financeiro.
- Espelho BI: IDs legados, baixas por data, origem desatualizada, sincronização parcial, cancelamentos e bloqueio durante atualização testados em PostgreSQL.
- Execuções: controle durável com heartbeat, compatível com PgBouncer; teste com pool de uma conexão comprova que chamadas externas não reservam conexão.
- Conta Azul: contrato síncrono atual, recuperação por vínculo, bloqueio de duplicidade manual e de troca da empresa testados com respostas simuladas. Nenhuma chamada autenticada real ao provedor.
- HTTP: fluxo completo de calendário, registro fiscal manual, comissão, liberação, fechamento repetido e demonstrativo aprovado; envio externo bloqueado por padrão.
- Comissões: importação das vendas Projete, preservação de papéis, liberação explícita, fechamento imutável, agrupamento por beneficiário e vencimento no dia 15 seguinte testados em PostgreSQL. Correções em comissões abertas revogam a liberação; reabertura no CRM cancela previsões locais sem afetar fechamentos aprovados.
- E-mail/Slack: implementação opcional, com prevenção de repetição e exposição de resultados desconhecidos. Nenhuma mensagem real enviada.

Comando da suíte final, executado contra o ambiente local fictício:

```sh
FINANCE_TEST_DATABASE_URL=postgresql://finance_test@127.0.0.1:55483/postgres \
FINANCE_TEST_BASE_URL=http://localhost:3017 \
FINANCE_TEST_HOTTOK=local-webhook-only npm test
```

## Limites antes de ativação

- Nenhum deploy ou migração de produção executado.
- Obter credenciais e IDs dos produtos Hotmart com Wallace/Tito.
- Confirmar modalidades das vendas, condições de parcelas, empresa responsável e o evento que libera as comissões.
- Aplicar migração no ambiente escolhido, configurar Conta Azul e conciliar o histórico/manual antes de habilitar envios.
- Configurar o agendador e os canais/usuários destinatários. Publicar o código não instala essas rotinas.
- Fazer aceitação com exemplos reais das duas origens, verificando os títulos e as baixas efetivamente presentes no ERP.

Operação e configuração detalhadas em `docs/financeiro-operacao.md`.
