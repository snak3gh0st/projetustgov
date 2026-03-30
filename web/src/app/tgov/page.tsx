import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import TGovDashboardClient from './TGovDashboardClient'

export default async function TGovPage() {
  const session = await verifySession()

  // Role guard: only gestor may access /tgov
  // The middleware also enforces HTTP 403 for direct requests,
  // but the server component adds a second layer for SSR safety.
  if (session.role !== 'gestor') {
    redirect('/sem-permissao')
  }

  return <TGovDashboardClient userRole={session.role} />
}
