# BI Financeiro com dados do Conta Azul

Data: 2026-10-08
Status: aprovado (design + protótipo)
Protótipo aprovado: https://claude.ai/artifact/1VuRF9G6BZEiemgY8JjCWJ (dados fictícios)

## 1. Objetivo

Dar ao Thiago (gestor financeiro), a gestores e a admins uma área própria **Financeiro** no Projete, separada do BI comercial, alimentada pelo Conta Azul (ERP da PROJETUS LTDA, já conectado via OAuth em `/admin/conta-azul`).

Momentos de uso:

- **Diário (peso maior):** quanto há em conta, o que entra e sai nos próximos 7 dias, quem atrasou. Decisões: cobrar, segurar pagamento.
- **Mensal:** fechar e apresentar o resultado (DRE) aos sócios.

Fase 1 (este spec): Visão geral, Resultado (DRE), Caixa, Pagar e receber, Clientes e CRM, posição financeira simplificada.

Fase 2 (fora deste spec): churn, velocidade de vendas, projeção de receita recorrente, relatório mensal por e-mail até o dia 5, ajustes da lista de KPIs do Thiago.

## 2. Fatos verificados na API real (2026-10-08)

- Volume total: 1.019 títulos a receber e 2.248 a pagar. A carga completa leva cerca de 3,3 mil chamadas de detalhe.
- `GET /v1/financeiro/eventos-financeiros/contas-a-{receber,pagar}/buscar`:
  - `data_vencimento_de/ate` é obrigatório; aceita janela larga (2015 a 2030 testado).
  - Devolve `itens[]` (id = id da parcela) e `totais` {pago, vencido, vence_hoje, pendente, aberto, todos}.
  - Não traz conta bancária, data real de pagamento, rateio nem `evento.id`.
- `GET /v1/financeiro/eventos-financeiros/parcelas/{id}` traz `evento` {id, tipo, data_competencia, condicao_pagamento, referencia.origem, rateio[]}, `baixas[]` (data_pagamento, valor_composicao, conta_financeira), `valor_composicao`, `conta_financeira`, `data_alteracao`.
- `GET /v1/financeiro/eventos-financeiros/{evento_id}/parcelas` devolve todas as parcelas do lançamento, com detalhe.
- **`evento.rateio` traz o total do lançamento e se repete em cada parcela.** Exemplo real: 3 parcelas de R$ 4.801,88 com rateio de R$ 14.405,64 em cada uma. O rateio é derivado uma vez por lançamento.
- `GET /v1/financeiro/categorias-dre` devolve a árvore oficial do DRE: grupos 01 a 07, totalizadores com `indica_totalizador` e `categorias_financeiras[]` por linha.
- `GET /v1/categorias` (157, com `categoria_pai`), `/v1/centro-de-custo` (18), `/v1/conta-financeira` (24) e `/v1/conta-financeira/{id}/saldo-atual` (só o saldo atual, sem histórico).
- `GET /v1/pessoas/{id}` traz `documento` (CNPJ/CPF). A listagem tem defaults `tipo_perfil=Cliente` e `tipos_pessoa=Física`, então os filtros precisam ir explícitos.
- Limites e comportamento da API:
  - 600 req/min e 10 req/s por conta conectada; excesso devolve 429.
  - Sem webhooks.
  - Datas em horário de São Paulo, sem offset.
- **Refresh tokens rotacionam e são de uso único.** Dois refresh simultâneos derrubam a conexão.

## 3. Modelo de dados

Migration `migrations/create_conta_azul_finance.sql`:

- Aplicada no btdb como `postgres`, com `GRANT SELECT, INSERT, UPDATE, DELETE` para `sigma_app`.
- Sem DDL em runtime. Motivo: o commit 963ab44 mostrou que o app não é dono das tabelas.

| Tabela | Grão | Campos principais |
|---|---|---|
| `conta_azul_parcelas` | 1 por parcela (PK = id CA) | evento_id, tipo (RECEITA/DESPESA), status (detalhe), status_busca, descricao, data_vencimento, data_competencia, valor_total, valor_pago, nao_pago, perda, pessoa_id/pessoa_nome, conta_financeira_id, origem, `ca_data_alteracao` (da busca), `detail_alteracao` (da última leitura de detalhe), `payload` JSONB (detalhe), `busca_payload` JSONB, synced_at, deleted_at |
| `conta_azul_baixas` | 1 por baixa | parcela_id, evento_id, tipo, data_pagamento, valor_bruto, juros, multa, desconto, taxa, valor_liquido, conta_financeira_id, metodo_pagamento |
| `conta_azul_rateio` | 1 por (lançamento, categoria, centro de custo) | evento_id, linha, tipo, categoria_id, centro_custo_id (nulo sem rateio de CC), valor, data_competencia, origem |
| `conta_azul_categorias` | dimensão | nome, tipo, categoria_pai, entrada_dre, considera_custo_dre, ativo |
| `conta_azul_dre_linhas` | dimensão | parent_id, codigo, descricao, posicao, totalizador, nivel |
| `conta_azul_dre_categorias` | ponte | dre_linha_id, categoria_id |
| `conta_azul_centros_custo` | dimensão | codigo, nome, ativo |
| `conta_azul_contas_financeiras` | dimensão | nome, banco, tipo, ativo, conta_padrao |
| `conta_azul_pessoas` | dimensão | nome, documento, documento_digits, tipo_pessoa, perfis |
| `conta_azul_saldos_diarios` | 1 por conta/dia (data SP) | saldo, captured_at |

Execuções:

- Reaproveitam `conta_azul_sync_runs` com `direction='pull'` e trigger `cron`, `manual` ou `web`.
- `metadata` guarda o progresso, as contagens e a conferência.
- Um índice único parcial em (connection_id) WHERE status='running' AND direction='pull' garante **um sync por vez** sem segurar conexão de banco.

As tabelas de push existentes (`conta_azul_sync_queue`, `conta_azul_entity_map`) não são tocadas.

### Regras de derivação (funções puras testadas)

1. **Rateio:** uma vez por `evento.id`.
   - Cada item de `rateio[]` vira uma linha por centro de custo em `rateio_centro_custo[]`.
   - Se a soma dos centros for menor que o valor do item, a sobra vai para uma linha com centro de custo nulo.
   - Sinal: RECEITA positivo, DESPESA negativo, aplicado na consulta.
2. **Baixas:** cada item de `baixas[]` da parcela.
3. **Caixa por categoria:** `baixa.valor_liquido × (rateio.valor ÷ Σ rateio.valor do lançamento)`.
4. **Linha do DRE de uma categoria:**
   - a linha que lista a categoria;
   - senão, a do ancestral mais próximo (`categoria_pai`);
   - senão, **"Sem linha no DRE"**, que aparece destacada e fica fora dos totalizadores.
5. **Totalizadores:** soma acumulada de todos os grupos anteriores, na ordem `posicao` da árvore.
6. **Exclusões:**
   - lançamentos com origem TRANSFERENCIA ficam fora do DRE e dos totais de caixa;
   - parcelas com status_busca PERDIDO ou RENEGOCIADO, ou status CANCELADO, ficam fora de "em aberto";
   - lançamentos com todas as parcelas canceladas ou removidas ficam fora do DRE.
7. **Aging:** pela data de vencimento, contra "hoje" em São Paulo: a vencer, 1–30, 31–60, 61–90, mais de 90.
8. **CNPJ:** só dígitos, para casar `conta_azul_pessoas.documento_digits` com `vendedor_projetos.cnpj`.

## 4. Sync

Código em `web/src/lib/conta-azul/sync/`. Roda dentro do app Next.js existente e reaproveita o OAuth atual.

### Gatilhos

- **Timer `projetus-cron@sync-conta-azul.timer`** no btapps, às 05:00 BRT, chamando `GET /api/cron/sync-conta-azul` com `CRON_SECRET`. Um drop-in `Environment=CRON_CURL_MAX_TIME=900` evita mexer no `run-cron.sh`, que é compartilhado. As units ficam versionadas em `docs/infra/systemd/`.
- **Botão "Sincronizar agora":**
  - `POST /api/financeiro/sync` cria a execução, dispara em segundo plano e devolve o id. A tela consulta `GET /api/financeiro/sync` a cada 3s.
  - Se já houver uma execução rodando, devolve essa. Se a última terminou há menos de 2 min, não cria outra.
- A primeira execução faz a carga completa.

### Etapas de uma execução

1. **Registro:** marca como `failed` as execuções `running` com mais de 30 min. Insere a nova; o índice único impede duas ao mesmo tempo.
2. **Dimensões** (~10 chamadas): categorias, árvore do DRE, centros de custo, contas financeiras.
3. **Varredura de IDs** (busca, 1.000 por página, vencimento de 2000-01-01 até hoje + 10 anos), para receber e para pagar:
   - grava o resumo de cada item e os `totais` da API;
   - `ca_data_alteracao` diferente de `detail_alteracao`, ou sem payload → precisa de detalhe;
   - id que sumiu da busca → `deleted_at`.
4. **Detalhes:**
   - Para cada parcela pendente: `GET parcelas/{id}`. Se o lançamento tem mais de uma parcela, `GET {evento}/parcelas` atualiza todas de uma vez.
   - Em uma transação: payload + baixas (apaga e reinsere) + rateio do lançamento (apaga e reinsere).
   - 3 workers compartilham um throttle de 6 req/s; uma execução sequencial fica presa na latência da API (cerca de 3 req/s).
   - Retry com backoff exponencial: 429 a partir de 2 s, 5xx a partir de 0,5 s, até 5 tentativas. Em 401, força o refresh uma única vez.
   - Se a cota do Conta Azul estourar mesmo assim, os detalhes param de forma limpa e a execução termina `partial` com `cota_excedida`. No teste real isso aconteceu perto de 3,1 mil chamadas em cerca de 20 min, abaixo do limite documentado.
   - **Orçamento de tempo:** 12 min no cron, 10 min no botão. Se estourar, a execução termina `partial` e a próxima continua de onde parou.
5. **Pessoas:** listagens explícitas (Cliente e Fornecedor × Física e Jurídica). Na implementação roda antes da varredura, para os CNPJs existirem mesmo quando o orçamento dos detalhes acaba.
6. **Saldos:** `saldo-atual` de cada conta ativa → upsert do snapshot do dia.
7. **Conferência:**
   - por tipo, o número de itens e as somas devem bater com `totais` da API (diferença ≤ R$ 1):
     - `pago` segue a regra da própria API: títulos liquidados pelo valor original, parciais pelo valor pago;
     - `aberto` = soma do não pago;
   - o número de lançamentos cujo Σ rateio difere do Σ valor das parcelas também é registrado;
   - divergência → `partial`, com o aviso visível na tela.
8. Atualiza `last_polled_at` da conexão.

### Token: correção obrigatória

`getValidAccessToken()` faz o refresh numa transação com `SELECT … FOR UPDATE` na linha da conexão e relê a expiração depois de pegar a trava. Se outro processo já renovou, usa o token novo. Também aceita `{ forceRefresh: true }` para o caso de 401.

### Falhas

- `invalid_grant` no refresh → conexão `expired`, execução `failed`, banner "Reconectar Conta Azul".
- Erros vão para o Sentry (já instrumentado).
- O histórico das últimas 10 execuções aparece em `/admin/conta-azul`.

## 5. Telas (fase 1)

Seguem o protótipo aprovado e o brief abaixo. Tudo fica sob `/financeiro`, com um layout comum:

- título, carimbo "Atualizado …" e o botão "Sincronizar agora";
- abas em rotas;
- filtro de período e de centro de custo na URL.

APIs: `/api/financeiro/{overview,resultado,caixa,titulos,clientes,sync}` e `/api/financeiro/titulos/[id]`. **Leem só o banco**, nunca a API do Conta Azul.

- **Visão geral:**
  - saldo em contas + gráfico de 90 dias (snapshots realizados + projeção por títulos com vencimento a partir de hoje);
  - "Próximos 7 dias", com os recebimentos atrasados no topo;
  - resultado do último mês fechado em forma de equação, com variação contra o mês anterior;
  - aging do a receber + inadimplência;
  - a pagar das próximas 4 semanas;
  - posição financeira (saldo + a receber − a pagar − empréstimos a vencer), com a nota "não substitui o balanço contábil".
- **Resultado:**
  - receita × custos e despesas + faixa de resultado mensal;
  - DRE na árvore do CA, com linhas que abrem nas categorias, colunas por mês + total + AV% + Δ;
  - alternância competência/caixa, modo apresentação e exportação CSV (download gerado pela própria rota).
- **Caixa:**
  - entradas e saídas mensais (realizado + 3 meses previstos);
  - projeção de 13 semanas com o menor saldo destacado;
  - top categorias de saída;
  - contas com saldo atual e tendência pelos snapshots.
- **Pagar e receber:**
  - alternância receber/pagar, aging, chips (vencidos, hoje, 7 dias, 30 dias, liquidados, todos) e agrupamento por pessoa;
  - painel lateral do título com as baixas e o link para o Conta Azul.
- **Clientes e CRM:**
  - conciliação por CNPJ: conciliado, venda sem faturamento, valores divergentes (faturado < 90% do vendido), sem venda no CRM;
  - tabela por cliente e recebido por vendedor.

### Brief de design (resumo do impeccable shape)

- **Visual:**
  - Restrained, com o modo claro como alvo e paridade no escuro conforme o DESIGN.md.
  - Entradas em `#0072F7` (escuro `#3D8EF8`), saídas em `#E8692E`. A faixa de atraso usa uma escala de laranja em um só tom: no claro `#F0985C → #86380F`, no escuro `#9A4A22 → #F7AD72`.
  - Paleta validada contra daltonismo e contraste.
- **Tipografia e números:**
  - Inter com `tabular-nums` em colunas.
  - Números grandes em algarismos proporcionais.
  - Negativo com sinal "−" e cor, nunca só a cor.
- **Layout:**
  - Sem grade de KPICards iguais: números em faixas, equações e gráficos.
  - Gráficos com um eixo só, legendas, tooltip com crosshair e marcas de 2px.
- **Estados:**
  - carregando (skeleton);
  - primeira sincronização (progresso);
  - conexão expirada;
  - dados com mais de 26h;
  - conferência divergente;
  - período sem dados;
  - histórico de saldo ainda curto.

## 6. Acesso e menu

- `canReadBiFinanceiro(role)` em `lib/dal.ts`: gestor, admin, gestor_financeiro. A `canReadFinanceiro` atual não muda.
- Páginas `/financeiro/*` redirecionam para `/sem-permissao`; APIs devolvem 403. O POST de sync usa `canManageContaAzul`.
- `middleware.ts`:
  - o gestor_financeiro abre em `/financeiro`;
  - `/financeiro` e `/api/financeiro` entram na lista de caminhos liberados dele;
  - `/api/cron` já é público, com auth por `CRON_SECRET` na rota.
- `sidebar-nav-items.ts`: seção nova **Financeiro** (BI Financeiro + Conta Azul), primeira para o gestor_financeiro.
- NewsBanner atualizado no deploy das telas.

## 7. Testes e aceite

- `tsx --test`:
  - derivação de rateio (o caso real de 3 parcelas não triplica);
  - rateio de baixa;
  - linha do DRE por ancestral;
  - totalizadores;
  - aging;
  - CNPJ;
  - diff da varredura (novo, alterado, removido);
  - parse das chaves inconsistentes da API (`itens`/`items`, `itens_totais`/`totalItems`).
- Lock do token: duas chamadas simultâneas com o token vencido → um único refresh.
- **Aceite em produção:**
  - após a carga completa, as somas batem com os `totais` da API;
  - o Thiago confere 3 títulos contra a tela do Conta Azul.

## 8. Rollout

Uma PR única para `main`. A divisão em duas foi abandonada porque o redirect do gestor financeiro e as correções do teste com dados reais ficaram em commits misturados.

1. Aplicar a migration no btdb.
2. Merge no `main` (Coolify faz o deploy), de preferência fora do horário de uso.
3. Primeira importação a partir do btapps: chamar a rota de cron com `CRON_SECRET` e `--max-time 900`. Esperar pelo menos 1 hora depois de qualquer outro uso intenso da API, por causa da cota. Pode precisar de duas execuções.
4. Conferir a reconciliação em `/admin/conta-azul`.
5. Instalar o timer e o drop-in no btapps (`daemon-reload`, `enable --now`, `list-timers`).

Cada passo é confirmado com o responsável antes de executar.

## 9. Achados nos dados reais (teste de 2026-10-08)

- Cerca de 50% do valor do rateio está em categorias sem linha no DRE do Conta Azul. As maiores:
  - Prestação de Serviço PJ, Serviços Prestados, Cartão de Crédito (precisam ser classificadas);
  - Distribuição de Lucro, Empréstimos de Bancos, Transferência entre Empresas do Grupo (ficam fora de propósito).
- A conta do Conta Azul reúne contas bancárias de várias empresas do grupo (PROJETUS, TALENT HUB, ATOM, TS&CO, ACADEMIA, PAD). Há 12 contas com saldo negativo, sinal de conciliação pendente.
- Das 62 vendas fechadas no CRM, só 21 CNPJs existem como pessoa no Conta Azul.
- O "a pagar" inclui parcelas de empréstimo até 2031, então a posição líquida inclui obrigações de longo prazo.

## 10. Riscos e pontos em aberto

- **Renegociações** (status RENEGOCIADO) podem gerar novos lançamentos. A conferência da carga completa mostra se há dupla contagem no DRE. Se houver, a regra de exclusão é ajustada.
- **URLs de OAuth:** a documentação diz que mudaram em 14/08/2026 (`login.contaazul.com`, `api-v2.contaazul.com/oauth/token`). As atuais ainda funcionam, inclusive o refresh de hoje. Acompanhar uma possível data de desligamento.
- **Histórico de saldo** só existe a partir do primeiro snapshot. A reconstrução retroativa fica fora do escopo, por causa do risco de contar transferências em dobro.
