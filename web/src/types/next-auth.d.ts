import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'gestor' | 'vendedor' | 'visualizador'
    } & DefaultSession['user']
  }

  interface User {
    role: 'gestor' | 'vendedor' | 'visualizador'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'gestor' | 'vendedor' | 'visualizador'
  }
}
