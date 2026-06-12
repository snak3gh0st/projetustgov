import { NextRequest, NextResponse } from 'next/server'
import { jsonError } from '@/lib/http'
import { createProductSchema } from '@/modules/commerce/schema'
import { createAcademyProduct } from '@/modules/commerce/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = createProductSchema.safeParse(body)

  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((issue) => issue.message).join(', '), 422)
  }

  const product = await createAcademyProduct({
    stripeAccountId: parsed.data.stripeAccountId,
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description,
    currency: parsed.data.currency,
    unitAmount: parsed.data.unitAmount,
    metadata: parsed.data.metadata,
  })

  return NextResponse.json({ product })
}
