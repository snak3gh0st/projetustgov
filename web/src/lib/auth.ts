import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import * as bcrypt from 'bcrypt'
import { query } from './db'
import { CRMUser } from './types'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Query user from database
        const users = await query<CRMUser & { password_hash: string }>(
          `SELECT id, nome, email, role, active, password_hash FROM users WHERE email = $1`,
          [credentials.email as string]
        )

        const user = users[0]

        if (!user || !user.active) {
          return null
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        )

        if (!passwordMatch) {
          return null
        }

        // Return user object (without password_hash)
        return {
          id: user.id,
          name: user.nome,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, copy user.id and user.role to token
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: 'gestor' | 'vendedor' }).role
      }
      return token
    },
    async session({ session, token }) {
      // Copy token.id and token.role to session.user
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'gestor' | 'vendedor'
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})
