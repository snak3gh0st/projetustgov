import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { getEnv } from '@/lib/env'
import { query, withTransaction } from '@/lib/db'

export const dynamic = 'force-dynamic'

function stripe() {
  return new Stripe(getEnv().STRIPE_SECRET_KEY)
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(body, sig, getEnv().STRIPE_WEBHOOK_SECRET)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  // Idempotency guard using academy.webhook_events
  const already = await query(
    `SELECT 1 FROM academy.webhook_events WHERE stripe_event_id = $1 LIMIT 1`,
    [event.id],
  ).catch(() => [])
  if ((already as unknown[]).length > 0) return new Response('{"ok":true,"dup":true}', { status: 200 })

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
  }

  await query(
    `INSERT INTO academy.webhook_events (stripe_event_id, event_type, payload)
     VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`,
    [event.id, event.type, JSON.stringify(event)],
  ).catch(() => null)

  return new Response('{"ok":true}', { status: 200 })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {}
  const productId = meta.product_id
  const customerEmail = session.customer_details?.email ?? session.customer_email
  if (!productId || !customerEmail) return

  const affiliateId = meta.affiliate_id || null
  const affiliateCode = meta.affiliate_code || null
  const commissionRate = parseFloat(meta.commission_rate ?? '0')
  const amountTotal = session.amount_total ?? 0
  const currency = (session.currency ?? 'brl').toUpperCase()

  await withTransaction(async (client) => {
    // Upsert learner
    const learnerRes = await client.query<{ id: string }>(
      `INSERT INTO learners (email, name, password_hash, status)
       VALUES ($1,$2,'stripe_purchase_no_password','active')
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [customerEmail, session.customer_details?.name ?? customerEmail.split('@')[0]],
    )
    const learnerId = learnerRes.rows[0].id

    // Create order record
    const orderRes = await client.query<{ id: string }>(
      `INSERT INTO orders
         (product_id, learner_id, affiliate_id, affiliate_code, status,
          currency, subtotal_cents, total_cents, paid_total_cents,
          gateway_provider, gateway_order_id, source_context, approved_at)
       VALUES ($1,$2,$3,$4,'paid',$5,$6,$6,$6,'stripe',$7,'education',NOW())
       RETURNING id`,
      [productId, learnerId, affiliateId, affiliateCode, currency, amountTotal, session.id],
    )
    const orderId = orderRes.rows[0].id

    // Enroll learner
    await client.query(
      `INSERT INTO education_enrollments
         (product_id, learner_email, learner_name, learner_id, order_id, status, enrolled_at)
       VALUES ($1,$2,$3,$4,$5,'active',NOW())
       ON CONFLICT (product_id, cohort_id, learner_email)
       DO UPDATE SET status = 'active', learner_id = $4, order_id = $5, updated_at = NOW()`,
      [productId, customerEmail, session.customer_details?.name ?? null, learnerId, orderId],
    )

    // Commission
    if (affiliateId && commissionRate > 0) {
      const commissionCents = Math.round(amountTotal * commissionRate / 100)
      await client.query(
        `INSERT INTO affiliate_commissions
           (affiliate_id, order_id, order_total_cents, rate, commission_cents, status)
         VALUES ($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING`,
        [affiliateId, orderId, amountTotal, commissionRate, commissionCents],
      )
    }
  })
}
