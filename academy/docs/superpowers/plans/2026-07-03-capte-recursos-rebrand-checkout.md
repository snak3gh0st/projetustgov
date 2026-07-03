# Capte Recursos Rebrand + Pagar.me Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the `academy` app from "Projetus Academy" to "Capte Recursos" (palette, fonts, copy) and wire the already-implemented Pagar.me split checkout into the frontend, removing the dead Stripe/Connect code path.

**Architecture:** No new abstractions. The rebrand repoints existing Tailwind color tokens and adds two Google Fonts via `next/font`; brand copy is a literal find/replace across a known file list. The checkout is a new client-rendered page under `src/app/checkout/[slug]` that calls the existing `/api/checkout/pagarme` endpoint, protected by the existing cookie-based middleware (extended to cover `/checkout`), with a small new status-polling endpoint reading the `pagarme_orders` table the webhook already keeps up to date. Card tokenization calls Pagar.me's public tokens endpoint directly from the browser (no SDK, no script tag) so raw card data never touches our server.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 3, `next/font/google`, Pagar.me v5 REST API (existing `src/lib/pagarme.ts`), Postgres via existing `query()` helper.

## Global Constraints

- Palette: navy `#0b144e`, orange `#f8682b`, cream `#faf5ec` — applied via existing Tailwind tokens `academy.ink` (navy), `academy.sand` (cream), `academy.blue` and `academy.gold` (both orange).
- Fonts: Bricolage Grotesque (weights 600/700/800) for headings, DM Sans (weights 300–700) for body, loaded via `next/font/google`.
- Brand copy: every visible "Projetus" / "PROJETUS" becomes "Capte Recursos" / "CAPTE RECURSOS", **except** `ADMIN_EMAIL_DOMAIN` in `src/lib/env.ts`, which stays `projetus.org` (access control, not branding).
- `softDescriptor` default for card statement text changes to `'CAPTE RECURSOS'`.
- Payment gateway is Pagar.me only. No new npm dependency is introduced for checkout — card tokenization uses a plain `fetch` to Pagar.me's public tokens endpoint.
- No domain/subdomain change in this plan.
- No logo image asset — text wordmark only, using the new heading font, until real logo files are provided.

---

### Task 1: Rebrand palette, fonts, and root metadata

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: Tailwind utility classes `font-heading` / `font-body`, CSS variables `--font-heading` / `--font-body`, and the repointed `academy-ink/sand/blue/gold` color values that every later task's copy edits rely on visually (no code-level dependency).

- [ ] **Step 1: Replace `tailwind.config.ts` with the new palette + font families**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        academy: {
          ink: '#0b144e',
          sand: '#faf5ec',
          blue: '#f8682b',
          gold: '#f8682b',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Replace `src/app/layout.tsx` to load the fonts and update metadata**

```tsx
import './globals.css'
import type { Metadata } from 'next'
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'

const heading = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-heading',
})

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Capte Recursos',
  description: 'Plataforma de cursos e mentorias da Capte Recursos',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Update the base body rule in `src/app/globals.css`**

Replace:

```css
body {
  @apply bg-slate-50 text-slate-900 antialiased;
}
```

With:

```css
body {
  @apply bg-academy-sand text-academy-ink antialiased font-body;
}

h1, h2, h3, h4 {
  @apply font-heading;
}
```

- [ ] **Step 4: Build and confirm no errors**

Run: `npm run build`
Expected: build completes successfully (same as the clean baseline build — no new errors introduced).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/layout.tsx src/app/globals.css
git commit -m "feat: rebrand palette, fonts and root metadata to Capte Recursos"
```

---

### Task 2: Replace remaining "Projetus" brand copy

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/cadastro/page.tsx`
- Modify: `src/app/admin/login/page.tsx`
- Modify: `src/app/admin/(protected)/layout.tsx`
- Modify: `src/app/area/(dash)/layout.tsx`
- Modify: `src/app/area/(dash)/page.tsx`
- Modify: `src/app/area/(player)/[slug]/player/page.tsx`
- Modify: `src/app/area/(player)/[slug]/certificado/page.tsx`
- Modify: `src/components/CourseCatalog.tsx`
- Modify: `src/app/api/checkout/pagarme/route.ts`
- Modify: `src/lib/pagarme.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `font-heading`/`academy-ink` etc. from Task 1 (already in place, no code dependency for this task's edits).

- [ ] **Step 1: `src/app/page.tsx`** — apply these exact replacements

Nav wordmark (collapse two-line lockup into one):

```tsx
            <span className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS</span>
            <span className="ml-2 text-sm font-semibold text-academy-ink">Academy</span>
```

becomes:

```tsx
            <span className="text-sm font-bold text-academy-ink">Capte Recursos</span>
```

Hero eyebrow:

```tsx
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-academy-blue">
            PROJETUS Academy
          </p>
```

becomes:

```tsx
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-academy-blue">
            Capte Recursos
          </p>
```

Line 19 description string — `especialistas Projetus` becomes `especialistas Capte Recursos`.

Line 130 — `equipe Projetus</p>` becomes `equipe Capte Recursos</p>`.

Line 136 gradient (drop the literal `blue-800` now that it clashes with the new palette):

```tsx
              <div className="flex h-44 items-center justify-center bg-gradient-to-br from-academy-blue to-blue-800 text-5xl">
```

becomes:

```tsx
              <div className="flex h-44 items-center justify-center bg-gradient-to-br from-academy-blue to-academy-ink text-5xl">
```

Line 199 — `Para quem é a Projetus Academy?` becomes `Para quem é a Capte Recursos?`.

Footer (lines 214-215):

```tsx
        <p className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS Academy</p>
        <p className="mt-1 text-xs text-slate-400">© 2026 Projetus. Todos os direitos reservados.</p>
```

becomes:

```tsx
        <p className="text-xs font-bold uppercase tracking-widest text-academy-blue">Capte Recursos</p>
        <p className="mt-1 text-xs text-slate-400">© 2026 Capte Recursos. Todos os direitos reservados.</p>
```

- [ ] **Step 2: `src/app/(auth)/login/page.tsx`**

```tsx
          <p className="text-xs font-black uppercase tracking-[0.3em] text-academy-gold">PROJETUS</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Academy</h1>
```

becomes:

```tsx
          <h1 className="mt-2 text-2xl font-semibold text-white">Capte Recursos</h1>
```

- [ ] **Step 3: `src/app/(auth)/cadastro/page.tsx`**

```tsx
          <p className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS</p>
          <h1 className="mt-1 text-2xl font-semibold text-academy-ink">Academy</h1>
```

becomes:

```tsx
          <h1 className="mt-1 text-2xl font-semibold text-academy-ink">Capte Recursos</h1>
```

- [ ] **Step 4: `src/app/admin/login/page.tsx`**

```tsx
          <p className="text-xs font-bold uppercase tracking-widest text-academy-gold">PROJETUS</p>
          <h1 className="mt-1 text-xl font-semibold text-white">Academy Admin</h1>
```

becomes:

```tsx
          <h1 className="mt-1 text-xl font-semibold text-white">Capte Recursos Admin</h1>
```

- [ ] **Step 5: `src/app/admin/(protected)/layout.tsx`**

```tsx
          <p className="text-xs font-bold uppercase tracking-widest text-academy-gold">PROJETUS</p>
          <p className="text-sm text-slate-300">Academy Admin</p>
```

becomes:

```tsx
          <p className="text-sm font-semibold text-slate-200">Capte Recursos Admin</p>
```

- [ ] **Step 6: `src/app/area/(dash)/layout.tsx`**

```tsx
            <span className="text-xs font-black uppercase tracking-[0.28em] text-academy-gold">PROJETUS</span>
            <span className="text-sm text-white/70">Academy</span>
```

becomes:

```tsx
            <span className="text-sm font-semibold text-white">Capte Recursos</span>
```

- [ ] **Step 7: `src/app/area/(dash)/page.tsx`**

Line 64 — `<span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Projetus</span>` becomes `<span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Capte Recursos</span>`.

Line 134 — `<p className="text-xs font-bold uppercase tracking-[0.3em] text-academy-gold">PROJETUS Academy</p>` becomes `<p className="text-xs font-bold uppercase tracking-[0.3em] text-academy-gold">Capte Recursos</p>`.

- [ ] **Step 8: `src/app/area/(player)/[slug]/player/page.tsx`**

```tsx
            <span className="text-xs font-bold tracking-widest text-academy-gold">PROJETUS</span>
            <span className="text-xs text-slate-500">Academy</span>
```

becomes:

```tsx
            <span className="text-xs font-bold tracking-widest text-academy-gold">Capte Recursos</span>
```

- [ ] **Step 9: `src/app/area/(player)/[slug]/certificado/page.tsx`**

Wordmark line (~110-111):

```tsx
            <span className="text-xs sm:text-sm font-bold tracking-[0.3em] text-academy-gold">PROJETUS</span>
            <span className="text-xs sm:text-sm tracking-[0.2em] text-zinc-500">ACADEMY</span>
```

becomes:

```tsx
            <span className="text-xs sm:text-sm font-bold tracking-[0.3em] text-academy-gold">CAPTE RECURSOS</span>
```

Seal badge (~141-142, keep two lines — the circular seal is too small at 7px for "CAPTE RECURSOS" on one line):

```tsx
                <span className="text-[7px] sm:text-[8px] font-bold tracking-widest text-academy-gold leading-none">PROJETUS</span>
                <span className="text-[6px] sm:text-[7px] tracking-widest text-zinc-500 leading-none mt-0.5">ACADEMY</span>
```

becomes:

```tsx
                <span className="text-[7px] sm:text-[8px] font-bold tracking-widest text-academy-gold leading-none">CAPTE</span>
                <span className="text-[6px] sm:text-[7px] tracking-widest text-zinc-500 leading-none mt-0.5">RECURSOS</span>
```

- [ ] **Step 10: `src/components/CourseCatalog.tsx`**

```tsx
                      <span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Projetus</span>
```

becomes:

```tsx
                      <span className="text-xs font-black uppercase tracking-[0.4em] text-white/30">Capte Recursos</span>
```

- [ ] **Step 11: `src/app/api/checkout/pagarme/route.ts`**

```ts
      softDescriptor: 'PROJETUS',
```

becomes:

```ts
      softDescriptor: 'CAPTE RECURSOS',
```

- [ ] **Step 12: `src/lib/pagarme.ts`**

```ts
      : { payment_method: 'credit_card', credit_card: { installments: opts.installments ?? 1, statement_descriptor: opts.softDescriptor ?? 'PROJETUS', card_token: opts.cardToken }, split: splits }
```

becomes:

```ts
      : { payment_method: 'credit_card', credit_card: { installments: opts.installments ?? 1, statement_descriptor: opts.softDescriptor ?? 'CAPTE RECURSOS', card_token: opts.cardToken }, split: splits }
```

- [ ] **Step 13: `package.json`**

```json
  "name": "projetus-academy",
```

becomes:

```json
  "name": "capte-recursos-academy",
```

- [ ] **Step 14: Verify no brand copy was missed**

Run:

```bash
grep -rniE "projetus" src | grep -v "ADMIN_EMAIL_DOMAIN" | grep -v "projetus.org"
```

Expected: no output.

- [ ] **Step 15: Build and commit**

```bash
npm run build
git add src package.json
git commit -m "feat: replace Projetus brand copy with Capte Recursos"
```

Expected build: succeeds with no new errors.

---

### Task 3: Protect `/checkout` and preserve return path through login

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Produces: any request under `/checkout/*` without a valid `academy_session` cookie is redirected to `/login?next=<original-path>`; a successful learner login redirects to that `next` path (falls back to `/area`).

- [ ] **Step 1: Extend the learner-protected block in `src/middleware.ts`**

Replace:

```ts
  // Learner protected routes
  if (pathname.startsWith('/area') || pathname.startsWith('/minha-conta')) {
    const token = req.cookies.get('academy_session')?.value
    if (!token || !(await verifyToken(token))) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    return NextResponse.next()
  }
```

With:

```ts
  // Learner protected routes
  if (pathname.startsWith('/area') || pathname.startsWith('/minha-conta') || pathname.startsWith('/checkout')) {
    const token = req.cookies.get('academy_session')?.value
    if (!token || !(await verifyToken(token))) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }
```

- [ ] **Step 2: Add `/checkout` to the middleware matcher**

Replace:

```ts
export const config = {
  matcher: ['/admin/:path*', '/area/:path*', '/minha-conta/:path*'],
}
```

With:

```ts
export const config = {
  matcher: ['/admin/:path*', '/area/:path*', '/minha-conta/:path*', '/checkout/:path*'],
}
```

- [ ] **Step 3: Make the login page redirect back to `next` after success**

In `src/app/(auth)/login/page.tsx`, replace:

```ts
      if (!res.ok) { setError(data.error ?? 'Erro ao entrar'); return }
      router.push('/area')
```

With:

```ts
      if (!res.ok) { setError(data.error ?? 'Erro ao entrar'); return }
      const next = new URLSearchParams(window.location.search).get('next')
      router.push(next && next.startsWith('/') ? next : '/area')
```

(The `next.startsWith('/')` check prevents an open redirect to an external URL via a crafted `next` value.)

- [ ] **Step 4: Build and verify the redirect manually**

Run: `npm run build` — expect success.

Then with the dev server running (`npm run dev`), visiting `http://localhost:3000/checkout/anything` while logged out must redirect to `http://localhost:3000/login?next=%2Fcheckout%2Fanything`.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts "src/app/(auth)/login/page.tsx"
git commit -m "feat: protect /checkout route and preserve return path through login"
```

---

### Task 4: Pagar.me order status endpoint

**Files:**
- Create: `src/app/api/checkout/pagarme/status/route.ts`

**Interfaces:**
- Consumes: `getSession(): Promise<SessionPayload | null>` from `@/lib/auth` (`SessionPayload = { sub, email, name, role }`), `query<T>(text, params?): Promise<T[]>` from `@/lib/db`, `ok(data)` / `err(status, message)` from `@/lib/http`.
- Produces: `GET /api/checkout/pagarme/status?orderId=<pagarme_order_id>` → `200 { data: { status, method, pix: {qrCode, qrCodeUrl, expiresAt} | null, boleto: {url, barcode, expiresAt} | null } }`, `401` if no session, `400` if `orderId` missing, `404` if the order doesn't belong to the calling learner.

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return err(400, 'orderId é obrigatório')

  const rows = await query<{
    status: string
    payment_method: string
    pix_qr_code: string | null
    pix_qr_code_url: string | null
    pix_expires_at: string | null
    boleto_url: string | null
    boleto_barcode: string | null
    boleto_expires_at: string | null
  }>(
    `SELECT status, payment_method, pix_qr_code, pix_qr_code_url, pix_expires_at,
            boleto_url, boleto_barcode, boleto_expires_at
     FROM pagarme_orders
     WHERE pagarme_order_id = $1 AND learner_email = $2
     LIMIT 1`,
    [orderId, session.email]
  )

  const order = rows[0]
  if (!order) return err(404, 'Pedido não encontrado')

  return ok({
    status: order.status,
    method: order.payment_method,
    pix: order.pix_qr_code
      ? { qrCode: order.pix_qr_code, qrCodeUrl: order.pix_qr_code_url, expiresAt: order.pix_expires_at }
      : null,
    boleto: order.boleto_url
      ? { url: order.boleto_url, barcode: order.boleto_barcode, expiresAt: order.boleto_expires_at }
      : null,
  })
}
```

- [ ] **Step 2: Verify the auth gate with the dev server running**

Run:

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/checkout/pagarme/status?orderId=test"
```

Expected: `401` (no session cookie sent).

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/app/api/checkout/pagarme/status/route.ts
git commit -m "feat: add Pagar.me order status polling endpoint"
```

---

### Task 5: Checkout page — Pix and Boleto

**Files:**
- Create: `src/app/checkout/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/public/courses` → `{ data: Array<{ id, slug, title, subtitle, cover_image_url, product_type, default_price_cents, lesson_count }> }`; `POST /api/checkout/pagarme` body `{ productSlug, method: 'pix'|'boleto'|'credit_card', document, phone?, cardToken?, installments? }` → `{ data: { orderId, status, method, amount, pix: {...}|null, boleto: {...}|null } }`; `GET /api/checkout/pagarme/status?orderId=` from Task 4.
- Produces: default export `CheckoutPage` React component routed at `/checkout/[slug]`. Task 6 extends this same file to add the Cartão method — the `Method` type, `priceLabel`/`onlyDigits` helpers, and `submitPayment` function name defined here are reused verbatim by Task 6.

- [ ] **Step 1: Create the checkout page with Pix/Boleto support**

```tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Product = {
  id: string
  slug: string
  title: string
  default_price_cents: number | null
}

type Method = 'pix' | 'boleto' | 'credit_card'

type PixResult = { qrCode: string; qrCodeUrl: string | null; expiresAt: string | null }
type BoletoResult = { url: string; barcode: string; expiresAt: string | null }

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function priceLabel(cents: number | null) {
  if (!cents || cents <= 0) return 'Gratuito'
  return `R$ ${(cents / 100).toFixed(2)}`
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const [product, setProduct] = useState<Product | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(true)
  const [method, setMethod] = useState<Method>('pix')
  const [document, setDocumentValue] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [pix, setPix] = useState<PixResult | null>(null)
  const [boleto, setBoleto] = useState<BoletoResult | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/public/courses')
      .then(r => r.json())
      .then(d => {
        const found = (d.data ?? []).find((c: Product) => c.slug === slug)
        setProduct(found ?? null)
      })
      .finally(() => setLoadingProduct(false))
  }, [slug])

  const startPolling = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/checkout/pagarme/status?orderId=${id}`)
      if (!res.ok) return
      const { data } = await res.json()
      if (data.status === 'paid') {
        if (pollRef.current) clearInterval(pollRef.current)
        router.push('/area')
      }
    }, 4000)
  }, [router])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/checkout/pagarme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: slug,
          method,
          document: onlyDigits(document),
          phone: phone ? onlyDigits(phone) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao gerar pagamento'); return }
      setOrderId(data.data.orderId)
      if (data.data.pix) setPix(data.data.pix)
      if (data.data.boleto) setBoleto(data.data.boleto)
      startPolling(data.data.orderId)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingProduct) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-academy-sand">
        <p className="text-academy-ink">Carregando...</p>
      </main>
    )
  }

  if (!product) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-academy-sand">
        <p className="text-academy-ink">Curso não encontrado.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-academy-sand px-6 py-16">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-academy-ink">{product.title}</h1>
        <p className="mt-1 text-lg font-semibold text-academy-blue">{priceLabel(product.default_price_cents)}</p>

        {orderId && pix ? (
          <div className="mt-8 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <p className="text-sm font-semibold text-academy-ink">Pague com Pix pra liberar o acesso</p>
            {pix.qrCodeUrl && (
              <img src={pix.qrCodeUrl} alt="QR Code Pix" className="mx-auto mt-4 h-56 w-56" />
            )}
            <textarea readOnly value={pix.qrCode} className="mt-4 w-full rounded-lg border border-slate-200 p-2 text-xs" rows={3} />
            <p className="mt-3 text-xs text-slate-500">Aguardando confirmação do pagamento...</p>
          </div>
        ) : orderId && boleto ? (
          <div className="mt-8 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <p className="text-sm font-semibold text-academy-ink">Boleto gerado</p>
            <a
              href={boleto.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-lg bg-academy-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir boleto
            </a>
            <p className="mt-3 break-all text-xs text-slate-500">{boleto.barcode}</p>
            <p className="mt-3 text-xs text-slate-500">Aguardando confirmação do pagamento...</p>
          </div>
        ) : (
          <form onSubmit={submitPayment} className="mt-8 space-y-4 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <div className="flex gap-2">
              {(['pix', 'boleto'] as Method[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                    method === m ? 'border-academy-blue bg-academy-blue/10 text-academy-blue' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m === 'pix' ? 'Pix' : 'Boleto'}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">CPF</label>
              <input
                required
                value={document}
                onChange={e => setDocumentValue(e.target.value)}
                maxLength={14}
                placeholder="000.000.000-00"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Telefone (opcional)</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="11999998888"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
              />
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-academy-blue py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'Gerando pagamento...' : `Pagar ${priceLabel(product.default_price_cents)}`}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds (route `/checkout/[slug]` appears in the build output as dynamic).

- [ ] **Step 3: Manual verification with dev server**

With `npm run dev` running and a valid learner session cookie (log in via `/login` first), visit `/checkout/<slug-of-a-priced-course>`, pick Pix, submit a test CPF (`11144477735`), and confirm a QR code/Pix copy-paste code renders (requires `PAGARME_SECRET_KEY` and recipient env vars to be set — if not configured yet, confirm instead that the request reaches `/api/checkout/pagarme` and returns the expected `500`/`502` from the existing route rather than a client-side crash).

- [ ] **Step 4: Commit**

```bash
git add "src/app/checkout/[slug]/page.tsx"
git commit -m "feat: add Pix/Boleto checkout page"
```

---

### Task 6: Checkout page — Cartão de Crédito

**Files:**
- Modify: `src/app/checkout/[slug]/page.tsx` (created in Task 5)

**Interfaces:**
- Consumes: `Method`, `onlyDigits`, `priceLabel`, `document`/`phone` state, and the `submitPayment` function from Task 5 — this task replaces `submitPayment`'s body and the method-selector/form JSX in place.
- Produces: client-side `tokenizeCard()` helper calling Pagar.me's public tokens endpoint; requires `NEXT_PUBLIC_PAGARME_PUBLIC_KEY` to be set in the environment (Next.js inlines `NEXT_PUBLIC_*` vars at build time — document this requirement, it is not read through `src/lib/env.ts` since that module is server-only).

- [ ] **Step 1: Add the `tokenizeCard` helper above the `CheckoutPage` component**

```tsx
async function tokenizeCard(card: {
  number: string
  holderName: string
  holderDocument: string
  expMonth: string
  expYear: string
  cvv: string
}): Promise<string> {
  const publicKey = process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY
  if (!publicKey) throw new Error('Chave pública do Pagar.me não configurada')

  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: card.number,
        holder_name: card.holderName,
        holder_document: card.holderDocument,
        exp_month: card.expMonth,
        exp_year: card.expYear,
        cvv: card.cvv,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Cartão inválido')
  return data.id as string
}
```

- [ ] **Step 2: Add card-specific state inside `CheckoutPage`**

Add alongside the existing `useState` declarations:

```tsx
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpMonth, setCardExpMonth] = useState('')
  const [cardExpYear, setCardExpYear] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [installments, setInstallments] = useState(1)
```

- [ ] **Step 3: Replace `submitPayment` to branch on method**

Replace the whole function from Task 5 with:

```tsx
  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      let cardToken: string | undefined
      if (method === 'credit_card') {
        cardToken = await tokenizeCard({
          number: onlyDigits(cardNumber),
          holderName: cardHolder,
          holderDocument: onlyDigits(document),
          expMonth: cardExpMonth,
          expYear: cardExpYear,
          cvv: cardCvv,
        })
      }

      const res = await fetch('/api/checkout/pagarme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: slug,
          method,
          document: onlyDigits(document),
          phone: phone ? onlyDigits(phone) : undefined,
          cardToken,
          installments: method === 'credit_card' ? installments : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao processar pagamento'); return }

      if (method === 'credit_card') {
        if (data.data.status === 'paid') {
          router.push('/area')
        } else {
          setError('Pagamento recusado. Confira os dados do cartão e tente novamente.')
        }
        return
      }

      setOrderId(data.data.orderId)
      if (data.data.pix) setPix(data.data.pix)
      if (data.data.boleto) setBoleto(data.data.boleto)
      startPolling(data.data.orderId)
    } catch (submitError) {
      setError((submitError as Error).message)
    } finally {
      setSubmitting(false)
    }
  }
```

- [ ] **Step 4: Add the Cartão button to the method selector**

Replace:

```tsx
              {(['pix', 'boleto'] as Method[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                    method === m ? 'border-academy-blue bg-academy-blue/10 text-academy-blue' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m === 'pix' ? 'Pix' : 'Boleto'}
                </button>
              ))}
```

With:

```tsx
              {(['pix', 'boleto', 'credit_card'] as Method[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                    method === m ? 'border-academy-blue bg-academy-blue/10 text-academy-blue' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m === 'pix' ? 'Pix' : m === 'boleto' ? 'Boleto' : 'Cartão'}
                </button>
              ))}
```

- [ ] **Step 5: Render card fields when `method === 'credit_card'`**

Insert directly after the "Telefone (opcional)" field block and before the `{error && ...}` line:

```tsx
            {method === 'credit_card' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Número do cartão</label>
                  <input
                    required
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    placeholder="0000 0000 0000 0000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Nome impresso no cartão</label>
                  <input
                    required
                    value={cardHolder}
                    onChange={e => setCardHolder(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Mês</label>
                    <input
                      required
                      value={cardExpMonth}
                      onChange={e => setCardExpMonth(e.target.value)}
                      placeholder="MM"
                      maxLength={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Ano</label>
                    <input
                      required
                      value={cardExpYear}
                      onChange={e => setCardExpYear(e.target.value)}
                      placeholder="AAAA"
                      maxLength={4}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">CVV</label>
                    <input
                      required
                      value={cardCvv}
                      onChange={e => setCardCvv(e.target.value)}
                      maxLength={4}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Parcelas</label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
              </>
            )}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Add the env var to local/deployment config**

Add `NEXT_PUBLIC_PAGARME_PUBLIC_KEY=pk_...` to `.env.local` (and to the Coolify/production environment) using the Pagar.me dashboard's public key. Without it, selecting Cartão throws the "Chave pública do Pagar.me não configurada" error from Step 1 instead of silently failing.

- [ ] **Step 8: Commit**

```bash
git add "src/app/checkout/[slug]/page.tsx"
git commit -m "feat: add Cartão de Crédito checkout with client-side tokenization"
```

---

### Task 7: Wire the catalog buy button to checkout

**Files:**
- Modify: `src/components/CourseCatalog.tsx`

**Interfaces:**
- Consumes: `/checkout/[slug]` page from Task 5/6.

- [ ] **Step 1: Replace the "Acessar" link**

Replace:

```tsx
                  <Link
                    href="/login"
                    className="mt-5 rounded-md bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-academy-gold hover:text-white"
                  >
                    Acessar
                  </Link>
```

With:

```tsx
                  <Link
                    href={
                      course.default_price_cents && course.default_price_cents > 0
                        ? `/checkout/${course.slug}`
                        : '/login'
                    }
                    className="mt-5 rounded-md bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-academy-gold hover:text-white"
                  >
                    {course.default_price_cents && course.default_price_cents > 0 ? 'Comprar' : 'Acessar'}
                  </Link>
```

(Free courses — `default_price_cents` null or `0` — keep going straight to `/login`, since `/api/checkout/pagarme` rejects products with no price configured; paid courses go to the new checkout page.)

- [ ] **Step 2: Build and commit**

```bash
npm run build
git add src/components/CourseCatalog.tsx
git commit -m "feat: wire course catalog buy button to Pagar.me checkout"
```

---

### Task 8: Remove the dead Stripe/Connect code path

**Files:**
- Delete: `src/app/api/checkout/[slug]/route.ts`
- Delete: `src/app/api/connect/accounts/[accountId]/onboarding-link/route.ts`
- Delete: `src/app/api/connect/accounts/route.ts`
- Delete: `src/app/api/stripe/checkout-sessions/route.ts`
- Delete: `src/app/api/stripe/products/route.ts`
- Delete: `src/app/api/stripe/webhooks/payments/route.ts`
- Delete: `src/app/api/webhooks/stripe/route.ts`
- Delete: `src/app/checkout/cancel/page.tsx`
- Delete: `src/app/checkout/success/page.tsx`
- Delete: `src/app/connect/refresh/page.tsx`
- Delete: `src/app/connect/return/page.tsx`
- Delete: `src/modules/commerce/schema.ts`
- Delete: `src/modules/commerce/service.ts`
- Delete: `src/modules/connect/schema.ts`
- Delete: `src/modules/connect/service.ts`
- Delete: `src/lib/stripe.ts`
- Modify: `package.json` (drop the `stripe` dependency)

Confirmed by grep before this plan was written: nothing outside this file list imports from `@/lib/stripe`, `@/modules/commerce`, or `@/modules/connect`, and no frontend component links to any of these API routes or pages.

- [ ] **Step 1: Delete the dead files**

```bash
git rm \
  "src/app/api/checkout/[slug]/route.ts" \
  "src/app/api/connect/accounts/[accountId]/onboarding-link/route.ts" \
  "src/app/api/connect/accounts/route.ts" \
  "src/app/api/stripe/checkout-sessions/route.ts" \
  "src/app/api/stripe/products/route.ts" \
  "src/app/api/stripe/webhooks/payments/route.ts" \
  "src/app/api/webhooks/stripe/route.ts" \
  "src/app/checkout/cancel/page.tsx" \
  "src/app/checkout/success/page.tsx" \
  "src/app/connect/refresh/page.tsx" \
  "src/app/connect/return/page.tsx" \
  "src/modules/commerce/schema.ts" \
  "src/modules/commerce/service.ts" \
  "src/modules/connect/schema.ts" \
  "src/modules/connect/service.ts" \
  "src/lib/stripe.ts"
```

- [ ] **Step 2: Remove the `stripe` dependency from `package.json`**

Replace:

```json
    "react-dom": "^19.0.0",
    "stripe": "^18.4.0",
    "zod": "^3.24.1"
```

With:

```json
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
```

- [ ] **Step 3: Reinstall to update the lockfile**

```bash
npm install
```

- [ ] **Step 4: Confirm nothing else references the removed modules**

```bash
grep -rl "from '@/lib/stripe'\|from 'stripe'\|modules/connect\|modules/commerce" src
```

Expected: no output.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: succeeds, and the removed routes/pages no longer appear in the route list.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead Stripe/Connect payment code path"
```

---

## Self-Review Notes

- **Spec coverage:** Palette/fonts → Task 1. Brand copy (all 14 originally identified files + the `blue-800` gradient + `package.json` name, plus the additional standalone "Academy"/"Academy Admin" headings found while pulling exact line numbers) → Task 2. Checkout page with Pix/Boleto/Cartão, status polling, catalog wiring → Tasks 3-7. Dead Stripe/Connect removal (expanded from the spec's list after `npm run build` surfaced two more pages, `src/app/connect/refresh` and `src/app/connect/return`) → Task 8. `ADMIN_EMAIL_DOMAIN` and domain/subdomain change correctly left untouched per spec's "fora de escopo".
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact shell command with expected output.
- **Type consistency:** `Method`, `Product`, `PixResult`, `BoletoResult`, `onlyDigits`, `priceLabel`, `submitPayment`, `startPolling` are defined once in Task 5 and reused with identical names/shapes in Task 6 and Task 7.
