import { verifySession, canCsm } from '@/lib/dal'
import { redirect } from 'next/navigation'
import CsmComissoesClient from './CsmComissoesClient'

export default async function CsmComissoesPage() {
  const session = await verifySession()
  if (!canCsm(session.role)) {
    redirect('/sem-permissao')
  }
  return <CsmComissoesClient userRole={session.role} userName={session.name ?? null} />
}
