'use server'

import { signIn as nextAuthSignIn, signOut as nextAuthSignOut, auth } from './auth'
import { LoginSchema, CreateVendedorSchema, CreateUsuarioSchema, type LoginInput, type CreateVendedorInput, type CreateUsuarioInput } from './validations'
import { query } from './db'
import * as bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect'
import { AuthError } from 'next-auth'
import { ZodError } from 'zod'
import { ROLE_CAN_CREATE, type Role } from './dal'

export async function login(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  try {
    // Extract and validate form data
    const rawData = {
      email: formData.get('email'),
      password: formData.get('password'),
    }

    const validatedData = LoginSchema.parse(rawData) as LoginInput

    console.log('[LOGIN] Attempting sign-in for:', validatedData.email)

    // Attempt sign-in
    const result = await nextAuthSignIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    })

    console.log('[LOGIN] Sign-in result:', result)

    // Check if sign-in was successful
    if (!result) {
      console.log('[LOGIN] Sign-in failed - no result returned')
      return { error: 'Email ou senha invalidos' }
    }

    // If there's an error in the result
    if (result.error) {
      console.log('[LOGIN] Sign-in failed with error:', result.error)
      return { error: 'Email ou senha invalidos' }
    }

    console.log('[LOGIN] Sign-in successful, redirecting...')
    // If successful, redirect to home
    redirect('/')
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof ZodError) {
      return { error: error.issues[0].message }
    }
    if (error instanceof AuthError) {
      return { error: 'Email ou senha invalidos' }
    }
    console.error('[LOGIN] Unexpected error:', error)
    throw error
  }
}

export async function createVendedor(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  try {
    // Verify session and check if user is gestor
    const session = await auth()

    if (!session?.user || !('role' in session.user) || session.user.role !== 'gestor') {
      return { error: 'Apenas gestores podem criar vendedores' }
    }

    // Extract and validate form data
    const rawData = {
      nome: formData.get('nome'),
      email: formData.get('email'),
      password: formData.get('password'),
    }

    const validatedData = CreateVendedorSchema.parse(rawData) as CreateVendedorInput

    // Check if email already exists
    const existing = await query(
      `SELECT id FROM users WHERE email = $1`,
      [validatedData.email]
    )

    if (existing.length > 0) {
      return { error: 'Email ja cadastrado' }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 10)

    // Insert new vendedor
    await query(
      `INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
      [validatedData.nome, validatedData.email, passwordHash, 'vendedor']
    )

    return { success: true }
  } catch (error) {
    console.error('Create vendedor error:', error)
    if (error instanceof ZodError) {
      // Return the first validation error message
      const firstError = error.issues[0]
      return { error: firstError.message }
    }
    return { error: 'Erro ao criar vendedor' }
  }
}

export async function createUsuario(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  try {
    // Verify session and check if user is gestor
    const session = await auth()

    if (!session?.user || !('role' in session.user)) {
      return { error: 'Sem permissao para criar usuarios' }
    }

    const actorRole = session.user.role as Role
    const creatableRoles = ROLE_CAN_CREATE[actorRole] ?? []
    if (creatableRoles.length === 0) {
      return { error: 'Sem permissao para criar usuarios' }
    }

    const formRole = formData.get('role') as string
    if (!creatableRoles.includes(formRole as Role)) {
      return { error: 'Sem permissao para criar usuarios com este cargo' }
    }

    const assignedRole = formData.get('role') ?? 'vendedor'

    // Extract and validate form data
    const rawData = {
      nome: formData.get('nome'),
      email: formData.get('email'),
      password: formData.get('password'),
      role: assignedRole,
    }

    const validatedData = CreateUsuarioSchema.parse(rawData) as CreateUsuarioInput

    // Check if email already exists
    const existing = await query(
      `SELECT id FROM users WHERE email = $1`,
      [validatedData.email]
    )

    if (existing.length > 0) {
      return { error: 'Email ja cadastrado' }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 10)

    // Insert new user with selected role
    await query(
      `INSERT INTO users (nome, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
      [validatedData.nome, validatedData.email, passwordHash, validatedData.role]
    )

    return { success: true }
  } catch (error) {
    console.error('Create usuario error:', error)
    if (error instanceof ZodError) {
      // Return the first validation error message
      const firstError = error.issues[0]
      return { error: firstError.message }
    }
    return { error: 'Erro ao criar usuario' }
  }
}

export async function logout() {
  await nextAuthSignOut({ redirectTo: '/login' })
}
