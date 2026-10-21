import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { redirect } from 'next/navigation'
import { touchUserPresence } from '@/lib/user-activity'

import { seesAllLeads, type Role } from '@/lib/roles'

export * from '@/lib/roles'

export const verifySession = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }
  const rows = await query<{ active: boolean }>(
    'SELECT active FROM users WHERE id = $1',
    [session.user.id]
  )
  if (!rows[0]?.active) {
    redirect('/login')
  }
  await touchUserPresence(session.user.id)
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
  const rows = await query<{ active: boolean }>(
    'SELECT active FROM users WHERE id = $1',
    [session.user.id]
  )
  if (!rows[0]?.active) return null
  await touchUserPresence(session.user.id)
  return {
    userId: session.user.id,
    role: session.user.role as Role,
    email: session.user.email,
    name: session.user.name
  }
}

// Helper: verify vendedor has access to a specific lead
export async function verifyLeadAccess(cnpj: string, userId: string, role: string): Promise<boolean> {
  if (seesAllLeads(role)) return true

  // Vendedor and coordenador must have the lead assigned (or be closer)
  const assignments = await query(
    `SELECT 1 FROM vendedor_projetos WHERE cnpj = $1 AND (vendedor_id = $2 OR closer_id = $2) LIMIT 1`,
    [cnpj, userId]
  )

  return assignments.length > 0
}
