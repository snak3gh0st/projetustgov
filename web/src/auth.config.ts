import NextAuth, { type NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  providers: [], // Providers added in auth.ts
  session: { strategy: 'jwt' },
  callbacks: {
    // Edge-compatible session callback — exposes role from JWT to middleware
    async session({ session, token }) {
      if (session.user && token) {
        // @ts-expect-error - role is added to token in auth.ts
        session.user.role = token.role
      }
      return session
    },
  },
} satisfies NextAuthConfig

// Edge-compatible auth for middleware (no database dependencies)
export const { auth } = NextAuth(authConfig)
