import { redirect } from 'next/navigation'
import { verifySession, ROLE_CAN_CREATE, type Role } from '@/lib/dal'
import CadastroVendedorClient from './CadastroVendedorClient'

export default async function CadastroVendedorPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const { role } = session as { role: string }
  const USERS_PAGE_ROLES = ['gestor', 'admin', 'adm_produto', 'coord_aprovacao', 'assistente_aprovacao', 'coord_execucao', 'coord_prestacao']
  if (!USERS_PAGE_ROLES.includes(role)) redirect('/sem-permissao')

  const creatableRoles = ROLE_CAN_CREATE[role as Role] ?? []

  return <CadastroVendedorClient userRole={role} creatableRoles={creatableRoles} />
}
