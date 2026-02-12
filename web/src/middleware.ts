import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/auth', '/api/health', '/api/migrate', '/api/setup-crm', '/api/import-spreadsheet', '/api/debug-enrichment']
  const isPublic = publicPaths.some(path => pathname.startsWith(path))

  if (isPublic) {
    return NextResponse.next()
  }

  // Check for NextAuth session cookie
  const sessionToken = request.cookies.get('authjs.session-token') ||
                       request.cookies.get('__Secure-authjs.session-token')

  if (!sessionToken) {
    // No session - redirect to login or return 401 for API routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Has session - redirect away from login if trying to access it
  if (pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
