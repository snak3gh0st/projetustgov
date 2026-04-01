import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import TGovDashboardClient from './TGovDashboardClient'

export default async function TGovPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const session = await verifySession()

  // Role guard: gestor, admin and adm_produto may access /tgov
  if (session.role !== 'gestor' && session.role !== 'admin' && session.role !== 'adm_produto') {
    redirect('/sem-permissao')
  }

  const { view } = await searchParams
  const resolvedView = view === 'dashboard' ? 'dashboard' : 'pipeline'

  return <TGovDashboardClient userRole={session.role} view={resolvedView} />
}
