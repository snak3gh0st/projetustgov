import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import CadastroVendedorClient from './CadastroVendedorClient'

export default async function CadastroVendedorPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const { role } = session as { role: string }
  if (role !== 'gestor' && role !== 'adm_produto') redirect('/sem-permissao')

  return <CadastroVendedorClient userRole={role} />
}
