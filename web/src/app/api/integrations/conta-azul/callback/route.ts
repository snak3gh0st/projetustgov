import { NextRequest, NextResponse } from 'next/server'
import { saveTokensFromCode } from '@/lib/conta-azul/connection'
import { verifyOAuthState } from '@/lib/conta-azul/oauth-state'

export const dynamic = 'force-dynamic'

function adminRedirect(req: NextRequest, params: Record<string, string>) {
  // Behind Coolify's proxy, req.url can contain the internal 0.0.0.0:3000
  // address. Preserve the public origin for the browser-facing redirect.
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin
  const url = new URL('/admin/conta-azul', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')
  const errorDescription = request.nextUrl.searchParams.get('error_description')

  if (error) {
    return adminRedirect(request, {
      error: errorDescription || error,
    })
  }

  if (!code || !state) {
    return adminRedirect(request, { error: 'Missing code or state from Conta Azul' })
  }

  try {
    const payload = verifyOAuthState(state)
    await saveTokensFromCode({ code, userId: payload.u })
    return adminRedirect(request, { connected: '1' })
  } catch (err) {
    console.error('Conta Azul callback error:', err)
    return adminRedirect(request, {
      error: err instanceof Error ? err.message : 'OAuth callback failed',
    })
  }
}
