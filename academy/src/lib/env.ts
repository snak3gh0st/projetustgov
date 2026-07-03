import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ACADEMY_APP_URL: z.string().url(),
  PAGARME_SECRET_KEY: z.string().optional(),
  PAGARME_WEBHOOK_SECRET: z.string().optional(),
  PAGARME_SIGMA_RECIPIENT_ID: z.string().optional(),
  PAGARME_ACADEMY_RECIPIENT_ID: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),
  ADMIN_EMAIL_DOMAIN: z.string().default('projetus.org'),
})

let cachedEnv: z.infer<typeof envSchema> | null = null

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      ACADEMY_APP_URL: process.env.ACADEMY_APP_URL,
      PAGARME_SECRET_KEY: process.env.PAGARME_SECRET_KEY,
      PAGARME_WEBHOOK_SECRET: process.env.PAGARME_WEBHOOK_SECRET,
      PAGARME_SIGMA_RECIPIENT_ID: process.env.PAGARME_SIGMA_RECIPIENT_ID,
      PAGARME_ACADEMY_RECIPIENT_ID: process.env.PAGARME_ACADEMY_RECIPIENT_ID,
      JWT_SECRET: process.env.JWT_SECRET,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
      ADMIN_EMAIL_DOMAIN: process.env.ADMIN_EMAIL_DOMAIN,
    })
  }

  return cachedEnv
}
