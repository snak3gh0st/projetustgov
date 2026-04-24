import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { redirect } from 'next/navigation'

export type Role = 'gestor' | 'admin' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto' | 'csm' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista' | 'coord_prestacao' | 'assistente_prestacao'

/** Who can create/manage users of which roles. Single source of truth. */
export const ROLE_CAN_CREATE: Partial<Record<Role, Role[]>> = {
  gestor:               ['admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: ['projetista'],
  coord_prestacao:      ['assistente_prestacao'],
}

/** Same as create - who can delete users of which roles. */
export const ROLE_CAN_DELETE: Partial<Record<Role, Role[]>> = {
  gestor:               ['admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_prestacao', 'assistente_prestacao'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: [],
  coord_prestacao:      ['assistente_prestacao'],
  assistente_prestacao: [],
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_CAN_CREATE[actorRole]?.includes(targetRole) ?? false
}

export const verifySession = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }
  return {
    isAuth: true,
    userId: session.user.id,
    role: session.user.role as Role,
    email: session.user.email,
    name: session.user.name
  }
})

// Helper: get auth for API routes (returns null instead of redirect)
export async function getApiSession() {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    userId: session.user.id,
    role: session.user.role as Role,
    email: session.user.email,
    name: session.user.name
  }
}

// Helper: check if role acts as a seller (receives leads, earns commissions)
export function isSeller(role: string): boolean {
  return role === 'vendedor' || role === 'coordenador'
}

// Helper: build vendedor filter clause for leads queries
export function buildVendedorFilter(role: string, userId: string, paramIndex: number) {
  // Gestor and visualizador see all leads
  if (role === 'gestor' || role === 'visualizador') {
    return { clause: '', params: [], nextIndex: paramIndex }
  }
  // Vendedor and coordenador see only their assigned leads
  return {
    clause: `AND la.vendedor_id = $${paramIndex}`,
    params: [userId],
    nextIndex: paramIndex + 1
  }
}

// Helper: check if user can modify data (write permissions)
export function canModifyData(role: string): boolean {
  return role === 'gestor' || role === 'vendedor' || role === 'coordenador'
}

/** TGov reads (aprovação, execução, busca-cnpj, whitelist GET, interaction GET, comments GET). */
export function canReadTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto' || role === 'csm'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** TGov mutations privilegiadas (whitelist write, interaction PATCH, tecnico assignment). NÃO inclui CSM nem projetista. */
export function canWriteTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

/** Quem pode escrever comentários TGov (inclui CSM, coord_aprovacao, projetista). */
export function canCommentTgov(role: string | undefined): boolean {
  return role === 'gestor' || role === 'admin' || role === 'adm_produto' || role === 'csm'
      || role === 'coord_aprovacao' || role === 'assistente_aprovacao' || role === 'projetista'
      || role === 'coord_prestacao' || role === 'assistente_prestacao'
}

// Helper: check if user has admin-level access (full control)
export function isAdmin(role: string): boolean {
  return role === 'gestor'
}

/**
 * Contact CSV export gate — admin-tier only.
 * Only users with role 'gestor' or 'admin' may download bulk contact data
 * (email/telefone/nome_pessoa) across leads.
 * DO NOT loosen this without explicit product approval — see
 * .planning/quick/260414-jby-exportar-contatos-qualquer-uma-somente-p/.
 */
export function canExportContacts(role: string | undefined | null): boolean {
  return role === 'gestor' || role === 'admin'
}

// Helper: verify vendedor has access to a specific lead
export async function verifyLeadAccess(cnpj: string, userId: string, role: string): Promise<boolean> {
  // Gestor and visualizador have access to all leads
  if (role === 'gestor' || role === 'visualizador') return true

  // Vendedor and coordenador must have the lead assigned (or be closer)
  const assignments = await query(
    `SELECT 1 FROM vendedor_projetos WHERE cnpj = $1 AND (vendedor_id = $2 OR closer_id = $2) LIMIT 1`,
    [cnpj, userId]
  )

  return assignments.length > 0
}
