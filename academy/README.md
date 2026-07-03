# Capte Recursos

Plataforma de mentoria/cursos da PROJETUS (antigo "Projetus Academy").

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
- Pagar.me

## Checkout Pagar.me implementado

O checkout atual está preparado para:

- pagamento via **Pix**, **Boleto** e **Cartão de crédito**, com
  tokenização de cartão feita no client;
- split de pagamento em 3 vias (SIGMA / instrutor / academy);
- webhook de confirmação de pagamento (`order.paid`, `order.canceled`,
  `charge.refunded`) com idempotência por evento;
- polling de status na página de checkout até a confirmação do pagamento.

## Endpoints implementados

- `GET /api/health`
- `POST /api/checkout/pagarme`
- `GET /api/checkout/pagarme/status`
- `POST /api/webhooks/pagarme`
- `GET /api/public/courses`

## Páginas

- `GET /checkout/[slug]` — checkout Pix/Boleto/Cartão do curso.

## Setup

1. Instale dependências:

```bash
cd academy
npm install
```

2. Configure as variáveis de ambiente com base em `.env.example`,
   incluindo as variáveis do Pagar.me (`PAGARME_SECRET_KEY`,
   `PAGARME_WEBHOOK_SECRET`, `PAGARME_SIGMA_RECIPIENT_ID`,
   `PAGARME_ACADEMY_RECIPIENT_ID`). Note que `NEXT_PUBLIC_PAGARME_PUBLIC_KEY`
   precisa estar definida em **tempo de build** — o Next.js embute variáveis
   `NEXT_PUBLIC_*` no bundle durante o build, não em runtime.

3. Aplique a migration do marketplace Pagar.me:

```bash
psql "$DATABASE_URL" -f ../migrations/create_pagarme_marketplace.sql
```

4. Rode o app:

```bash
npm run dev
```

## Testando um pagamento

Não há uma rota pública equivalente para simular checkout via `curl` — o
fluxo do Pagar.me depende da tokenização de cartão feita no client (via a
chave pública) antes de chamar `POST /api/checkout/pagarme`. Para testar,
acesse `GET /checkout/[slug]` no navegador com credenciais sandbox do
Pagar.me configuradas no `.env`.

## Documentos relacionados

- `docs/strategy/2026-06-08-mentoria-architecture-cost-model.md`
- `docs/strategy/2026-06-08-projetus-academy-repo-architecture.md`
- `docs/strategy/2026-06-08-backlog-mentoria-conta-azul.md`
