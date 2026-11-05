# Financeiro integrado da Projete

Escopo aprovado: vendas internas e Hotmart, recebíveis/pagáveis Conta Azul, comissões revisadas e relatório diário do Thiago. Emissão fiscal manual; nenhum novo serviço pago.

## Entregas

1. Modelo financeiro com centavos inteiros, trilha de auditoria e testes de regras.
2. Importação idempotente do CRM e Hotmart (histórico e webhook autenticado).
3. Integração Conta Azul: fila durável, vínculo dos registros, importação paginada e detecção de divergências. Escritas dependem da configuração confirmada da empresa e das categorias/contas.
4. Calendário conferido pelo financeiro e liberação de comissões com data/evidência explícitas; fechamento imutável e títulos para o dia 15 seguinte.
5. Relatório consolidado gerado pela Projete, CSV e entrega diária opcional; pendências e atualização das fontes visíveis. Apps Script excluído por orientação do usuário.
6. Área `/financeiro`, controle de acesso, configuração e operação; validação local com PostgreSQL isolado e APIs simuladas na borda.

## Limites e decisões

- Projete é a plataforma, não há middleware BTerminal separado.
- Sem inferir parcelas futuras de uma compra Hotmart. Modalidade desconhecida permanece em conferência.
- Fechamento de venda não libera automaticamente comissão. Enquanto a regra de desembolso estiver aberta, o financeiro registra data e evidência de liberação.
- Fundo comercial continua no fluxo existente; não é transformado em conta a pagar individual.
- Importação não altera os dados comerciais originais, nem recalcula comissões aprovadas.
- Conta Azul é fonte dos registros financeiros formais. Registros locais não sincronizados são exibidos separadamente dos valores confirmados no ERP.
- Requisição de escrita com resultado inconclusivo fica para conciliação, sem repetição automática cega.
- Emissão fiscal e integração Slack/Google exigem configuração; nenhuma mensagem real é enviada na validação.
- Credenciais ausentes impedem execução dos respectivos conectores, mas não a conferência e o uso local do módulo.

## Referências de contrato verificadas em 2026-11-05

- https://developers.contaazul.com/docs/financial-apis-openapi/v1/createreceivable
- https://developers.contaazul.com/docs/financial-apis-openapi/v1/createpayable
- https://developers.contaazul.com/docs/financial-apis-openapi/v1/searchinstallmentstoreceivebyfilter
- https://developers.contaazul.com/open-api-docs/open-api-person/v1/criarpessoa
- https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/purchase-webhook/
- https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-history/
- https://developers.hotmart.com/docs/pt-BR/v1/sales/sales-commissions/
