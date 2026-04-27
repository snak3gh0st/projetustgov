import { verifySession, canCsm } from '@/lib/dal'
import { redirect } from 'next/navigation'
import CsmDashboardClient from './CsmDashboardClient'

export default async function CsmPage() {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  return <CsmDashboardClient userRole={session.role} userName={session.name ?? null} />
}
