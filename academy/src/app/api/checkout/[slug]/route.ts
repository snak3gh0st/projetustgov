import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { getEnv } from '@/lib/env'
import { query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ok, err } from '@/lib/http'

type Params = { params: Promise<{ slug: string }> }

function getStripe() {
  return new Stripe(getEnv().STRIPE_SECRET_KEY)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const env = getEnv()

  const productRows = await query<{
    id: string; title: string; default_price_cents: number; currency: string
  }>(
    `SELECT id, title, default_price_cents, currency
     FROM education_products WHERE slug = $1 AND status = 'published' LIMIT 1`,
    [slug],
  )
  if (!productRows[0]) return err(404, 'Produto não encontrado')
  const product = productRows[0]
  if (!product.default_price_cents) return err(400, 'Produto sem preço definido')

  const body = await req.json().catch(() => ({}))
  const affiliateCode: string | undefined = body.affiliate_code

  let affiliateId: string | null = null
  let commissionRate = 0
  if (affiliateCode) {
    const affRows = await query<{ id: string; commission_rate: number }>(
      `SELECT id, commission_rate FROM affiliates WHERE code = $1 AND status = 'active' LIMIT 1`,
      [affiliateCode],
    )
    if (affRows[0]) {
      affiliateId = affRows[0].id
      commissionRate = Number(affRows[0].commission_rate)
    }
  }

  const session = await getSession()
  const customerEmail = session?.email ?? body.email

  const baseUrl = env.ACADEMY_APP_URL
  const stripe = getStripe()
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: product.currency.toLowerCase(),
        unit_amount: product.default_price_cents,
        product_data: { name: product.title },
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/checkout/cancel`,
    customer_email: customerEmail,
    metadata: {
      product_id: product.id,
      product_slug: slug,
      affiliate_id: affiliateId ?? '',
      affiliate_code: affiliateCode ?? '',
      commission_rate: String(commissionRate),
    },
  })

  return ok({ url: checkoutSession.url })
}
