import { NextResponse } from 'next/server'
import { canManageContaAzul, getApiSession } from '@/lib/dal'
import { buildAuthorizeUrl } from '@/lib/conta-azul/oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getApiSession()
    if (!session || !canManageContaAzul(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { url } = buildAuthorizeUrl(session.userId)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Conta Azul connect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start OAuth' },
      { status: 500 }
    )
  }
}
