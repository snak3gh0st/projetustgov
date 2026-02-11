import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = nextUrl.pathname.startsWith('/login')
      const isPublicApi = ['/api/auth', '/api/health', '/api/migrate'].some(
        route => nextUrl.pathname.startsWith(route)
      )

      // Allow public API routes
      if (isPublicApi) return true

      // Redirect logged-in users away from login page
      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl))
      }

      // Allow login page for non-logged-in users
      if (isOnLogin) return true

      // Require auth for all other routes
      return isLoggedIn
    },
  },
  providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig
