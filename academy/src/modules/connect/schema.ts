import { z } from 'zod'

export const createConnectAccountSchema = z.object({
  internalCompanyId: z.string().min(1),
  email: z.string().email(),
  country: z.string().length(2).default('BR'),
  companyName: z.string().min(1).optional(),
  websiteUrl: z.string().url().optional(),
  supportEmail: z.string().email().optional(),
  supportUrl: z.string().url().optional(),
  productDescription: z.string().min(1).optional(),
  createOnboardingLink: z.boolean().default(true),
  metadata: z.record(z.string()).default({}),
})

export const createOnboardingLinkSchema = z.object({
  refreshPath: z.string().default('/connect/refresh'),
  returnPath: z.string().default('/connect/return'),
})
