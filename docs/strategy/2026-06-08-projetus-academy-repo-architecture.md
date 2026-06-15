# Projetus Academy: Topologia de Repo e Arquitetura Enxuta

Data: 2026-06-08
Status: Recommended baseline

## 1. Resposta direta

Sim: `Projetus Academy` deve nascer em uma `nova pasta na raiz deste projeto`.

Recomendação:

- criar `academy/` na raiz do repo;
- manter `web/` intacto como app atual do Hub/CRM;
- tratar `academy/` como app separado, com deploy separado, env separado e domínio separado;
- compartilhar apenas o que fizer sentido depois, e não antes.

## 2. O que eu faria agora

Estrutura recomendada:

```text
projetustgov/
  src/                  -> ETL e backend Python atual
  web/                  -> Hub da PROJETUS atual
  academy/              -> novo app Projetus Academy
  migrations/           -> migrations do banco compartilhado
  docs/strategy/        -> arquitetura e decisões
```

## 3. O que eu não faria agora

Não colocaria Academy dentro de `web/`.

Motivo:

- mistura build, rotas, dependências e deploy com o CRM atual;
- aumenta o risco de quebrar o Hub em produção;
- dificulta separar identidade do aluno e identidade interna;
- complica a autonomia futura do produto.

Também não moveria `web/` para `apps/web` agora.

Motivo:

- isso é refactor estrutural sem retorno imediato;
- aumenta risco operacional num sistema já rodando;
- o melhor agora é crescer com baixo atrito.

## 4. Decisão de topo

## Recomendação final de topologia

- mesmo repo;
- app separado em `academy/`;
- serviço separado no Coolify;
- subdomínio separado, por exemplo `academy.projete.sigmaintel.io`;
- mesmo PostgreSQL host, mas domínio de dados isolado.

## 5. Arquitetura recomendada

## 5.1 App

Stack recomendado para `academy/`:

- `Next.js` App Router
- `TypeScript`
- `Tailwind CSS`
- `Zod`
- `PostgreSQL`
- `Drizzle ORM` para schema/migrations/type-safe queries
- `Resend` para emails transacionais
- `Cloudflare Stream` para vídeo
- `Stripe` como gateway principal
- adapter opcional para `Mercado Pago`

## Por que essa escolha

### Next.js

- bom para landing page, checkout, dashboard do aluno e admin no mesmo app;
- SSR/SEO bom para a parte pública;
- produtividade alta.

### Drizzle

- mais enxuto e previsível para greenfield;
- excelente quando queremos controle real do SQL;
- bom equilíbrio entre ergonomia e transparência.

### Cloudflare Stream

- resolve upload, encoding e playback sem inventar moda;
- custo simples;
- integra bem com app próprio.

### Stripe

- melhor DX para produto digital próprio;
- checkout e billing muito fortes;
- excelente base para evolução futura.

## 5.2 Domínios internos

Separar o app em módulos:

1. `marketing`
2. `checkout`
3. `learner-area`
4. `content-admin`
5. `billing`
6. `analytics`
7. `integrations`

## 5.3 Organização de código

Estrutura sugerida:

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
      migrations/
    styles/
  public/
  package.json
  tsconfig.json
  next.config.ts
  drizzle.config.ts
```

## 6. Banco de dados

## Decisão recomendada

Usar o `mesmo PostgreSQL`, mas com isolamento lógico forte.

Duas boas opções:

### Opção A: schema PostgreSQL separado

Exemplo:

- `public` para o Hub atual
- `academy` para a Academy

Prós:

- isolamento melhor;
- menos colisão;
- mais limpo conceitualmente.

### Opção B: tabelas prefixadas

Exemplo:

- `academy_products`
- `academy_lessons`
- `academy_orders`

Prós:

- mais simples de adotar no contexto atual do repo.

## Minha recomendação

Se vocês querem fazer certo desde o começo:

- usar `schema academy`

Se querem reduzir atrito imediato:

- usar prefixo `academy_`

## Recomendação prática neste repo

Como o projeto atual já usa bastante convenção em `public` e migrations SQL simples, eu seguiria assim:

- Academy em `academy/` como app separado;
- dados da Academy em tabelas `academy_*` no mesmo banco;
- e, se no futuro crescer bastante, migrar para schema dedicado.

Isso mantém a execução enxuta sem bagunçar o Hub atual.

## 7. Auth

## Staff interno

O staff pode continuar vindo do mundo `Projete`.

## Aluno

Aluno deve ter identidade própria.

Não misturar:

- `gestor`
- `vendedor`
- `coordenador`

com:

- `aluno`
- `mentor`
- `membro`

Modelo recomendado:

- `academy_learners`
- `academy_learner_sessions`
- `academy_enrollments`

## 8. Deploy

## Recomendação

Criar um `novo serviço` no Coolify para `academy/`.

Separação:

- `web/` continua como Hub
- `academy/` vira novo serviço

Cada um com:

- build próprio;
- env próprio;
- domínio próprio;
- rollback próprio.

## 9. Env vars

`academy/` deve ter env próprio.

Exemplo:

- `DATABASE_URL`
- `ACADEMY_APP_URL`
- `NEXTAUTH_SECRET` ou auth secret equivalente
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_TOKEN`
- `RESEND_API_KEY`

## 10. Integrações

## Vídeo

- Academy fala com `Cloudflare Stream`
- banco guarda metadados e permissões

## Pagamento

- Academy fala com `Stripe` ou `Mercado Pago`
- gateway confirma pagamento
- Academy libera acesso

## ERP

- Academy gera evento interno
- integração assíncrona envia para `Conta Azul`

## 11. Arquitetura de runtime

```text
academy.projete.sigmaintel.io
        |
        v
   Coolify Service: academy/
        |
        +--> PostgreSQL projetus_hub
        +--> Cloudflare Stream
        +--> Stripe / Mercado Pago
        +--> Resend
        +--> Conta Azul Sync
```

## 12. Regras de fronteira

## Compartilhar

- infra base
- banco host
- documentação
- eventualmente design tokens

## Não compartilhar no início

- package.json
- build pipeline
- auth de aluno com roles internos
- rotas do app
- release cadence

## 13. Roadmap técnico enxuto

### Fase 1

- criar `academy/`
- bootstrap do app
- schema base
- landing page
- auth aluno

### Fase 2

- admin de conteúdo
- catálogo
- aulas
- player

### Fase 3

- checkout
- billing
- matrícula
- progresso

### Fase 4

- analytics
- integrações
- Conta Azul sync

## 14. Veredito final

Se a pergunta é:

`Colocamos em uma nova pasta dentro do projeto?`

Minha resposta é:

`Sim.`

Mas em `academy/` na raiz, e não dentro de `web/`.

Essa é a forma mais enxuta, segura e correta de nascer um `Projetus Academy` separado sem contaminar o Hub atual.
