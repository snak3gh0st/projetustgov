import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public routes
  const publicRoutes = ['/login', '/api/auth', '/api/health', '/api/migrate']
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    // If logged in and trying to access login, redirect to home
    if (isLoggedIn && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Gestor-only routes
  const gestorRoutes = ['/cadastro-vendedor', '/api/admin']
  if (gestorRoutes.some(route => pathname.startsWith(route))) {
    if ((req.auth?.user as any)?.role !== 'gestor') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
