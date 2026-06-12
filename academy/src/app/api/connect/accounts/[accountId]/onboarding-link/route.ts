import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/lib/http'
import { createOnboardingLinkSchema } from '@/modules/connect/schema'
import { createConnectOnboardingLink, getConnectAccountByStripeId } from '@/modules/connect/service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await context.params
  const existing = await getConnectAccountByStripeId(accountId)

  if (!existing) {
    return jsonError(`Connected account ${accountId} not found`, 404)
  }

  const body = await request.json().catch(() => ({}))
  const parsed = createOnboardingLinkSchema.safeParse(body)

  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((issue) => issue.message).join(', '), 422)
  }

  const link = await createConnectOnboardingLink(
    accountId,
    parsed.data.refreshPath,
    parsed.data.returnPath
  )

  return NextResponse.json({
    accountId,
    onboardingUrl: link.url,
    expiresAt: link.expires_at,
  })
}
