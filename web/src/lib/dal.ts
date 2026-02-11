import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { redirect } from 'next/navigation'

export const verifySession = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }
  return {
    isAuth: true,
    userId: session.user.id,
    role: session.user.role as 'gestor' | 'vendedor',
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
    role: session.user.role as 'gestor' | 'vendedor',
    email: session.user.email,
    name: session.user.name
  }
}

// Helper: build vendedor filter clause for leads queries
export function buildVendedorFilter(role: string, userId: string, paramIndex: number) {
  if (role === 'gestor') return { clause: '', params: [], nextIndex: paramIndex }
  return {
    clause: `AND la.vendedor_id = $${paramIndex}`,
    params: [userId],
    nextIndex: paramIndex + 1
  }
}

// Helper: verify vendedor has access to a specific lead
export async function verifyLeadAccess(cnpj: string, userId: string, role: string): Promise<boolean> {
  // Gestor has access to all leads
  if (role === 'gestor') return true

  // Vendedor must have the lead assigned
  const assignments = await query(
    `SELECT 1 FROM lead_assignments WHERE lead_cnpj = $1 AND vendedor_id = $2 LIMIT 1`,
    [cnpj, userId]
  )

  return assignments.length > 0
}
