# Rebrand para Capte Recursos + Checkout Pagar.me — Design

## Contexto

O app `academy` (hoje "Projetus Academy") vai virar o produto **Capte Recursos**
por completo — nome, cores e tipografia alinhados ao site de referência
(https://capterecursos.com.br). "Projetus" deixa de existir como marca visível
neste app. Em paralelo, o catálogo de cursos ainda não tem página de compra
funcional (o botão "Acessar" só linka pra `/login`), então este design também
cobre ligar o checkout real ao Pagar.me, que já está implementado no backend
(`src/lib/pagarme.ts`) com split de 3 vias (Sigma 1% / Instrutor 70% / Academy
29%) mas nunca foi plugado na UI.

Pesquisa comparando Pagar.me vs. Mercado Pago, Asaas, PagBank, Iugu/Vindi,
Juno, Cielo e Zoop confirmou que Pagar.me continua sendo a escolha certa pra
esse caso (split nativo maduro, sem dependência de OAuth que expira, KYC de
recebedor rápido, sem histórico de retenção indevida). Não há mudança de
gateway — só falta terminar de plugar o que já existe.

## Parte A — Rebrand visual

### Paleta

Extraída do CSS de produção do site de referência (valores oklch convertidos
pra hex):

| Papel | Hex | Uso |
|---|---|---|
| Navy (`brand-navy`) | `#0b144e` | texto escuro, fundo escuro |
| Navy deep | `#050938` | variação mais escura de fundo |
| Orange (`brand-orange`) | `#f8682b` | accent único (CTA, destaque, hover) |
| Cream (`brand-cream`) | `#faf5ec` | fundo claro |

### Arquitetura da troca

Sem introduzir sistema de tema/multi-marca — é rebrand definitivo, não haverá
uma segunda marca pra alternar. A troca é só de valores:

- `tailwind.config.ts`: os tokens existentes `academy.ink/sand/blue/gold` são
  usados em 159 ocorrências espalhadas por 21 arquivos. Em vez de renomear
  tudo, reaponto os valores hex dos tokens existentes:
  - `academy.ink` → `#0b144e` (navy)
  - `academy.sand` → `#faf5ec` (cream)
  - `academy.blue` → `#f8682b` (orange — unifica com gold, o site de
    referência usa um único accent)
  - `academy.gold` → `#f8682b` (orange)

  Isso zera o trabalho de tocar os 21 arquivos de componente — eles continuam
  usando as mesmas classes (`text-academy-gold`, etc.), só o valor por trás
  muda.

- Fontes: adicionar Bricolage Grotesque (weights 600/700/800, títulos) e DM
  Sans (weights 300–700, corpo) via `next/font/google` em
  `src/app/layout.tsx`, expostas como variáveis CSS e estendidas em
  `tailwind.config.ts` (`fontFamily.heading` / `fontFamily.body`).

### Textos

Trocar "Projetus" / "PROJETUS" / "Projetus Academy" → "Capte Recursos" /
"CAPTE RECURSOS" nestes arquivos (inventário feito por grep, 14 arquivos):

```
src/app/layout.tsx                                  (metadata title/description)
src/app/page.tsx                                    (copy da home, footer)
src/app/(auth)/login/page.tsx
src/app/(auth)/cadastro/page.tsx
src/app/admin/login/page.tsx
src/app/admin/(protected)/layout.tsx
src/app/area/(dash)/layout.tsx
src/app/area/(dash)/page.tsx
src/app/area/(player)/[slug]/player/page.tsx
src/app/area/(player)/[slug]/certificado/page.tsx
src/app/api/checkout/pagarme/route.ts               (softDescriptor)
src/lib/pagarme.ts                                  (softDescriptor default)
src/components/CourseCatalog.tsx
```

**Fora de escopo, deliberadamente:** `ADMIN_EMAIL_DOMAIN=projetus.org` em
`src/lib/env.ts` não muda. É controle de acesso (allowlist de e-mail de
admin), não texto de marca — trocar isso quebraria login dos admins atuais.
Mudança de domínio/subdomínio do app também fica fora (decidido: mantém
domínio atual por agora).

**Logo:** ainda não existe arquivo de logo da Capte Recursos. Por decisão,
uso um wordmark em texto (nome estilizado com a fonte Bricolage Grotesque) até
receber a arte final — troca é isolada (um componente/local), não bloqueia o
resto.

**Detalhe pontual:** `src/app/page.tsx` tem um gradiente
`from-academy-blue to-blue-800` (linha ~136) que mistura o token com uma cor
Tailwind literal (`blue-800`). Depois do remap, isso viraria laranja→azul, o
que destoa da paleta nova — ajustar esse gradiente pra usar só tons da nova
paleta (ex.: `from-academy-blue to-academy-ink`) faz parte da implementação.

## Parte B — Checkout Pagar.me plugado na UI

### Estado atual

- Backend Pagar.me completo: `POST /api/checkout/pagarme` cria a order com
  split e persiste em `pagarme_orders`; `POST /api/webhooks/pagarme` valida
  assinatura HMAC, é idempotente e ativa a matrícula (`education_enrollments`)
  quando `order.paid`.
- Nada no frontend chama esse endpoint. `CourseCatalog.tsx` só linka pra
  `/login`.
- Existe um braço Stripe/Connect paralelo (`api/checkout/[slug]`,
  `api/stripe/**`, `api/connect/**`, `modules/commerce`, `modules/connect`,
  `lib/stripe.ts`) sem nenhum consumidor no frontend nem no admin — sobra de
  uma tentativa anterior, confirmada morta por grep.

### Mudanças

1. **Env**: adicionar `NEXT_PUBLIC_PAGARME_PUBLIC_KEY` (chave pública `pk_...`)
   em `src/lib/env.ts` — necessária no navegador pra tokenizar cartão.

2. **Nova página** `src/app/checkout/[slug]/page.tsx` (client component):
   - Exige sessão de aluno; se não houver, redireciona pra
     `/login?next=/checkout/{slug}`.
   - Busca o produto pelo slug, mostra preço e nome.
   - Seletor de método: Pix / Boleto / Cartão.
   - **Pix/Boleto**: formulário com CPF (obrigatório) e telefone (opcional) →
     `POST /api/checkout/pagarme` → renderiza QR code (Pix) ou link+código de
     barras (Boleto) inline. Faz polling em
     `GET /api/checkout/pagarme/status?orderId=...` (novo endpoint leve, só
     lê `pagarme_orders.status`, que o webhook já mantém atualizado) a cada
     poucos segundos até `paid`, então redireciona pra `/area`.
   - **Cartão**: carrega `tokenizecard.js` do Pagar.me via `next/script`
     (`strategy="afterInteractive"`), tagueia os campos do formulário com os
     atributos `data-pagarmecheckout-*` deles, lê o token gerado
     (`pagarmetoken`, single-use, expira em 60s) e envia junto com
     `method: 'credit_card'` e parcelas (1–12x). Resultado é síncrono
     (aprovado/recusado) — sem polling, mostra erro inline em caso de recusa.

3. **`CourseCatalog.tsx`**: botão "Acessar" passa a linkar pra
   `/checkout/{course.slug}` em vez de `/login`. Precisa confirmar que
   `slug` já vem em `PublicCourse` / `/api/public/courses` (se não vier,
   adicionar no select).

4. **Remoção do braço Stripe/Connect morto** (confirmado sem consumidor):
   - `src/app/api/checkout/[slug]/route.ts`
   - `src/app/api/stripe/**` (products, checkout-sessions, webhooks/payments)
   - `src/app/api/webhooks/stripe/route.ts`
   - `src/app/api/connect/**`
   - `src/lib/stripe.ts`
   - `src/modules/commerce/**`
   - `src/modules/connect/**`
   - `src/app/checkout/success/page.tsx` e `src/app/checkout/cancel/page.tsx`
     (mencionam "webhook da Stripe" explicitamente; resultado da compra passa
     a ser mostrado inline na própria página de checkout, então essas páginas
     ficam sem uso)
   - dependência `stripe` do `package.json`, depois de confirmar que nada mais
     importa `from 'stripe'`

5. **`softDescriptor`**: default muda de `'PROJETUS'` pra `'CAPTE RECURSOS'`
   em `src/lib/pagarme.ts` e `src/app/api/checkout/pagarme/route.ts`.

### Erros e edge cases

- Produto sem preço, instrutor sem recipient configurado, sigma/academy
  recipient ausente: já tratados no endpoint existente (`err(400/500, ...)`)
  — a página de checkout só precisa exibir a mensagem de erro retornada.
- Token de cartão expirado (>60s parado na tela): re-tokenizar antes de
  reenviar, não cachear o token.
- Pix/Boleto expirado sem pagamento: a UI mostra o prazo (`pixExpiresAt` /
  `boletoExpiresAt`) e permite gerar uma nova order.

### Testes / verificação

Não há lógica de split nova (isso já existe e não muda). O código
efetivamente novo é o polling de status e a máquina de estados da página de
checkout (idle → pendente → pago/falho) — verificação é melhor feita
rodando o app localmente com credenciais sandbox do Pagar.me e testando os
três métodos manualmente (skill `/verify`). Tokenização de cartão de ponta a
ponta precisa de chave pública sandbox real; se não houver, sinalizar como
pendente em vez de simular.

## Fora de escopo

- Troca de domínio/subdomínio do app.
- Arte final de logo (fica com wordmark em texto até receber os arquivos).
- Qualquer mudança na lógica de split (Sigma 1% / Instrutor 70% / Academy
  29%) — já validada e correta.
