import { z } from 'zod'

export const createProductSchema = z.object({
  stripeAccountId: z.string().startsWith('acct_'),
  slug: z.string().min(1).max(120),
  name: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().length(3),
  unitAmount: z.number().int().positive(),
  metadata: z.record(z.string()).default({}),
})

export const createCheckoutSessionSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  customerEmail: z.string().email().optional(),
  successPath: z.string().default('/checkout/success'),
  cancelPath: z.string().default('/checkout/cancel'),
  applicationFeeAmount: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string()).default({}),
})
