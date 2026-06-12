import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/lib/http'
import { createCheckoutSessionSchema } from '@/modules/commerce/schema'
import { createOneTimeCheckoutSession } from '@/modules/commerce/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = createCheckoutSessionSchema.safeParse(body)

  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((issue) => issue.message).join(', '), 422)
  }

  const { order, session } = await createOneTimeCheckoutSession({
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    customerEmail: parsed.data.customerEmail,
    successPath: parsed.data.successPath,
    cancelPath: parsed.data.cancelPath,
    applicationFeeAmount: parsed.data.applicationFeeAmount,
    metadata: parsed.data.metadata,
  })

  return NextResponse.json({
    order,
    sessionId: session.id,
    url: session.url,
  })
}
