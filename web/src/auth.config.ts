import NextAuth, { type NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig

// Edge-compatible auth for middleware (no database dependencies)
export const { auth } = NextAuth(authConfig)
