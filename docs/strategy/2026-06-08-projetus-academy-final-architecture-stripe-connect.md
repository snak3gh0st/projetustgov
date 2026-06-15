# Projetus Academy: Arquitetura Final com Stripe Connect

Data: 2026-06-08
Status: Final baseline
Escopo: arquitetura final do `Projetus Academy` usando `Stripe Connect`

## 1. Decisão executiva

Vamos construir o `Projetus Academy` como:

- `app separado` em `academy/`
- `deploy separado`
- `domínio separado`
- `mesmo repositório`
- `mesmo PostgreSQL host`
- `namespace de banco separado`
- `Cloudflare Stream` para vídeo
- `Stripe Connect` como stack de pagamento e repasse

## Veredito de pagamentos

Para esta arquitetura, a decisão final é:

- usar `Stripe Connect`
- usar `Standard connected accounts`
- usar `Stripe-hosted onboarding`
- usar `direct charges`
- usar `application_fee_amount`
- não usar `destination charges` no MVP

## 2. Quando Stripe Connect faz sentido aqui

`Stripe Connect` faz sentido se o Academy precisa:

- opcionalmente reter uma taxa da plataforma para o operador do Academy
- repassar o restante para `Projetus`
- suportar no futuro mais de um produtor/mentor/beneficiário
- manter payout e compliance de sellers dentro do fluxo de produto

Se o Academy fosse apenas uma operação simples vendendo conteúdo próprio de um único CNPJ, `Stripe Payments` sem Connect seria mais simples e mais barato.

Como a direção escolhida agora é capturar participação de plataforma e preparar expansão, `Connect` é coerente.

## Correção importante de pricing

Como a decisão correta aqui é `Stripe handles pricing for your users`, a plataforma:

- `não` deve ser modelada no plano `you handle pricing`
- `não` deve assumir custo de `R$ 6 por conta ativa`
- `não` deve assumir custo de `0,25% + R$ 0,67 por payout`

Para isso, o fluxo recomendado é:

- `direct charges`
- `Standard connected accounts`
- connected account pagando as taxas da Stripe

Base oficial consultada:

- pricing do Connect com `no fees for your platform` quando a Stripe cobra diretamente as tarifas de pagamento das connected accounts: https://stripe.com/br/connect/pricing
- comportamento de cobrança em direct charges com `controller.fees.payer=account`: https://docs.stripe.com/connect/direct-charges-fee-payer-behavior

## 3. Decisões finais de Stack

## App

- `Next.js 15` App Router
- `React 19`
- `TypeScript`
- `Tailwind CSS`
- `Zod`

Base oficial consultada:

- Next.js 15 upgrade guide e status atual: https://nextjs.org/docs/app/guides/upgrading/version-15

## Banco e acesso a dados

- `PostgreSQL`
- `Drizzle ORM`
- `Drizzle migrations`

Base oficial consultada:

- Drizzle + PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql
- suporte a schemas Postgres no Drizzle: https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0308

## Auth

- `Auth.js`
- auth própria do Academy
- sem reaproveitar os roles internos do Hub

## Pagamentos

- `Stripe Payments`
- `Stripe Connect`
- `Stripe Checkout` no MVP
- `Stripe-hosted onboarding` para contas conectadas

## Vídeo

- `Cloudflare Stream`
- `signed playback tokens`
- anexos e materiais extras em `Cloudflare R2`

## Email

- `Resend`

## Segurança / borda

- `Cloudflare Turnstile`

## Observabilidade

- `PostHog` para produto
- logs estruturados em banco + app logs

## 4. Topologia de produto

```text
projetustgov/
  web/                  -> Hub da PROJETUS atual
  academy/              -> novo app Academy
  src/                  -> ETL/Python atual
  migrations/           -> SQL cross-app quando necessário
  docs/strategy/        -> decisões e arquitetura
```

## 5. Topologia de runtime

```text
academy.projete.sigmaintel.io
        |
        v
 Coolify service: academy/
        |
        +--> PostgreSQL (schema academy)
        +--> Stripe Platform Account
        +--> Stripe Connect Accounts
        +--> Cloudflare Stream
        +--> Cloudflare R2
        +--> Resend
        +--> PostHog
```

## 6. Modelo Stripe Connect escolhido

## 6.1 Tipo de conta conectada

Decisão:

- `Standard connected accounts`

Motivo:

- menor esforço estrutural para o modelo sem custos extras de Connect na plataforma
- melhor encaixe oficial com `direct charges`
- a própria connected account tem relação direta com a Stripe
- Stripe cuida da maior parte da experiência de onboarding e compliance

Base oficial consultada:

- Stripe recomenda `Standard` quando você quer usar `direct charges`: https://docs.stripe.com/connect/accounts
- onboarding recomendado para Standard via `type=standard` + `Account Links`: https://docs.stripe.com/connect/standard-accounts?locale=pt-BR

## 6.2 Onboarding

Decisão:

- `Stripe-hosted onboarding`

Motivo:

- menor esforço
- atualizações automáticas de requisitos de compliance
- reduz manutenção
- acelera go-live

Base oficial consultada:

- Stripe recomenda hosted onboarding ou embedded onboarding, com hosted sendo o menor esforço: https://docs.stripe.com/connect/onboarding
- onboarding por `Account Link`: https://docs.stripe.com/connect/marketplace/tasks/onboard
- fluxo recomendado para Standard accounts usa `type=standard` + `Account Links`: https://docs.stripe.com/connect/standard-accounts?locale=pt-BR

## 6.3 Tipo de charge

Decisão:

- `direct charges`

Motivo:

- o Academy tem um `connected account` principal por venda
- esse modelo permite que a `connected account` pague as fees da Stripe
- a plataforma continua podendo reter sua taxa via `application_fee_amount`
- esse desenho evita os custos de `active account fee` e `payout fee` do modelo em que a plataforma administra os preços

Base oficial consultada:

- direct charges e application fees para connected accounts: https://docs.stripe.com/connect/direct-charges
- comportamento de cobrança com `controller.fees.payer=account`: https://docs.stripe.com/connect/direct-charges-fee-payer-behavior

## 6.4 Quando usar `destination charges`

Decisão:

- `não usar` no MVP

Motivo:

- destination charges debitam fees, refunds e chargebacks no saldo da plataforma
- isso empurra a arquitetura para o modelo em que a plataforma administra pricing/custos
- não é o que vocês querem agora

Base oficial consultada:

- destination charges debitam fees, refunds e chargebacks da plataforma: https://docs.stripe.com/connect/charges

## 6.5 Quando usar `on_behalf_of`

Decisão:

- `não é necessário` no MVP, porque ele é mais relevante no contexto de flows indiretos como destination charges

Motivo:

- melhora aderência regional
- usa estrutura de taxa do país da connected account quando aplicável
- usa descriptor/identidade da conta conectada

## 6.6 O que não vamos usar no MVP

Não usar agora:

- `destination charges`
- `separate charges and transfers`
- onboarding API fully custom

Motivo:

- `destination charges` põem fees e chargebacks no saldo da plataforma
- `separate charges and transfers` são mais complexas e devem entrar só quando uma venda precisar dividir dinheiro entre múltiplos recebedores

## Regra futura

Se no futuro uma única venda precisar dividir receita entre:

- Projetus
- mentor
- afiliado
- Sigma

então a evolução correta é:

- migrar esse caso específico para `separate charges and transfers`

## 7. Papéis financeiros

## Platform account

Recomendação:

- a conta da plataforma no Stripe deve representar o operador que controla a tecnologia e a cobrança da plataforma

Na prática:

- se a operação tecnológica ficar com uma entidade separada do recebedor do curso, a `platform account` representa esse operador
- `Projetus` entra como `connected account`

## Regra inicial recomendada

- `application_fee_amount = 0` no primeiro go-live, se vocês não quiserem monetização de plataforma agora
- a arquitetura continua pronta para ligar a fee depois, sem redesenhar pagamentos

## Connected accounts

No início:

- `Projetus` como connected account principal

Depois:

- mentores
- instrutores
- parceiros produtores

## 8. Fluxo de pagamento final

Fluxo aprovado:

1. aluno seleciona programa/turma no Academy
2. app cria `academy.order`
3. backend cria `Stripe Checkout Session`
4. session é criada `na connected account` usando o header `Stripe-Account`
5. session usa `payment_intent_data[application_fee_amount]`
6. Stripe cobra o cliente e liquida na connected account
7. a application fee é transferida para a plataforma
8. webhook `checkout.session.completed` atualiza pedido
9. app cria matrícula
10. app libera acesso
11. payout segue cronograma normal da connected account

## Nota de implementação

Em `direct charges`, os objetos de pagamento vivem na connected account, não na plataforma.
Então o app precisa:

- salvar `stripe_account_id` em cada pedido
- consultar a API com `Stripe-Account` quando precisar de detalhes do pagamento

Base oficial consultada:

- direct charges e visibilidade limitada no nível da plataforma: https://docs.stripe.com/connect/direct-charges

## 9. Fluxo de reembolso final

Decisão:

- reembolso sempre orquestrado pelo Academy

Para direct charges:

- refund no charge
- refund feito na connected account
- devolver application fee quando a política comercial exigir

Base oficial consultada:

- em direct charges, refunds debitam o saldo da connected account: https://docs.stripe.com/connect/charges

## Regra operacional recomendada

### Reembolso até 7 dias

- reembolsa pedido
- reverte transferência
- revoga acesso
- devolve application fee se a política comercial exigir

### Chargeback / disputa

- bloquear acesso imediatamente
- criar caso interno
- acompanhar disputa na connected account
- acionar playbook financeiro se a policy comercial exigir ajuste da application fee

Base oficial consultada:

- em direct charges, refunds e disputes recaem na connected account, não na plataforma: https://docs.stripe.com/connect/charges

## 10. Embedded components

Decisão:

- não são obrigatórios no MVP
- mas manter a arquitetura pronta para usar depois

Uso futuro recomendado:

- painel de payouts para connected accounts
- payments/disputes view para parceiros

Base oficial consultada:

- payouts embedded component: https://docs.stripe.com/connect/supported-embedded-components/payouts/

## 11. Arquitetura de banco

## Decisão final

Usar `schema Postgres academy`.

Motivo:

- separação limpa do Hub atual
- menos colisão de nomes
- melhor legibilidade operacional
- bom encaixe com suporte oficial do Drizzle a schemas Postgres

## Estrutura base

```text
academy.identities
academy.sessions
academy.verification_tokens

academy.products
academy.cohorts
academy.modules
academy.lessons
academy.assets

academy.customers
academy.orders
academy.order_items
academy.payments
academy.refunds

academy.enrollments
academy.access_grants
academy.progress

academy.connect_accounts
academy.connect_account_links
academy.connect_transfers
academy.payouts
academy.webhook_events
academy.audit_log
```

## 12. Auth final

Decisão:

- auth separada do Academy
- mesma biblioteca de auth pode ser usada, mas não o mesmo domínio lógico do Hub

Papéis do Academy:

- `academy_owner`
- `academy_admin`
- `academy_editor`
- `academy_finance`
- `academy_mentor`
- `academy_student`

Não reutilizar:

- `gestor`
- `vendedor`
- `coordenador`

## 13. Arquitetura de vídeo final

## Decisão

- vídeo no `Cloudflare Stream`
- playback protegido com token
- app guarda metadados, permissão e progresso

Nunca fazer:

- hospedar vídeo bruto na VM da app
- expor URL permanente pública do asset master

Base oficial consultada:

- pricing Cloudflare Stream: https://developers.cloudflare.com/stream/pricing/

## 14. Serviços externos finais

## Obrigatórios

- `Stripe`
- `Cloudflare Stream`
- `Resend`
- `Turnstile`

## Recomendados

- `Cloudflare R2` para anexos
- `PostHog` para analytics de produto

## 15. Webhooks finais

## Stripe

Endpoints recomendados:

- `/api/stripe/webhooks/payments`
- `/api/stripe/webhooks/connect`

Eventos mínimos:

- `checkout.session.completed`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `account.updated`
- `capability.updated`
- `payout.paid`
- `payout.failed`

## Cloudflare Stream

Se usarem webhook/event notification do provedor:

- asset ready
- upload failed

## 16. Custos do stack

Todos os valores abaixo foram pesquisados em `2026-06-08` em fontes oficiais.

## 16.1 Stripe Connect

Páginas oficiais consultadas:

- https://stripe.com/br/connect/pricing
- https://docs.stripe.com/connect/direct-charges-fee-payer-behavior

Para o modelo em que `a Stripe lida com os preços para seus usuários`, a Stripe publica:

- `nenhuma tarifa para sua plataforma`
- sem cobrança adicional por conta
- sem cobrança adicional por payout
- sem cobrança adicional por volume de repasses
- sem cobrança adicional por relatórios fiscais

Condição importante:

- deixar a Stripe cobrar diretamente as tarifas de pagamento das connected accounts
- em `Standard connected accounts`, isso já faz parte do modelo

Na mesma página, a Stripe também publica para Payments no Brasil:

- `a partir de 3,99% + R$ 0,50` por cobrança de cartão bem-sucedida

## Observação importante

Neste modelo, o custo de processamento existe, mas fica `na connected account`, não na plataforma.

## Observação crítica de arquitetura

Para manter esse modelo sem custos extras de Connect na plataforma, o Academy deve permanecer em:

- `Standard connected accounts`
- `direct charges`

Se vocês migrarem depois para `Express`, a estrutura de cobrança muda.

## 16.2 Cloudflare Stream

Fonte:

- https://developers.cloudflare.com/stream/pricing/

Valores:

- `US$ 5 / 1.000 min` armazenados
- `US$ 1 / 1.000 min` assistidos

## 16.3 Resend

Fonte:

- https://resend.com/docs/knowledge-base/what-is-resend-pricing

Valores:

- `Free`: `3.000 emails/mês`, limitado a `100/dia`
- `Pro`: `US$ 20/mês` para `50.000 emails`

## 16.4 Cloudflare Turnstile

Fonte:

- https://developers.cloudflare.com/turnstile/plans/

Valores:

- `Free`

## 16.5 Cloudflare R2

Fonte:

- https://developers.cloudflare.com/r2/pricing/

Valores relevantes:

- `10 GB` free tier
- `US$ 0.015/GB-mês` de storage no tier padrão
- sem cobrança de egress direto do R2

## 16.6 PostHog

Fonte:

- https://posthog.com/posthug

Valores relevantes:

- `1 milhão de eventos/mês` no free tier
- session replay com free tier separado

## 17. Cenários de custo mensal

Assumptions:

- ticket médio: `R$ 997`
- acervo total armazenado: `5.000 min`
- watch médio: `600 min/aluno/mês`
- Academy usando `direct charges`
- connected accounts pagando as fees Stripe
- taxa da plataforma calculada à parte; aqui estamos olhando custo operacional da plataforma e custo transacional do ecossistema

## Cenário MVP

- `100 alunos ativos`
- `20 vendas/mês`
- `1 connected account ativa`
- `1 payout/mês`

### Custos

- vídeo Cloudflare: `US$ 85/mês`
- Stripe processamento cartão no ecossistema: `R$ 805,61/mês`
- Stripe Connect fixo para a plataforma: `R$ 0`
- total Connect adicional da plataforma: `R$ 0`
- Resend: `US$ 0`
- Turnstile: `US$ 0`
- R2: provavelmente `US$ 0`

## Cenário Grow

- `300 alunos ativos`
- `60 vendas/mês`
- `3 connected accounts ativas`
- `3 payouts/mês`

### Custos

- vídeo Cloudflare: `US$ 205/mês`
- Stripe processamento cartão no ecossistema: `R$ 2.416,82/mês`
- Stripe Connect fixo para a plataforma: `R$ 0`

## Cenário Scale

- `1.000 alunos ativos`
- `150 vendas/mês`
- `10 connected accounts ativas`
- `10 payouts/mês`

### Custos

- vídeo Cloudflare: `US$ 625/mês`
- Stripe processamento cartão no ecossistema: `R$ 6.042,04/mês`
- Stripe Connect fixo para a plataforma: `R$ 0`

## 18. Arquitetura final resumida

## Repo

- `academy/` novo app

## Frontend

- `Next.js 15`
- `React 19`
- `Tailwind`

## Backend app

- route handlers no Next.js
- jobs assíncronos internos para sync e webhooks

## Banco

- `PostgreSQL`
- `schema academy`
- `Drizzle ORM`

## Auth

- `Auth.js`
- identidade separada do Hub

## Pagamentos

- `Stripe Checkout`
- `Stripe Connect Standard`
- `direct charges`
- `application_fee_amount`
- `Stripe-Account` por connected account

## Vídeo

- `Cloudflare Stream`

## Email

- `Resend`

## Segurança

- `Turnstile`

## Analytics

- `PostHog`

## 19. O que eu faria imediatamente

1. bootstrap do app real em `academy/`
2. definir `schema academy` no banco
3. criar integração base com `Stripe Checkout`
4. criar onboarding de `Standard accounts`
5. criar modelo de `orders/enrollments`
6. integrar `Cloudflare Stream`
7. ligar webhooks Stripe

## 20. Veredito final

Se a pergunta é:

`Qual é a arquitetura final do Projetus Academy usando Stripe Connect?`

Minha resposta final é:

- `academy/` separado
- `Next.js 15 + React 19 + TypeScript + Tailwind`
- `PostgreSQL + Drizzle + schema academy`
- `Auth.js` com identidade própria do Academy
- `Cloudflare Stream`
- `Stripe Connect Standard`
- `Stripe-hosted onboarding`
- `direct charges + application_fee_amount`

Essa é a arquitetura mais correta para:

- lançar rápido
- manter controle
- capturar fee da plataforma
- crescer depois sem retrabalho estrutural
