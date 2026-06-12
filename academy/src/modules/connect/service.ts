import Stripe from 'stripe'
import { query } from '@/lib/db'
import { getEnv } from '@/lib/env'
import { getStripe } from '@/lib/stripe'

type ConnectAccountRow = {
  id: string
  internal_company_id: string
  stripe_account_id: string
  email: string | null
  company_name: string | null
  country: string
  account_type: string
  details_submitted: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  metadata: Record<string, string>
}

type CreateConnectAccountInput = {
  internalCompanyId: string
  email: string
  country: string
  companyName?: string
  websiteUrl?: string
  supportEmail?: string
  supportUrl?: string
  productDescription?: string
  metadata: Record<string, string>
}

function mapStripeAccount(account: Stripe.Account) {
  return {
    stripeAccountId: account.id,
    email: account.email,
    companyName: account.company?.name ?? null,
    country: account.country,
    accountType: account.type ?? 'standard',
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    metadata: account.metadata,
  }
}

async function upsertConnectAccount(
  input: CreateConnectAccountInput,
  account: Stripe.Account
) {
  const mapped = mapStripeAccount(account)

  const rows = await query<ConnectAccountRow>(
    `
      INSERT INTO academy.connect_accounts (
        internal_company_id,
        stripe_account_id,
        email,
        company_name,
        country,
        account_type,
        details_submitted,
        charges_enabled,
        payouts_enabled,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (stripe_account_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        company_name = EXCLUDED.company_name,
        country = EXCLUDED.country,
        account_type = EXCLUDED.account_type,
        details_submitted = EXCLUDED.details_submitted,
        charges_enabled = EXCLUDED.charges_enabled,
        payouts_enabled = EXCLUDED.payouts_enabled,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `,
    [
      input.internalCompanyId,
      mapped.stripeAccountId,
      mapped.email,
      mapped.companyName,
      mapped.country,
      mapped.accountType,
      mapped.detailsSubmitted,
      mapped.chargesEnabled,
      mapped.payoutsEnabled,
      JSON.stringify(mapped.metadata),
    ]
  )

  return rows[0]
}

export async function createConnectedCompany(input: CreateConnectAccountInput) {
  const stripe = getStripe()

  const account = await stripe.accounts.create({
    type: 'standard',
    country: input.country,
    email: input.email,
    business_type: 'company',
    company: input.companyName
      ? {
          name: input.companyName,
        }
      : undefined,
    business_profile: {
      name: input.companyName,
      url: input.websiteUrl,
      product_description: input.productDescription,
      support_email: input.supportEmail,
      support_url: input.supportUrl,
    },
    metadata: {
      internal_company_id: input.internalCompanyId,
      ...input.metadata,
    },
  })

  const stored = await upsertConnectAccount(input, account)
  return { account, stored }
}

export async function createConnectOnboardingLink(
  stripeAccountId: string,
  refreshPath: string,
  returnPath: string
) {
  const stripe = getStripe()
  const url = new URL(refreshPath, getEnv().ACADEMY_APP_URL)
  const returnUrl = new URL(returnPath, getEnv().ACADEMY_APP_URL)

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: url.toString(),
    return_url: returnUrl.toString(),
    type: 'account_onboarding',
  })

  await query(
    `
      UPDATE academy.connect_accounts
      SET last_onboarding_link_created_at = NOW(), updated_at = NOW()
      WHERE stripe_account_id = $1
    `,
    [stripeAccountId]
  )

  return link
}

export async function getConnectAccountByStripeId(stripeAccountId: string) {
  const rows = await query<ConnectAccountRow>(
    `SELECT * FROM academy.connect_accounts WHERE stripe_account_id = $1`,
    [stripeAccountId]
  )

  return rows[0] ?? null
}

export async function listConnectAccounts() {
  return query<ConnectAccountRow>(
    `
      SELECT *
      FROM academy.connect_accounts
      ORDER BY created_at DESC
    `
  )
}

export async function syncConnectAccountFromStripe(stripeAccountId: string) {
  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(stripeAccountId)
  const existing = await getConnectAccountByStripeId(stripeAccountId)

  if (!existing) {
    throw new Error(`Connected account ${stripeAccountId} not found locally`)
  }

  const stored = await upsertConnectAccount(
    {
      internalCompanyId: existing.internal_company_id,
      email: existing.email ?? account.email ?? '',
      companyName: existing.company_name ?? account.company?.name ?? undefined,
      country: existing.country,
      metadata: existing.metadata ?? {},
    },
    account
  )

  return { account, stored }
}
