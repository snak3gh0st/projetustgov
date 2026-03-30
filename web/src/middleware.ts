import { auth } from '@/auth.config'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/auth', '/api/health', '/api/migrate']
  const isPublic = publicPaths.some(path => pathname.startsWith(path))

  if (isPublic) {
    return
  }

  // Check if user is authenticated
  if (!req.auth) {
    // No session - redirect to login or return 401 for API routes
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.redirect(new URL('/login', req.url))
  }

  // Has session - redirect away from login if trying to access it
  if (pathname.startsWith('/login')) {
    return Response.redirect(new URL('/', req.url))
  }

  // ---------------------------------------------------------------------------
  // TGov: strict gestor-only access boundary
  // Middleware check is the HTTP-level gate; page.tsx / API routes add a second
  // layer via verifySession() / getApiSession() for defence in depth.
  // ---------------------------------------------------------------------------
  const isTGovPage = pathname === '/tgov' || pathname.startsWith('/tgov/')
  const isTGovApi = pathname.startsWith('/api/tgov')

  if (isTGovPage || isTGovApi) {
    const role = (req.auth as { user?: { role?: string } })?.user?.role
    if (role !== 'gestor') {
      if (isTGovApi) {
        return Response.json({ error: 'Forbidden: gestor only' }, { status: 403 })
      }
      // Page: return 403 HTML response (not a redirect)
      return new Response(
        '<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><p>Acesso restrito a gestores.</p></body></html>',
        {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      )
    }
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
