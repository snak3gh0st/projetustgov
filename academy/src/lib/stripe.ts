import Stripe from 'stripe'
import { getEnv } from '@/lib/env'

let client: Stripe | null = null

export function getStripe() {
  if (!client) {
    client = new Stripe(getEnv().STRIPE_SECRET_KEY)
  }

  return client
}
