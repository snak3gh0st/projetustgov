import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'gestor' | 'vendedor' | 'visualizador' | 'gestor_vendedor'
    } & DefaultSession['user']
  }

  interface User {
    role: 'gestor' | 'vendedor' | 'visualizador' | 'gestor_vendedor'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'gestor' | 'vendedor' | 'visualizador' | 'gestor_vendedor'
  }
}
