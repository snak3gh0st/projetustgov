import Stripe from 'stripe'
import { query } from '@/lib/db'
import { getEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

type AcademyProductRow = {
  id: string
  stripe_account_id: string
  slug: string
  name: string
  description: string | null
  stripe_product_id: string
  stripe_price_id: string
  currency: string
  unit_amount: number
}

type AcademyOrderRow = {
  id: string
  stripe_checkout_session_id: string
}

type CreateAcademyProductInput = {
  stripeAccountId: string
  slug: string
  name: string
  description?: string
  currency: string
  unitAmount: number
  metadata: Record<string, string>
}

export async function createAcademyProduct(input: CreateAcademyProductInput) {
  const stripe = getStripe()
  const existing = await query<AcademyProductRow>(
    `
      SELECT *
      FROM academy.products
      WHERE stripe_account_id = $1 AND slug = $2
    `,
    [input.stripeAccountId, input.slug]
  )

  if (existing[0]) {
    return existing[0]
  }

  const product = await stripe.products.create(
    {
      name: input.name,
      description: input.description,
      default_price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.unitAmount,
      },
      metadata: {
        slug: input.slug,
        ...input.metadata,
      },
    },
    {
      stripeAccount: input.stripeAccountId,
    }
  )

  const rows = await query<AcademyProductRow>(
    `
      INSERT INTO academy.products (
        stripe_account_id,
        slug,
        name,
        description,
        stripe_product_id,
        stripe_price_id,
        currency,
        unit_amount,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [
      input.stripeAccountId,
      input.slug,
      input.name,
      input.description ?? null,
      product.id,
      typeof product.default_price === 'string' ? product.default_price : product.default_price?.id,
      input.currency.toLowerCase(),
      input.unitAmount,
      JSON.stringify(input.metadata),
    ]
  )

  return rows[0]
}

export async function createOneTimeCheckoutSession(input: {
  productId: string
  quantity: number
  customerEmail?: string
  successPath: string
  cancelPath: string
  applicationFeeAmount: number
  metadata: Record<string, string>
}) {
  const stripe = getStripe()
  const productRows = await query<AcademyProductRow>(
    `
      SELECT *
      FROM academy.products
      WHERE id = $1
    `,
    [input.productId]
  )

  const product = productRows[0]
  if (!product) {
    throw new Error(`Product ${input.productId} not found`)
  }

  const successUrl = new URL(input.successPath, getEnv().ACADEMY_APP_URL)
  successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}')

  const cancelUrl = new URL(input.cancelPath, getEnv().ACADEMY_APP_URL)

  const session = await stripe.checkout.sessions.create(
    {
      line_items: [
        {
          price: product.stripe_price_id,
          quantity: input.quantity,
        },
      ],
      mode: 'payment',
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      customer_email: input.customerEmail,
      payment_intent_data: {
        application_fee_amount: input.applicationFeeAmount || undefined,
        metadata: {
          product_id: product.id,
          ...input.metadata,
        },
      },
      metadata: {
        product_id: product.id,
        stripe_account_id: product.stripe_account_id,
        ...input.metadata,
      },
    },
    {
      stripeAccount: product.stripe_account_id,
    }
  )

  const rows = await query<AcademyOrderRow>(
    `
      INSERT INTO academy.orders (
        product_id,
        stripe_account_id,
        stripe_checkout_session_id,
        stripe_customer_email,
        quantity,
        currency,
        unit_amount,
        amount_total,
        status,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9::jsonb)
      RETURNING id, stripe_checkout_session_id
    `,
    [
      product.id,
      product.stripe_account_id,
      session.id,
      input.customerEmail ?? null,
      input.quantity,
      product.currency,
      product.unit_amount,
      session.amount_total ?? product.unit_amount * input.quantity,
      JSON.stringify(input.metadata),
    ]
  )

  return {
    order: rows[0],
    session,
  }
}

export async function markCheckoutCompleted(event: Stripe.Event, session: Stripe.Checkout.Session) {
  await query(
    `
      UPDATE academy.orders
      SET
        status = 'paid',
        stripe_payment_intent_id = $2,
        stripe_customer_id = $3,
        stripe_customer_email = COALESCE($4, stripe_customer_email),
        completed_at = NOW(),
        updated_at = NOW()
      WHERE stripe_checkout_session_id = $1
    `,
    [
      session.id,
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
      session.customer_details?.email ?? null,
    ]
  )
}

export async function markCheckoutFailure(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent

  await query(
    `
      UPDATE academy.orders
      SET status = 'payment_failed', updated_at = NOW()
      WHERE stripe_payment_intent_id = $1
    `,
    [paymentIntent.id]
  )
}

export async function recordWebhookEvent(event: Stripe.Event) {
  await query(
    `
      INSERT INTO academy.webhook_events (
        stripe_event_id,
        stripe_account_id,
        event_type,
        payload
      )
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (stripe_event_id) DO NOTHING
    `,
    [event.id, event.account ?? null, event.type, JSON.stringify(event)]
  )
}

export async function hasProcessedWebhook(stripeEventId: string) {
  const rows = await query<{ exists: boolean }>(
    `
      SELECT true AS exists
      FROM academy.webhook_events
      WHERE stripe_event_id = $1
      LIMIT 1
    `,
    [stripeEventId]
  )

  return Boolean(rows[0]?.exists)
}
