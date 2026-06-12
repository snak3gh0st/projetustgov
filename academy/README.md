# Projetus Academy

Novo app da plataforma de mentoria/cursos da PROJETUS.

## Objetivo

Este app deve nascer separado do `web/` atual para:

- manter deploy independente;
- evitar acoplamento com o Hub/CRM;
- ter auth, billing e experiência de aluno próprios;
- crescer como produto próprio.

## Decisão de topologia

- pasta raiz dedicada: `academy/`
- mesmo repositório
- app separado
- serviço separado no Coolify
- subdomínio separado

## Estrutura recomendada

```text
academy/
  src/
    app/
      (public)/
      (auth)/
      (student)/
      admin/
      api/
    modules/
      marketing/
      checkout/
      education/
      learner/
      billing/
      integrations/
    components/
    lib/
    db/
      schema/
      queries/
  public/
```

## Stack atual implementada

- Next.js App Router
- TypeScript
- Tailwind CSS
- Zod
- PostgreSQL
- Stripe

## Stripe Connect implementado

O bootstrap atual está preparado para:

- `Standard connected accounts`
- `Stripe-hosted onboarding`
- `direct charges`
- `application_fee_amount`
- `Checkout Session` para pagamento único
- webhook `checkout.session.completed`

## Endpoints implementados

- `GET /api/health`
- `GET /api/connect/accounts`
- `POST /api/connect/accounts`
- `POST /api/connect/accounts/:accountId/onboarding-link`
- `POST /api/stripe/products`
- `POST /api/stripe/checkout-sessions`
- `POST /api/stripe/webhooks/payments`

## Páginas de retorno já prontas

- `GET /checkout/success`
- `GET /checkout/cancel`
- `GET /connect/refresh`
- `GET /connect/return`

## Setup

1. Instale dependências:

```bash
cd academy
npm install
```

2. Configure as variáveis de ambiente com base em `.env.example`.
   Use `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` e `STRIPE_WEBHOOK_SECRET`
   obtidas no Stripe Dashboard.

3. Aplique a migration:

```bash
psql "$DATABASE_URL" -f ../migrations/create_academy_stripe_core.sql
```

4. Rode o app:

```bash
npm run dev
```

## Exemplo: criar empresa conectada

```bash
curl -X POST http://localhost:3001/api/connect/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "internalCompanyId": "projetus-main",
    "email": "financeiro@projetus.org",
    "country": "BR",
    "companyName": "Projetus",
    "websiteUrl": "https://projetus.org",
    "createOnboardingLink": true
  }'
```

## Exemplo: criar produto e checkout

1. Crie uma empresa conectada e finalize onboarding.
2. Crie um produto:

```bash
curl -X POST http://localhost:3001/api/stripe/products \
  -H "Content-Type: application/json" \
  -d '{
    "stripeAccountId": "acct_123",
    "slug": "mentoria-projetus",
    "name": "Mentoria Projetus",
    "currency": "brl",
    "unitAmount": 99700
  }'
```

3. Crie uma checkout session:

```bash
curl -X POST http://localhost:3001/api/stripe/checkout-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_UUID",
    "quantity": 1,
    "customerEmail": "aluno@example.com",
    "applicationFeeAmount": 0
  }'
```

## Documentos relacionados

- `docs/strategy/2026-06-08-mentoria-architecture-cost-model.md`
- `docs/strategy/2026-06-08-projetus-academy-repo-architecture.md`
- `docs/strategy/2026-06-08-backlog-mentoria-conta-azul.md`
