import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao'
    } & DefaultSession['user']
  }

  interface User {
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_execucao' | 'assistente_execucao' | 'coord_prestacao' | 'assistente_prestacao'
  }
}
