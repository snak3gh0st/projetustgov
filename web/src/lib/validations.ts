import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Senha deve ter ao menos 8 caracteres' }),
})

export const CreateVendedorSchema = z.object({
  nome: z.string().min(2, { message: 'Nome deve ter ao menos 2 caracteres' }),
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Senha deve ter ao menos 8 caracteres' }),
})

export const CreateUsuarioSchema = z.object({
  nome: z.string().min(2, { message: 'Nome deve ter ao menos 2 caracteres' }),
  email: z.string().email({ message: 'Email invalido' }),
  password: z.string().min(8, { message: 'Senha deve ter ao menos 8 caracteres' }),
  role: z.enum(['vendedor', 'visualizador', 'gestor_vendedor']).default('vendedor'),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type CreateVendedorInput = z.infer<typeof CreateVendedorSchema>
export type CreateUsuarioInput = z.infer<typeof CreateUsuarioSchema>
