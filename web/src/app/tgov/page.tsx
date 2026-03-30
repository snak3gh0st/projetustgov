import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import TGovDashboardClient from './TGovDashboardClient'

export default async function TGovPage() {
  const session = await verifySession()

  // Role guard: gestor and admin may access /tgov
  if (session.role !== 'gestor' && session.role !== 'admin') {
    redirect('/sem-permissao')
  }

  return <TGovDashboardClient userRole={session.role} />
}
