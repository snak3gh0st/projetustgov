import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'
import {
  hasProcessedWebhook,
  markCheckoutCompleted,
  markCheckoutFailure,
  recordWebhookEvent,
} from '@/modules/commerce/service'
import { syncConnectAccountFromStripe } from '@/modules/connect/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const payload = await request.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, getEnv().STRIPE_WEBHOOK_SECRET!)
  } catch (error) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${String(error)}` },
      { status: 400 }
    )
  }

  if (await hasProcessedWebhook(event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      await markCheckoutCompleted(event, event.data.object as Stripe.Checkout.Session)
      break
    }
    case 'payment_intent.payment_failed': {
      await markCheckoutFailure(event)
      break
    }
    case 'account.updated': {
      if (event.account) {
        await syncConnectAccountFromStripe(event.account)
      }
      break
    }
    case 'capability.updated':
    case 'payout.paid':
    case 'payout.failed':
    case 'charge.refunded':
    case 'charge.dispute.created':
      break
    default:
      break
  }

  await recordWebhookEvent(event)

  return NextResponse.json({ received: true })
}
