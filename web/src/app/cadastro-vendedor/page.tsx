import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import CadastroVendedorClient from './CadastroVendedorClient'

export default async function CadastroVendedorPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const { role } = session as { role: string }
  const USERS_PAGE_ROLES = ['gestor', 'admin', 'adm_produto', 'coord_aprovacao', 'assistente_aprovacao']
  if (!USERS_PAGE_ROLES.includes(role)) redirect('/sem-permissao')

  return <CadastroVendedorClient userRole={role} />
}
