import { auth } from '@/auth.config'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/auth', '/api/health', '/api/migrate', '/api/setup-crm', '/api/import-spreadsheet']
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
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
