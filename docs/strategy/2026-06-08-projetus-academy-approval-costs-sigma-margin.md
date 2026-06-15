# Projetus Academy: Documento de Aprovacao de Custos e Margem Sigma

Data: 8 de junho de 2026

Escopo: consolidar arquitetura, custos externos, benchmark contra Hotmart e opcoes de monetizacao da Sigma para aprovacao executiva.

## 1. Resumo executivo

Recomendacao:

- aprovar o `Projetus Academy` como produto proprio;
- manter `video` e `pagamento` terceirizados;
- operar com `Sigma platform no Stripe Connect`, assumindo que a plataforma vai `administrar pricing`;
- usar `Cloudflare Stream` para video;
- considerar `7%` como piso tecnico de take rate e `10%` como modelo comercial mais saudavel se a Sigma absorver Stripe + Connect;
- nao tentar reconstruir afiliacao, marketplace e ecossistema completo da Hotmart no MVP.

Leitura rapida:

- `sim`, o projeto e viavel tecnicamente;
- `sim`, existe economia relevante contra Hotmart;
- o maior custo recorrente nao e o video, e sim `pagamento + operacao`;
- com `Sigma platform` no Connect, `5%` deixa de ser saudavel;
- o valor final recomendado para aprovacao e:
  - `CAPEX: R$ 45.000,00`
  - `OPEX MVP mensal: R$ 1.317,13`
  - `total inicial de aprovacao: R$ 46.317,13`
  - `take rate Sigma recomendado: 10%`

## 2. Arquitetura aprovada

Topologia recomendada:

- app separado em `academy/`
- deploy separado do `web/`
- subdominio proprio
- mesmo PostgreSQL host, com `schema academy`

Stack:

- `Next.js`
- `TypeScript`
- `PostgreSQL`
- `Stripe Checkout`
- `Stripe Connect Standard`
- `Cloudflare Stream`
- `Resend`
- `Cloudflare R2` para anexos e materiais

Modelo financeiro:

- a `connected account` da Projetus recebe a venda
- a `Sigma platform` administra pricing e captura `application_fee_amount`
- a plataforma assume custos de `Stripe Payments` e `Stripe Connect`, com repasse precificado dentro do modelo comercial
- o checkout one-time comeca simples e com menor risco operacional

## 3. Custos oficiais validados em 8 de junho de 2026

### Stripe Payments Brasil

- cartao nacional: `3,99% + R$ 0,39` por transacao
- Pix: `1,19%`
- boleto pago: `R$ 3,45`
- Checkout: incluido sem custo adicional no Payments
- contestacao recebida: `R$ 55,00`

### Stripe Connect

Com `Sigma platform` administrando pricing:

- `R$ 6` por conta ativa no mes
- `0,25% + R$ 0,67` por repasse enviado
- a plataforma e responsavel pelas tarifas de processamento da Stripe e pode repassa-las aos seus usuarios

Premissa deste documento:

- `1 connected account ativa` no MVP inicial
- `1 payout por mes` para orcamento conservador simples

### Cloudflare Stream

- armazenamento: `US$ 5 / 1.000 minutos armazenados`
- entrega: `US$ 1 / 1.000 minutos assistidos`
- ingest e encoding: incluidos

### Resend

- free: `US$ 0` ate `3.000 emails/mes`
- pro: `US$ 20/mes` para `50.000 emails/mes`

### Cloudflare R2

- storage standard: `US$ 0,015 / GB-mes`
- free tier: `10 GB-mes`

### Hosting isolado opcional

Hetzner, preco oficial atual:

- `CAX11`: `EUR 4,49/mes`
- `CAX21`: `EUR 7,99/mes`

## 4. Benchmark oficial contra Hotmart

Hotmart validada em 8 de junho de 2026:

- taxa base: `9,9% + R$ 1,00`
- player Hotmart: `R$ 2,49` por transacao

Exemplo por venda de `R$ 997`:

- Hotmart + player: `R$ 102,19`
- Stripe cartao nacional: `R$ 40,17`
- Stripe mix `70% cartao / 30% Pix`: `R$ 31,68`

Economia bruta por venda contra Hotmart:

- contra Stripe cartao: `R$ 62,02`
- contra Stripe mix 70/30: `R$ 70,51`

## 5. Assuncoes para orcamento

Para manter a aprovacao comparavel, este documento usa:

- ticket medio: `R$ 997`
- acervo: `5.000 minutos` de video
- consumo medio: `600 minutos` assistidos por aluno por mes
- mix de pagamento: `70% cartao / 30% Pix`
- cambio orcamentario interno:
  - `US$ 1 = R$ 5,50`
  - `EUR 1 = R$ 6,20`

Observacao:

- esses cambios sao `premissas internas de orcamento`, nao cotacao de mercado em tempo real

## 6. CAPEX sugerido para aprovacao

Faixa recomendada para MVP serio:

- `R$ 35 mil a R$ 55 mil`

Essa faixa cobre:

- bootstrap do app `academy/`
- auth e area de aluno
- catalogo de curso, modulos e aulas
- integracao Stripe Checkout
- integracao Stripe Connect
- webhooks e conciliacao basica
- integracao Cloudflare Stream
- admin basico para produtos e conteudo
- deploy, observabilidade minima e hardening inicial

Leitura pratica:

- abaixo de `R$ 35 mil`, o risco e empurrar debito tecnico cedo demais
- acima de `R$ 55 mil`, ja vale revisar escopo para nao cair numa "Hotmart propria full"

## 7. OPEX mensal estimado da plataforma

### 7.1 Cenario MVP

Assumindo:

- `100 alunos ativos`
- `20 vendas/mes`

Custos mensais da plataforma:

- Cloudflare Stream: `US$ 85` = `R$ 467,50`
- Hosting Hetzner CAX21: `EUR 7,99` = `R$ 49,54`
- Resend Pro: `US$ 20` = `R$ 110,00`
- Stripe Payments mix 70/30: `R$ 633,57`
- Stripe Connect conta ativa: `R$ 6,00`
- Stripe Connect payout mensal: `R$ 50,52`

Total OPEX plataforma:

- `R$ 1.317,13/mes`

### 7.2 Cenario Grow

Assumindo:

- `300 alunos ativos`
- `60 vendas/mes`

Custos mensais da plataforma:

- Cloudflare Stream: `US$ 205` = `R$ 1.127,50`
- Hosting Hetzner CAX21: `EUR 7,99` = `R$ 49,54`
- Resend Pro: `US$ 20` = `R$ 110,00`
- Stripe Payments mix 70/30: `R$ 1.900,71`
- Stripe Connect conta ativa: `R$ 6,00`
- Stripe Connect payout mensal: `R$ 150,22`

Total OPEX plataforma:

- `R$ 3.343,97/mes`

### 7.3 Cenario Scale

Assumindo:

- `1.000 alunos ativos`
- `150 vendas/mes`

Custos mensais da plataforma:

- Cloudflare Stream: `US$ 625` = `R$ 3.437,50`
- Hosting Hetzner CAX21: `EUR 7,99` = `R$ 49,54`
- Resend Pro: `US$ 20` = `R$ 110,00`
- Stripe Payments mix 70/30: `R$ 4.751,77`
- Stripe Connect conta ativa: `R$ 6,00`
- Stripe Connect payout mensal: `R$ 374,55`

Total OPEX plataforma:

- `R$ 8.729,36/mes`

## 8. Comparacao de custo transacional mensal

Base:

- ticket `R$ 997`
- mix `70% cartao / 30% Pix`

| Cenario | Vendas/mes | Hotmart | Stripe mix 70/30 | Economia bruta |
| --- | ---: | ---: | ---: | ---: |
| MVP | 20 | R$ 2.043,86 | R$ 633,57 | R$ 1.410,29 |
| Grow | 60 | R$ 6.131,58 | R$ 1.900,71 | R$ 4.230,87 |
| Scale | 150 | R$ 15.328,95 | R$ 4.751,77 | R$ 10.577,17 |

Leitura pratica:

- so a troca de Hotmart para stack propria ja abre espaco real para margem
- essa economia cresce muito melhor com volume do que o custo de video

## 9. Opcoes de margem Sigma

### Opcao A: Sigma sem take rate transacional

Modelo:

- Sigma cobra apenas `implantacao`
- opcionalmente cobra `suporte mensal`
- `application_fee_amount = 0`

Quando faz sentido:

- se a aprovacao quiser reduzir friccao politica no go-live
- se a prioridade for lancar rapido e provar demanda

### Opcao B: Sigma com take rate de 3%

Modelo:

- Sigma cobra `3%` por venda

Leitura:

- comercialmente leve
- financeiramente apertado se a Sigma absorver OPEX

### Opcao C: Sigma com take rate de 5%

Modelo:

- Sigma cobra `5%` por venda

Leitura:

- insuficiente se a Sigma absorver Stripe + Connect + OPEX
- nao recomendado como modelo final neste cenario

### Opcao D: Sigma com take rate de 7% a 10%

Modelo:

- Sigma cobra `7%` ou `10%`

Leitura:

- `7%` e o piso operacional
- `10%` e o modelo comercial recomendado
- abaixo disso a Sigma corre risco de operar com margem muito comprimida

## 10. Margem Sigma mensal por cenario

Base:

- ticket `R$ 997`
- vendas `20 / 60 / 150` por mes
- calculo considerando `Sigma platform` com Stripe Payments + Connect absorvidos pela plataforma

| Sigma take rate | 20 vendas/mes | 60 vendas/mes | 150 vendas/mes |
| --- | ---: | ---: | ---: |
| 3% | R$ 598,20 | R$ 1.794,60 | R$ 4.486,50 |
| 5% | R$ 997,00 | R$ 2.991,00 | R$ 7.477,50 |
| 7% | R$ 1.395,80 | R$ 4.187,40 | R$ 10.468,50 |
| 10% | R$ 1.994,00 | R$ 5.982,00 | R$ 14.955,00 |

## 11. Margem Sigma liquida apos OPEX da plataforma

Se a Sigma tambem absorver OPEX operacional, a leitura muda para:

| Cenario | Take rate Sigma | Margem Sigma apos OPEX |
| --- | ---: | ---: |
| MVP: 20 vendas / 100 ativos | 5% | `-R$ 320,13/mes` |
| MVP: 20 vendas / 100 ativos | 7% | `R$ 78,67/mes` |
| MVP: 20 vendas / 100 ativos | 10% | `R$ 676,87/mes` |
| Grow: 60 vendas / 300 ativos | 10% | `R$ 2.638,03/mes` |
| Scale: 150 vendas / 1.000 ativos | 10% | `R$ 6.225,64/mes` |

Conclusao pratica:

- `5%` fica negativo no MVP
- `7%` e o piso tecnico
- `10%` e a recomendacao comercial final

## 12. Payback estimado do projeto

Tomando como referencia apenas a economia contra Hotmart:

| CAPEX MVP | 20 vendas/mes | 60 vendas/mes | 150 vendas/mes |
| --- | ---: | ---: | ---: |
| R$ 35 mil | 24,8 meses | 8,3 meses | 3,3 meses |
| R$ 45 mil | 31,9 meses | 10,6 meses | 4,3 meses |
| R$ 55 mil | 39,0 meses | 13,0 meses | 5,2 meses |

Leitura:

- em volume baixo, o payback e lento
- a partir de `60 vendas/mes`, a tese economica fica bem melhor
- em `150 vendas/mes`, a troca tende a se justificar rapidamente

## 13. Recomendacao para aprovacao

Minha recomendacao objetiva:

1. aprovar o `Projetus Academy` como `LMS proprio enxuto`
2. aprovar `CAPEX final de R$ 45.000,00`
3. aprovar `OPEX MVP mensal de R$ 1.317,13`
4. aprovar `total inicial de R$ 46.317,13`
5. aprovar `Sigma take rate de 10%` como modelo-base se a Sigma for operar como plataforma no Connect

## 14. Riscos e ressalvas

- a ressalva mais importante e confirmar com a Stripe se a monetizacao da Sigma via `application_fee_amount` no modelo final tera ou nao incidencia pratica da taxa de `0,25%`
- este documento ja assume que a Sigma operara `como plataforma no Connect` e por isso considera `R$ 6 por conta ativa` e `0,25% + R$ 0,67 por payout`
- o custo de `contestacao` da Stripe nao esta material em nenhum cenario acima; ele entra apenas se houver chargeback
- os valores em `USD` e `EUR` foram convertidos com cambio interno de orcamento, nao cotacao spot
- o documento assume produto `one-time payment`; recorrencia exigiria nova conta com `Stripe Billing`

## 15. Fontes oficiais

- Stripe Brasil pricing: https://stripe.com/br/pricing
- Stripe Connect pricing: https://stripe.com/br/connect/pricing
- Cloudflare Stream pricing: https://developers.cloudflare.com/stream/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Resend pricing KB: https://resend.com/docs/knowledge-base/what-is-resend-pricing
- Hetzner price adjustment: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Hotmart taxas: https://hotmart.com/pt-br/taxa-hotmart
