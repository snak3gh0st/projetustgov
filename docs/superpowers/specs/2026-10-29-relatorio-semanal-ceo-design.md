# Relatório semanal para o CEO (Philipe)

Data: 29/10/2026 · Branch: `snak3gh0st/reports-managers`

## Por quê

O Philipe (CEO da TS&CO, papel `diretoria`) quer saber, toda sexta, como a semana fechou no
dinheiro e nas vendas, sem pedir números a ninguém. A referência é o painel de pagamentos da
TS&CO (agenda de pagamentos por dia, liquidez), mas com tudo o que o PROJETE já tem.

## O que entrega

1. **E-mail toda sexta às 18h (Brasília)**: resumo curto com alertas, números-chave, vendas da semana,
   agenda da próxima semana e botão "Abrir relatório completo".
2. **Página `/gestao/relatorio-semanal`** (diretoria/admin): versão completa e interativa
   (filtro por dia na agenda, tabelas), com seletor das semanas anteriores.

Cada envio grava um **retrato da semana** (`relatorio_semanal`, JSON). A página mostra o retrato
gravado, então o número que o Philipe leu na sexta não muda depois. A semana corrente aparece como
prévia ao vivo até ser gravada.

## Conteúdo

**Atenção** (regras simples, no topo): caixa projetado negativo nos próximos 30 dias; recebíveis
vencidos; contas a pagar em atraso; semana sem venda; faturamento do mês abaixo do mesmo ponto do
mês anterior; vendedor sem atividade na semana.

**Financeiro: grupo TS&CO** (espelho do Conta Azul, sincronizado às 05h)
- Caixa: saldo consolidado, variação na semana e saldo por empresa (pelo nome da conta bancária).
- Semana: recebido e pago (baixas da semana, sem transferências).
- Próxima semana: agenda dia a dia de contas a pagar e a receber, com lista de títulos.
- Atrasados: a receber vencido (principais clientes) e a pagar em atraso.
- Resultado: faturamento do mês até hoje x mesmo ponto do mês anterior; último mês fechado x anterior.
- Faturamento por negócio no mês (centro de custo normalizado).
- Posição líquida em 12 meses (saldo + a receber − a pagar).

**Comercial: PROJETUS** (CRM do PROJETE, o único negócio com CRM)
- Vendas fechadas na semana: lista com cliente, serviço, valor e vendedor; total do mês; últimas 8 semanas.
- Atividade do time: leads trabalhados, avanços, perdas e vendas por vendedor.
- Funil hoje e movimentação da semana (propostas, reuniões, sem interesse, churn, distribuídos).
- Carteira de vendas x financeiro: vendido, faturado, recebido, vencido (cruzamento CRM × Conta Azul).

## Definições

- **Semana**: sábado 00:00 até sexta 23:59 (America/Sao_Paulo). O relatório de sexta 18h cobre
  sábado a sexta; os dados financeiros são os da sincronização das 05h de sexta (aviso no rodapé).
- **Próxima semana**: sábado seguinte até a sexta seguinte.
- **Venda**: lead com `fechamento_at` dentro da semana (ação "fechar venda"). Status `Fechado`
  vindo da sincronização sem `fechamento_at` não conta. `tipo_servico` vazio aparece como "Não informado".
- **Atividade**: eventos `lead_events` de origem `manual` (o histórico existe desde 21/10/2026).
- **Empresa da conta bancária**: pelo nome da conta (PROJETUS, TS&CO/TSCO, ATOM, TALENT, ACADEMIA, PAD).
- **Negócio (centro de custo)**: normalizado num único mapa no código (`PROJETUS`/`Projetus`,
  `TALENT`/`TALENTHUB`, prefixo numérico removido). Sem centro de custo vira "Sem centro de custo".
  Academia do Empreendedor Público e Academia Empreendedora **ficam separadas** (contas bancárias distintas).

## Envio

- Rota `GET /api/cron/relatorio-semanal` (Bearer `CRON_SECRET`), chamada pelo timer
  `projetus-cron@relatorio-semanal.timer` no btapps, `OnCalendar=Fri *-*-* 18:00:00` (servidor em -03).
- Remetente `PROJETUS <report@projetus.org>` (`WEEKLY_REPORT_FROM`). Destinatários em `WEEKLY_REPORT_TO` (lista separada por vírgula). Sem a variável, grava o retrato e não envia.
- **Idempotente**: `relatorio_semanal.enviado_para` guarda quem já recebeu a semana; o `run-cron.sh`
  repete até 5 vezes em erro e não pode duplicar e-mail.
- Sempre envia a **última semana fechada** (sexta 18h). Rodar antes, ou com atraso, envia a semana
  anterior, que já pode ter saído (e então é pulada): nunca grava semana pela metade.
- `?preview=1` devolve o HTML sem gravar nem enviar; `?teste=1` envia `[TESTE]` para quem está logado
  (ou para `?to=` com o `CRON_SECRET`), também sem gravar. Testes usam só esses dois.
- Destinatário: Philipe (`philipe@projetus.org`), decisão do Paulo em 29/10/2026.

## Fora do escopo

Operação TransfereGov, CSM, WhatsApp, PDF anexo, edição manual do relatório.

## Decisões minhas (para o Paulo conferir)

- Canal: e-mail + página no PROJETE (e-mail não roda JS e o Gmail corta acima de ~100 KB).
- Semana de sábado a sexta.
- Academias separadas; Bate Papo por região (DF, MG, ARV).
