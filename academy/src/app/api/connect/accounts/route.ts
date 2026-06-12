import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/lib/http'
import { createConnectedCompany, createConnectOnboardingLink, listConnectAccounts } from '@/modules/connect/service'
import { createConnectAccountSchema } from '@/modules/connect/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  const accounts = await listConnectAccounts()
  return NextResponse.json({ accounts })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = createConnectAccountSchema.safeParse(body)

  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((issue) => issue.message).join(', '), 422)
  }

  const data = parsed.data

  const { account, stored } = await createConnectedCompany({
    internalCompanyId: data.internalCompanyId,
    email: data.email,
    country: data.country.toUpperCase(),
    companyName: data.companyName,
    websiteUrl: data.websiteUrl,
    supportEmail: data.supportEmail,
    supportUrl: data.supportUrl,
    productDescription: data.productDescription,
    metadata: data.metadata,
  })

  const onboarding = data.createOnboardingLink
    ? await createConnectOnboardingLink(account.id, '/connect/refresh', '/connect/return')
    : null

  return NextResponse.json({
    account,
    stored,
    onboardingUrl: onboarding?.url ?? null,
  })
}
