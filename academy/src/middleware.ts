import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return new TextEncoder().encode(secret)
}

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Admin routes
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = req.cookies.get('academy_admin_session')?.value
    if (!token || !(await verifyToken(token))) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  }

  // Learner protected routes
  if (pathname.startsWith('/area') || pathname.startsWith('/minha-conta') || pathname.startsWith('/checkout')) {
    const token = req.cookies.get('academy_session')?.value
    if (!token || !(await verifyToken(token))) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/area/:path*', '/minha-conta/:path*', '/checkout/:path*'],
}
