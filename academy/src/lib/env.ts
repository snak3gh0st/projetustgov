import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ACADEMY_APP_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_STREAM_TOKEN: z.string().optional(),
  ADMIN_EMAIL_DOMAIN: z.string().default('projetus.org'),
})

let cachedEnv: z.infer<typeof envSchema> | null = null

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      ACADEMY_APP_URL: process.env.ACADEMY_APP_URL,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      JWT_SECRET: process.env.JWT_SECRET,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_STREAM_TOKEN: process.env.CLOUDFLARE_STREAM_TOKEN,
      ADMIN_EMAIL_DOMAIN: process.env.ADMIN_EMAIL_DOMAIN,
    })
  }

  return cachedEnv
}
